document.addEventListener('DOMContentLoaded', () => {
    auth.initialize();
    auth.subscribe(handleAuthStateChange);
    setupEventListeners();
  });
  
  function handleAuthStateChange(state) {
    const {
      isAuthenticated,
      loading,
      isAdmin,
      isVerified,
      member,
      error
    } = state;

    const loadingMessage = document.getElementById('loading-message');
    const loggedOutView = document.getElementById('logged-out-view');
    const loggedInView = document.getElementById('logged-in-view');

    if (loading) {
      loadingMessage.style.display = 'block';
      loggedOutView.style.display = 'none';
      loggedInView.style.display = 'none';
      return;
    } else {
      loadingMessage.style.display = 'none';
    }

    // logged in view
    if (isAuthenticated && member) {
      loggedOutView.style.display = 'none';
      loggedInView.style.display = 'block';
      
      document.getElementById('username').textContent = member.username;
      document.getElementById('admin-badge').style.display = isAdmin ? 'inline-block' : 'none';
      document.getElementById('verified-badge').style.display = isVerified ? 'inline-block' : 'none';
      
      document.getElementById('content').style.display = 'block';
      document.getElementById('admin-content').style.display = isAdmin ? 'block' : 'none';
      document.getElementById('verified-content').style.display = isVerified ? 'block' : 'none';

      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'none';
    } else {
      // logged out view
      loggedOutView.style.display = 'block';
      loggedInView.style.display = 'none';

      document.getElementById('content').style.display = 'none';
    }

    // display errors
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    if (error) {
      loginError.textContent = error;
      registerError.textContent = error;
    } else {
      loginError.textContent = '';
      registerError.textContent = '';
    }
  }

  function setupEventListeners() {
    // login/register form toggles
    document.getElementById('show-login-btn').addEventListener('click', () => {
      document.getElementById('login-form').style.display = 'block';
      document.getElementById('register-form').style.display = 'none';
      auth.clearError();
    });

    document.getElementById('show-register-btn').addEventListener('click', () => {
      document.getElementById('register-form').style.display = 'block';
      document.getElementById('login-form').style.display = 'none';
      auth.clearError();
    });

    // cancel buttons
    document.querySelectorAll('.cancel-btn').forEach(button => {
      button.addEventListener('click', () => {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'none';
        auth.clearError();
      });
    });

    // logout button
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await auth.logout();
    });

    // login form submission
    document.getElementById('login').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      
      await auth.login(username, password);
    });

    // register form submission
    document.getElementById('register').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const firstName = document.getElementById('register-first-name').value;
      const lastName = document.getElementById('register-last-name').value;
      const username = document.getElementById('register-username').value;
      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;
      const discordUsername = document.getElementById('register-discord').value;
      
      const userId = await auth.register(
        firstName,
        lastName,
        username,
        email,
        password,
        discordUsername
      );
      
      if (userId) {
        // registration successful, show login form
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';

        // show success message
        document.getElementById('login-error').textContent = 'Registration successful! Please log in.';
        document.getElementById('login-error').style.color = 'green';
      }
    });
  }