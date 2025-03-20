class Auth {
  constructor() {
    this.isAuthenticated = false;
    this.loading = true;
    this.isAdmin = false;
    this.isVerified = false;
    this.user = null;
    this.error = null;
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notifySubscribers() {
    const state = {
      isAuthenticated: this.isAuthenticated,
      loading: this.loading,
      isAdmin: this.isAdmin,
      isVerified: this.isVerified,
      member: this.user,
      error: this.error
    };

    this.listeners.forEach(listener => listener(state));
  }

  async initialize() {
    try {
      await getCsrfToken();
      await this.checkSession();
    } catch (error) {
      log('Failed to initialize auth:', error);
      this.isAuthenticated = false;
      this.loading = false;
      this.notifySubscribers();
    }
  }

  async checkSession() {
    try {
      await api.get('/auth/session/');
      this.isAuthenticated = true;
      await this.fetchUserData();
    } catch (error) {
      this.isAuthenticated = false;
      this.loading = false;
      this.notifySubscribers();
    }
  }

  async fetchUserData() {
    if (this.isAuthenticated) {
      try {
        const response = await withCsrf(() => api.get('/members/profile/'));
        
        if (response.status === 200) {
          const userData = this.deserializeUser(response.data);
          this.user = userData;
          
          const groups = userData.groups?.map(group => group.name) || [];
          this.isAdmin = groups.includes('is_admin');
          this.isVerified = groups.includes('is_verified');
        }
      } catch (error) {
        log('Failed to get user data:', error);
        this.user = null;
      }
    } else {
      this.user = null;
    }

    this.loading = false;
    this.notifySubscribers();
  }

  async login(username, password) {
    try {
      const res = await api.post('/auth/login/', { username, password });

      if (res.status === 200) {
        await getCsrfToken();
        this.isAuthenticated = true;
        this.error = null;
        await this.fetchUserData();
        return true;
      } else {
        this.handleLoginError(res.data);
        return false;
      }
    } catch (err) {
      this.handleLoginError(err.response?.data);
      return false;
    }
  }

  handleLoginError(errorData) {
    if (errorData?.detail === 'Your account does not have a Discord ID associated with it.') {
      this.error = `Your discord is not verified. Please type /verify in the server and enter ${errorData.username}`;
    } else {
      this.error = 'Invalid credentials. Please try again.';
      this.isAuthenticated = false;
    }
    this.notifySubscribers();
  }

  async logout() {
    try {
      const res = await api.post('/auth/logout/');

      if (res.status === 200) {
        await getCsrfToken();
        this.isAuthenticated = false;
        this.user = null;
        this.isAdmin = false;
        this.isVerified = false;
        this.notifySubscribers();
        return true;
      }
      return false;
    } catch (err) {
      log('Logout failed:', err);
      return false;
    }
  }

  async register(firstName, lastName, username, email, password, discordUsername) {
    try {
      const res = await api.post('/auth/register/', {
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        password,
        discord_username: discordUsername,
      });

      if (res.status !== 201) throw new Error('Registration failed.');

      await getCsrfToken();
      this.error = null;
      this.notifySubscribers();
      return res.data.id;
    } catch (err) {
      log('Registration failed:', err.response?.data);
      this.error = err.response?.data?.detail || 'Registration failed. Please try again.';
      this.notifySubscribers();
      return undefined;
    }
  }

  deserializeUser({
    first_name: firstName,
    last_name: lastName,
    grad_date: gradDate,
    discord_username: discordUsername,
    resume_url: resumeUrl,
    discord_id: discordId,
    profile_picture_url: profilePictureUrl,
    created,
    ...rest
  }) {
    return {
      ...rest,
      firstName,
      lastName,
      discordUsername,
      resumeUrl,
      discordId,
      profilePictureUrl,
      created: parseDate(created),
      gradDate: gradDate ? parseDate(gradDate) : undefined,
    };
  }

  clearError() {
    this.error = null;
    this.notifySubscribers();
  }
}

const auth = new Auth();