let activeTimerInterval;
let activeStartTime;
let activeTaskId = null;

async function initDashboard() {
    loadTasks();
    loadActiveFeed();
    checkCurrentUser();
    
    // Poll for live feed
    setInterval(loadActiveFeed, 5000);
}

async function checkCurrentUser() {
    const user = await fetchJSON('/api/current-user');
    if(user && user.id) {
        // We could store user id in a global var if needed
    }
}

async function loadTasks() {
    const tasks = await fetchJSON('/api/tasks/today');
    const container = document.getElementById('task-list');
    container.innerHTML = '';
    
    let hasInProgress = false;

    tasks.forEach(task => {
        if (task.status === 'in_progress') {
            hasInProgress = true;
            renderActiveTask(task);
        }

        const div = document.createElement('div');
        div.className = 'task-item';
        div.innerHTML = `
            <div>
                <span class="font-bold text-${getSubjectColor(task.subject)}">${task.subject}</span>
                <span class="ml-2">${task.task_name}</span>
                <span class="text-xs text-gray-400 ml-2">(${task.estimated_minutes}m)</span>
            </div>
            <div>
                ${getTaskAction(task)}
            </div>
        `;
        container.appendChild(div);
    });

    if (!hasInProgress) {
        document.getElementById('active-task-container').classList.add('hidden');
        document.getElementById('no-active-task').classList.remove('hidden');
    }
}

function getSubjectColor(subject) {
    if (subject === 'Maths') return 'orange-500';
    if (subject === 'Physics') return 'purple-500';
    if (subject === 'Chemistry') return 'green-500';
    return 'white';
}

function getTaskAction(task) {
    if (task.status === 'pending' || task.status === 'paused') {
        return `<button class="btn text-xs bg-blue-600" onclick="startTask(${task.id})">Start</button>`;
    } else if (task.status === 'in_progress') {
        return `<span class="text-green-400 text-xs">Running...</span>`;
    } else {
        return `<span class="text-gray-500 text-xs">Done</span>`;
    }
}

function renderActiveTask(task) {
    activeTaskId = task.id;
    document.getElementById('no-active-task').classList.add('hidden');
    const container = document.getElementById('active-task-container');
    container.classList.remove('hidden');

    document.getElementById('active-subject').textContent = task.subject;
    document.getElementById('active-task-name').textContent = task.task_name;
    
    // Timer Logic
    activeStartTime = new Date(task.started_at).getTime();
    if (activeTimerInterval) clearInterval(activeTimerInterval);
    
    activeTimerInterval = setInterval(() => {
        const now = Date.now();
        const diff = Math.floor((now - activeStartTime) / 1000);
        document.getElementById('timer-display').textContent = formatTimeDisplay(diff);
    }, 1000);
}

async function startTask(taskId) {
    const res = await fetch('/api/timeline/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId })
    });
    const data = await res.json();
    if (data.session_id) {
        localStorage.setItem('activeSessionId', data.session_id);
        loadTasks(); // Reload to update UI
    }
}

async function stopCurrentTask() {
    const sessionId = localStorage.getItem('activeSessionId');
    if (!sessionId) return;

    await fetch('/api/timeline/session/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
    });
    
    localStorage.removeItem('activeSessionId');
    clearInterval(activeTimerInterval);
    loadTasks();
}

async function completeCurrentTask() {
    if (!activeTaskId) return;
    
    await fetch(`/api/tasks/${activeTaskId}/complete`, { method: 'POST' });
    
    localStorage.removeItem('activeSessionId');
    clearInterval(activeTimerInterval);
    loadTasks();
}

async function loadActiveFeed() {
    const users = await fetchJSON('/api/feed/active');
    const container = document.getElementById('live-feed');
    container.innerHTML = '';

    if (users.length === 0) {
        container.innerHTML = '<div class="text-gray-500">No friends studying right now.</div>';
        return;
    }

    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'p-3 rounded bg-white/5 border border-white/10 flex justify-between items-center';
        div.innerHTML = `
            <div>
                <div class="font-bold">${u.name}</div>
                <div class="text-sm text-purple-400">${u.subject} - ${u.task_name}</div>
            </div>
            <div class="text-green-400 text-sm animate-pulse">● Active</div>
        `;
        container.appendChild(div);
    });
}

// Modal Logic
function openAddTaskModal() {
    document.getElementById('add-task-modal').style.display = 'flex';
}
function closeAddTaskModal() {
    document.getElementById('add-task-modal').style.display = 'none';
}
async function submitNewTask() {
    const name = document.getElementById('new-task-name').value;
    const subject = document.getElementById('new-task-subject').value;
    const min = document.getElementById('new-task-time').value;

    if(!name || !min) return alert('Fill all fields');

    await fetch('/api/tasks/add', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            task_name: name,
            subject: subject,
            estimated_minutes: min
        })
    });
    
    closeAddTaskModal();
    loadTasks();
}

initDashboard();