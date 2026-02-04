let currentUserId = null;
let currentViewDate = 'today';

async function initTimeline() {
    const user = await fetchJSON('/api/current-user');
    currentUserId = user.id;
    document.getElementById('timeline-username').textContent = user.name;
    
    initGrid();
    loadTimeline(currentUserId, 'today');
    loadFriendButtons();

    // Date picker listener
    document.getElementById('custom-date-picker').addEventListener('change', (e) => {
        loadTimeline(currentUserId, e.target.value);
        setActiveDateBtn(null); // Clear buttons
    });
}

function initGrid() {
    const grid = document.getElementById('timeline-grid');
    grid.innerHTML = '';
    
    const hours = [
        "12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", 
        "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM",
        "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM",
        "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM"
    ];

    hours.forEach((h, index) => {
        const div = document.createElement('div');
        div.className = 'timeline-hour';
        div.dataset.hour = index;
        div.innerHTML = `
            <div class="hour-label">${h}</div>
            <div class="hour-bar"></div>
        `;
        grid.appendChild(div);
    });
}

async function loadTimeline(userId, dateLabel) {
    let dateStr = dateLabel;
    
    if (dateLabel === 'today') {
        dateStr = new Date().toISOString().split('T')[0];
    } else if (dateLabel === 'yesterday') {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        dateStr = d.toISOString().split('T')[0];
    }
    
    // Update active user in header if we are viewing friend
    // (Simulated logic, ideally we fetch user name by ID)
    
    const sessions = await fetchJSON(`/api/timeline/${userId}/date/${dateStr}`);
    renderSessions(sessions);
    updateSummary(sessions);
}

function renderSessions(sessions) {
    // Clear bars
    document.querySelectorAll('.hour-bar').forEach(b => b.innerHTML = '');

    sessions.forEach(session => {
        const startTime = new Date(session.started_at);
        // Default duration if ongoing: from start to now
        let durationMinutes = session.duration_minutes;
        if (!durationMinutes && !session.ended_at) {
             durationMinutes = Math.floor((Date.now() - startTime) / 60000);
        }
        if (!durationMinutes) durationMinutes = 1; // Minimum visibility

        const startHour = startTime.getHours();
        const startMinute = startTime.getMinutes();
        
        let remainingMinutes = durationMinutes;
        let currentHour = startHour;
        let startOffset = startMinute; // 1 min = 1px approximately based on CSS logic usually, but here we use pixel mapping

        // CSS: height is pixels. Row is 60px. 1 min = 1px.
        
        while (remainingMinutes > 0 && currentHour < 24) {
            const availableInThisHour = 60 - startOffset;
            const minutesInThisBlock = Math.min(remainingMinutes, availableInThisHour);
            
            const block = document.createElement('div');
            block.className = `task-block ${session.subject ? session.subject.toLowerCase() : ''}`;
            block.style.top = `${startOffset}px`;
            block.style.height = `${minutesInThisBlock}px`;
            
            // Only show content on first block
            if (currentHour === startHour) {
                block.innerHTML = `
                    <div class="task-block-content">
                        <div class="task-name">${session.task_name}</div>
                        <div class="task-duration">${formatDuration(durationMinutes)}</div>
                    </div>
                `;
            } else {
                 block.innerHTML = `<div class="task-block-content"><div class="task-name">...</div></div>`;
            }

            const hourRow = document.querySelector(`.timeline-hour[data-hour="${currentHour}"] .hour-bar`);
            if (hourRow) hourRow.appendChild(block);

            remainingMinutes -= minutesInThisBlock;
            currentHour++;
            startOffset = 0; // Next blocks start at top of hour
        }
    });
}

function updateSummary(sessions) {
    let totalMins = 0;
    const taskSet = new Set();
    
    sessions.forEach(s => {
        let dur = s.duration_minutes;
        if (!dur && !s.ended_at) dur = Math.floor((Date.now() - new Date(s.started_at))/60000);
        totalMins += (dur || 0);
        taskSet.add(s.task_id);
    });

    document.getElementById('total-time').textContent = formatDuration(totalMins);
    document.getElementById('total-tasks').textContent = taskSet.size;
}

async function loadFriendButtons() {
    const users = await fetchJSON('/api/users');
    const container = document.getElementById('friend-buttons');
    container.innerHTML = '';
    
    users.forEach(u => {
        if (u.id === currentUserId) return; // Skip self
        const btn = document.createElement('button');
        btn.className = 'btn-view-timeline';
        btn.textContent = `View ${u.name}'s Timeline`;
        btn.onclick = () => {
            document.getElementById('timeline-username').textContent = u.name;
            loadTimeline(u.id, 'today');
            setActiveDateBtn(document.querySelector('[data-date="today"]'));
        };
        container.appendChild(btn);
    });
}

// Date nav
document.querySelectorAll('.date-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setActiveDateBtn(btn);
        loadTimeline(currentUserId, btn.dataset.date);
        // Reset name to self if viewing timeline via date nav (optional UX choice)
    });
});

function setActiveDateBtn(activeBtn) {
    document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
}

initTimeline();