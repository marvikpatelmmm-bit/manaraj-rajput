const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Database Setup
const dbPath = path.resolve(__dirname, 'jee_study.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tasks Table
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        task_name TEXT NOT NULL,
        subject TEXT,
        estimated_minutes INTEGER NOT NULL,
        actual_minutes INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        started_at DATETIME,
        completed_at DATETIME,
        task_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Active Sessions (For Real-time status)
    db.run(`CREATE TABLE IF NOT EXISTS active_sessions (
        user_id INTEGER PRIMARY KEY,
        active_task_id INTEGER,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (active_task_id) REFERENCES tasks(id)
    )`);

    // TIMELINE: Task Sessions Table
    db.run(`CREATE TABLE IF NOT EXISTS task_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        started_at DATETIME NOT NULL,
        ended_at DATETIME,
        duration_minutes INTEGER,
        session_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
    )`);

    // Indices
    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON task_sessions(user_id, session_date)`);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'jee_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// --- AUTH ROUTES ---

app.post('/api/register', async (req, res) => {
    const { username, password, name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, name) VALUES (?, ?, ?)', 
            [username, hashedPassword, name], 
            function(err) {
                if (err) return res.status(400).json({ error: 'Username already exists' });
                req.session.userId = this.lastID;
                req.session.name = name;
                res.json({ success: true, userId: this.lastID });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'User not found' });
        
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.userId = user.id;
            req.session.name = user.name;
            res.json({ success: true, userId: user.id });
        } else {
            res.status(400).json({ error: 'Invalid password' });
        }
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/current-user', requireAuth, (req, res) => {
    res.json({ id: req.session.userId, name: req.session.name });
});

// --- TASK ROUTES ---

app.get('/api/tasks/today', requireAuth, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.all('SELECT * FROM tasks WHERE user_id = ? AND task_date = ?', [req.session.userId, today], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tasks/add', requireAuth, (req, res) => {
    const { task_name, subject, estimated_minutes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    db.run('INSERT INTO tasks (user_id, task_name, subject, estimated_minutes, task_date) VALUES (?, ?, ?, ?, ?)',
        [req.session.userId, task_name, subject, estimated_minutes, today],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

// --- TIMELINE & SESSION MANAGEMENT LOGIC ---

// Helper to close a session
const closeActiveSession = (userId, dateStr) => {
    return new Promise((resolve, reject) => {
        // Find open session
        db.get('SELECT * FROM task_sessions WHERE user_id = ? AND ended_at IS NULL', [userId], (err, session) => {
            if (err) return reject(err);
            if (!session) return resolve(false);

            const now = new Date();
            const start = new Date(session.started_at);
            const duration = Math.round((now - start) / 60000); // minutes

            db.run('UPDATE task_sessions SET ended_at = ?, duration_minutes = ? WHERE id = ?', 
                [now.toISOString(), duration, session.id], 
                (err) => {
                    if (err) return reject(err);
                    resolve(true);
                }
            );
        });
    });
};

app.post('/api/timeline/session/start', requireAuth, async (req, res) => {
    const { task_id } = req.body;
    const userId = req.session.userId;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    try {
        // 1. Auto-stop any active session
        const previousEnded = await closeActiveSession(userId, today);
        
        // 2. Stop any task in tasks table marked as in_progress
        db.run("UPDATE tasks SET status = 'paused' WHERE user_id = ? AND status = 'in_progress'", [userId]);

        // 3. Start new task status
        db.run("UPDATE tasks SET status = 'in_progress', started_at = ? WHERE id = ?", [now, task_id]);

        // 4. Create new timeline session
        db.run('INSERT INTO task_sessions (user_id, task_id, started_at, session_date) VALUES (?, ?, ?, ?)',
            [userId, task_id, now, today],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                // 5. Update Active Sessions table for Live Feed
                db.run('INSERT OR REPLACE INTO active_sessions (user_id, active_task_id, last_seen) VALUES (?, ?, ?)',
                    [userId, task_id, now]);

                res.json({ session_id: this.lastID, previous_session_ended: previousEnded });
            }
        );

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/timeline/session/stop', requireAuth, async (req, res) => {
    const { session_id, reason } = req.body; // reason ignored for simple logic
    const userId = req.session.userId;
    const now = new Date();

    // End session
    db.get('SELECT started_at FROM task_sessions WHERE id = ?', [session_id], (err, row) => {
        if (err || !row) return res.status(400).json({error: "Session not found"});
        
        const duration = Math.round((now - new Date(row.started_at)) / 60000);
        
        db.run('UPDATE task_sessions SET ended_at = ?, duration_minutes = ? WHERE id = ?',
            [now.toISOString(), duration, session_id],
            (err) => {
                if(err) return res.status(500).json({error: err.message});
                
                // Update task status to paused
                db.run("UPDATE tasks SET status = 'paused' WHERE id = (SELECT task_id FROM task_sessions WHERE id = ?)", [session_id]);
                // Clear active session
                db.run("DELETE FROM active_sessions WHERE user_id = ?", [userId]);
                
                res.json({ success: true, duration });
            }
        );
    });
});

app.post('/api/tasks/:id/complete', requireAuth, async (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.userId;
    const now = new Date();
    const today = new Date().toISOString().split('T')[0];

    // Close session logic inline here for simplicity or reuse closeActiveSession
    await closeActiveSession(userId, today);

    // Update Task
    db.run("UPDATE tasks SET status = 'completed_ontime', completed_at = ? WHERE id = ?", [now.toISOString(), taskId], (err) => {
        if(err) return res.status(500).json({error: err.message});
        
        // Remove from active
        db.run("DELETE FROM active_sessions WHERE user_id = ?", [userId]);
        res.json({success: true});
    });
});

// --- TIMELINE DATA ROUTES ---

app.get('/api/timeline/:userId/date/:date', requireAuth, (req, res) => {
    const { userId, date } = req.params;
    
    const query = `
        SELECT ts.*, t.task_name, t.subject 
        FROM task_sessions ts
        JOIN tasks t ON ts.task_id = t.id
        WHERE ts.user_id = ? AND ts.session_date = ?
        ORDER BY ts.started_at ASC
    `;

    db.all(query, [userId, date], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- LIVE FEED & USERS ---
app.get('/api/users', requireAuth, (req, res) => {
    db.all("SELECT id, name FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.get('/api/feed/active', requireAuth, (req, res) => {
    const query = `
        SELECT u.id, u.name, t.task_name, t.subject, t.started_at
        FROM active_sessions as_
        JOIN users u ON as_.user_id = u.id
        JOIN tasks t ON as_.active_task_id = t.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

// Basic Setup
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard.html');
    } else {
        res.redirect('/index.html');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});