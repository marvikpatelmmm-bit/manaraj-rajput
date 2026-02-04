const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const nameGroup = document.getElementById('name-group');
const toggleBtn = document.getElementById('toggle-auth');

let isLogin = true;

toggleBtn.addEventListener('click', () => {
    isLogin = !isLogin;
    if (isLogin) {
        authTitle.textContent = 'JEE Login';
        nameGroup.style.display = 'none';
        toggleBtn.textContent = 'Need an account? Register';
        document.getElementById('name').removeAttribute('required');
    } else {
        authTitle.textContent = 'Register';
        nameGroup.style.display = 'block';
        toggleBtn.textContent = 'Already have an account? Login';
        document.getElementById('name').setAttribute('required', 'true');
    }
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name').value;

    const endpoint = isLogin ? '/api/login' : '/api/register';
    const body = isLogin ? { username, password } : { username, password, name };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (data.success) {
            window.location.href = 'dashboard.html';
        } else {
            alert(data.error || 'Authentication failed');
        }
    } catch (err) {
        console.error(err);
        alert('Server error');
    }
});