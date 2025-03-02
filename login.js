document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const accessKeyInput = document.getElementById('access-key');
    const errorMessage = document.getElementById('error-message');
    
    // Check if user is already logged in
    if (localStorage.getItem('ethosAuth')) {
        // Redirect to dashboard
        window.location.href = '/index.html';
    }
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const accessKey = accessKeyInput.value.trim();
        
        if (!accessKey) {
            showError('Please enter your access key');
            return;
        }
        
        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ key: accessKey })
            });
            
            if (response.ok) {
                const data = await response.json();
                // Store auth token in localStorage
                localStorage.setItem('ethosAuth', data.token);
                // Redirect to dashboard
                window.location.href = '/index.html';
            } else {
                const card = document.querySelector('.login-card');
                card.classList.add('shake');
                
                // Remove shake class after animation completes
                setTimeout(() => {
                    card.classList.remove('shake');
                }, 600);
                
                showError('Invalid access key');
                accessKeyInput.value = '';
                accessKeyInput.focus();
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Connection error. Please try again.');
        }
    });
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.opacity = 1;
        
        // Clear error after 3 seconds
        setTimeout(() => {
            errorMessage.style.opacity = 0;
            setTimeout(() => {
                errorMessage.textContent = '';
            }, 300);
        }, 3000);
    }
});