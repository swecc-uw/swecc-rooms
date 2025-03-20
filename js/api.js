async function getCsrfToken() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/csrf/`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get CSRF token');
      }

      const csrfToken = response.headers.get('x-csrftoken') || getCookie('csrftoken');
      if (csrfToken) {
        localStorage.setItem('csrfToken', csrfToken);
      }

      return csrfToken;
    } catch (error) {
      log('Failed to fetch CSRF token:', error);
      return '';
    }
  }

  function getActiveToken() {
    return localStorage.getItem('csrfToken') || getCookie('csrftoken') || '';
  }

  const api = {
    async get(endpoint) {
      const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-CSRFToken': getActiveToken(),
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw {
          response: {
            status: response.status,
            data: responseData
          }
        };
      }

      return {
        status: response.status,
        data: responseData,
        headers: Object.fromEntries(response.headers.entries())
      };
    },

    async post(endpoint, data) {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-CSRFToken': getActiveToken(),
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw {
          response: {
            status: response.status,
            data: responseData
          }
        };
      }

      return {
        status: response.status,
        data: responseData,
        headers: Object.fromEntries(response.headers.entries())
      };
    },

    async put(endpoint, data) {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-CSRFToken': getActiveToken(),
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw {
          response: {
            status: response.status,
            data: responseData
          }
        };
      }

      return {
        status: response.status,
        data: responseData,
        headers: Object.fromEntries(response.headers.entries())
      };
    }
  };

  async function withCsrf(callback) {
    if (!getActiveToken()) {
      await getCsrfToken();
    }
    return callback();
  }