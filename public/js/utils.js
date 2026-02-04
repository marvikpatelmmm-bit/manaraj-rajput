// Format minutes into Xh Ym
function formatDuration(minutes) {
    if (!minutes) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

function formatTimeDisplay(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        window.location.href = 'index.html';
        return;
    }
    return res.json();
}

document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'index.html';
});