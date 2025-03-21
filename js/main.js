document.addEventListener('DOMContentLoaded', () => {
  // Configuration
  const config = {
    IS_DEV:
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1',
    get API_URL () {
      return this.IS_DEV ? 'http://localhost' : 'https://api.swecc.org'
    },
    get WS_URL () {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      return this.IS_DEV
        ? `${wsProtocol}//localhost/ws`
        : `${wsProtocol}//api.swecc.org/ws`
    },
    STORAGE_KEY: 'retro_chat_data'
  }

  // State
  const state = {
    isAuthenticated: false,
    loading: false,
    user: null,
    error: null,
    currentRoom: null,
    knownRooms: [],
    webSocket: null,
    messages: {},
    csrfToken: '',
    isConnected: false
  }

  // DOM Elements
  const elements = {
    authView: document.getElementById('auth-view'),
    loadingView: document.getElementById('loading-view'),
    chatView: document.getElementById('chat-view'),
    loginError: document.getElementById('login-error'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    roomList: document.getElementById('room-list'),
    newRoomId: document.getElementById('new-room-id'),
    createRoomBtn: document.getElementById('create-room-btn'),
    currentRoomName: document.getElementById('current-room-name'),
    messages: document.getElementById('messages'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    leaveRoomBtn: document.getElementById('leave-room-btn'),
    currentUser: document.getElementById('current-user'),
    connectionIndicator: document.getElementById('connection-indicator'),
    connectionStatus: document.getElementById('connection-status')
  }

  // Load state from localStorage
  function loadFromStorage () {
    try {
      const savedData = localStorage.getItem(config.STORAGE_KEY)
      if (savedData) {
        const parsedData = JSON.parse(savedData)
        if (parsedData.knownRooms) {
          state.knownRooms = parsedData.knownRooms
        }
        if (parsedData.messages) {
          state.messages = parsedData.messages
        }
        console.log(
          'Loaded from localStorage:',
          state.knownRooms,
          Object.keys(state.messages)
        )
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error)
    }
  }

  // Save state to localStorage
  function saveToStorage () {
    try {
      const dataToSave = {
        knownRooms: state.knownRooms,
        messages: state.messages
      }
      localStorage.setItem(config.STORAGE_KEY, JSON.stringify(dataToSave))
    } catch (error) {
      console.error('Error saving to localStorage:', error)
    }
  }

  // Helper Functions
  function showLoading (isLoading = true) {
    state.loading = isLoading
    updateUI()
  }

  function getCookie (name) {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) {
      return parts.pop().split(';').shift()
    }
    return ''
  }

  function updateConnectionStatus (isConnected) {
    state.isConnected = isConnected
    elements.connectionIndicator.className = `status-indicator ${
      isConnected ? 'online' : 'offline'
    }`
    elements.connectionStatus.textContent = isConnected
      ? 'Connected'
      : 'Offline'
  }

  // API Service
  const api = {
    async getCsrfToken () {
      try {
        const response = await fetch(`${config.API_URL}/auth/csrf/`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        })

        if (!response.ok) {
          throw new Error('Failed to get CSRF token')
        }

        const csrfToken =
          response.headers.get('x-csrftoken') || getCookie('csrftoken')
        if (csrfToken) {
          state.csrfToken = csrfToken
        }

        return csrfToken
      } catch (error) {
        console.error('Failed to fetch CSRF token:', error)
        return ''
      }
    },

    getActiveToken () {
      return state.csrfToken || getCookie('csrftoken') || ''
    },

    async request (method, endpoint, data = null) {
      const url = `${config.API_URL}${endpoint}`
      const options = {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRFToken': this.getActiveToken(),
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      }

      if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data)
      }

      try {
        const response = await fetch(url, options)
        const responseData = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw {
            status: response.status,
            data: responseData
          }
        }

        return {
          status: response.status,
          data: responseData,
          headers: Object.fromEntries(response.headers.entries())
        }
      } catch (error) {
        console.error(`API ${method} request failed:`, error)
        throw error
      }
    },

    async get (endpoint) {
      return this.request('GET', endpoint)
    },

    async post (endpoint, data) {
      return this.request('POST', endpoint, data)
    },

    async withCsrf (callback) {
      if (!this.getActiveToken()) {
        await this.getCsrfToken()
      }
      return callback()
    }
  }

  // Auth Functions
  const auth = {
    async initialize () {
      try {
        await api.getCsrfToken()
        await this.checkSession()
      } catch (error) {
        console.error('Failed to initialize auth:', error)
        state.isAuthenticated = false
        updateUI()
      }
    },

    async checkSession () {
      try {
        await api.get('/auth/session/')
        state.isAuthenticated = true
        await this.fetchUserData()
      } catch (error) {
        state.isAuthenticated = false
        updateUI()
      }
    },

    async fetchUserData () {
      if (state.isAuthenticated) {
        try {
          const response = await api.withCsrf(() =>
            api.get('/members/profile/')
          )

          if (response.status === 200) {
            state.user = {
              id: response.data.id,
              username: response.data.username
            }
          }
        } catch (error) {
          console.error('Failed to get user data:', error)
          state.user = null
        }
      } else {
        state.user = null
      }

      updateUI()
    },

    async login (username, password) {
      try {
        // First get CSRF token
        await api.getCsrfToken()

        // Then attempt login
        const res = await api.post('/auth/login/', { username, password })

        if (res.status === 200) {
          // Refresh CSRF token after login
          await api.getCsrfToken()
          state.isAuthenticated = true
          state.error = null
          await this.fetchUserData()
          return true
        }
      } catch (err) {
        state.error = 'Invalid credentials. Please try again.'
        state.isAuthenticated = false
        return false
      }
    },

    async logout () {
      try {
        const res = await api.withCsrf(() => api.post('/auth/logout/'))

        if (res.status === 200) {
          // Refresh CSRF token after logout
          await api.getCsrfToken()
          state.isAuthenticated = false
          state.user = null

          // Disconnect from WebSocket
          if (state.webSocket) {
            if (state.currentRoom) {
              chatWs.leaveRoom(state.currentRoom)
            }
            chatWs.disconnect()
          }

          state.currentRoom = null
          return true
        }
        return false
      } catch (err) {
        console.error('Logout failed:', err)
        return false
      }
    },

    async getJwtToken () {
      if (!state.isAuthenticated) {
        return null
      }

      try {
        const response = await api.withCsrf(() => api.get('/auth/jwt/'))

        if (response.status === 200 && response.data.token) {
          return response.data.token
        }

        // Fallback for development/testing
        if (config.IS_DEV) {
          return 'dev_token'
        }

        return null
      } catch (error) {
        console.error('Failed to get JWT token:', error)

        // Fallback for development/testing
        if (config.IS_DEV) {
          return 'dev_token'
        }

        return null
      }
    }
  }

  // WebSocket Chat Service
  const chatWs = {
    connect: async function () {
      if (state.webSocket) {
        this.disconnect()
      }

      const token = await auth.getJwtToken()
      if (!token) {
        console.error('No JWT token available for WebSocket')
        updateConnectionStatus(false)
        return false
      }

      const wsUrl = `${config.WS_URL}/chat/${token}`

      try {
        state.webSocket = new WebSocket(wsUrl)
        state.webSocket.onopen = this.handleOpen.bind(this)
        state.webSocket.onmessage = this.handleMessage.bind(this)
        state.webSocket.onclose = this.handleClose.bind(this)
        state.webSocket.onerror = this.handleError.bind(this)
        return true
      } catch (error) {
        console.error('WebSocket connection error:', error)
        updateConnectionStatus(false)
        return false
      }
    },

    disconnect: function () {
      if (state.webSocket) {
        state.webSocket.close()
        state.webSocket = null
      }
      updateConnectionStatus(false)
    },

    handleOpen: function () {
      console.log('WebSocket connection established')
      updateConnectionStatus(true)

      // Update the room list UI from localStorage
      this.updateRoomListUI()

      // If we have known rooms, add 'general' as a default if it doesn't exist
      if (!state.knownRooms.includes('general')) {
        state.knownRooms.push('general')
        saveToStorage()
        this.updateRoomListUI()
      }
    },

    handleMessage: function (event) {
      try {
        const data = JSON.parse(event.data)
        console.log('WebSocket message:', data)

        if (data.type === 'chat_message') {
          this.addMessage(data)
        } else if (data.type === 'room_joined') {
          // Only update currentRoom if it's not already the same room
          if (state.currentRoom !== data.room_id) {
            state.currentRoom = data.room_id

            // Add to known rooms if not already there
            if (!state.knownRooms.includes(data.room_id)) {
              state.knownRooms.push(data.room_id)
              saveToStorage()
              this.updateRoomListUI()
            }

            this.updateRoomUI()

            // Add a system message ONLY if we're joining a new room
            this.addSystemMessage(data.room_id, `You joined ${data.room_id}`)

            // Initialize messages array for this room if not exists
            if (!state.messages[data.room_id]) {
              state.messages[data.room_id] = []
              saveToStorage()
            }
          }
        } else if (data.type === 'room_left') {
          // Add a system message to the room before leaving
          if (state.currentRoom) {
            this.addSystemMessage(
              state.currentRoom,
              `You left ${state.currentRoom}`
            )
          }

          state.currentRoom = null
          this.updateRoomUI()
        } else if (data.type === 'system' && data.message) {
          console.log('System message:', data.message)

          // Add system message to current room if connected
          if (state.currentRoom) {
            this.addSystemMessage(state.currentRoom, data.message)
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    },

    handleClose: function (event) {
      console.log('WebSocket connection closed:', event.code, event.reason)
      updateConnectionStatus(false)

      // Try to reconnect after a delay if we're still authenticated
      if (state.isAuthenticated) {
        setTimeout(() => this.connect(), 3000)
      }
    },

    handleError: function (event) {
      console.error('WebSocket error:', event)
      updateConnectionStatus(false)
    },

    joinRoom: function (roomId) {
      if (!state.webSocket || !roomId) {
        return false
      }

      const message = {
        type: 'join_room',
        room_id: roomId
      }

      state.webSocket.send(JSON.stringify(message))
      return true
    },

    leaveRoom: function (roomId) {
      if (!state.webSocket || !roomId) {
        return false
      }

      const message = {
        type: 'leave_room',
        room_id: roomId
      }

      state.webSocket.send(JSON.stringify(message))
      return true
    },

    sendMessage: function(content) {
      if (!state.webSocket || !state.currentRoom || !content.trim()) {
        return false;
      }

      const message = {
        type: 'chat_message',
        room_id: state.currentRoom,
        content: content
      };

      state.webSocket.send(JSON.stringify(message));
      return true;
    },

    addSystemMessage: function (roomId, message) {
      const systemMessage = {
        type: 'chat_message',
        room_id: roomId,
        username: 'System',
        message: message,
        timestamp: new Date().toISOString()
      }

      this.addMessage(systemMessage)
    },

    addMessage: function (data) {
      const roomId = data.room_id
      if (!roomId) return

      // Add timestamp to message
      data.timestamp = new Date().toISOString()

      // Initialize messages array for this room if not exists
      if (!state.messages[roomId]) {
        state.messages[roomId] = []
      }

      // Add message to state
      state.messages[roomId].push(data)

      // Limit message history to 100 messages per room
      if (state.messages[roomId].length > 100) {
        state.messages[roomId] = state.messages[roomId].slice(-100)
      }

      // Save to localStorage
      saveToStorage()

      // Update UI if this is the current room
      if (roomId === state.currentRoom) {
        this.renderMessages()
      }

      // Update room list to show new message counts
      this.updateRoomListUI()
    },

    renderMessages: function () {
      if (!state.currentRoom) return

      const messages = state.messages[state.currentRoom] || []
      elements.messages.innerHTML = ''

      messages.forEach(msg => {
        const msgDiv = document.createElement('div')

        if (msg.username === 'System') {
          msgDiv.className = 'message message-system'
          msgDiv.innerHTML = `${msg.message}`
        } else {
          const isCurrentUser =
            msg.user_id === state.user.id ||
            msg.username === state.user.username
          msgDiv.className = isCurrentUser
            ? 'message message-self'
            : 'message message-user'

          // Format timestamp if available
          let timeString = ''
          if (msg.timestamp) {
            try {
              const date = new Date(msg.timestamp)
              timeString = `<span class="message-time">${date.toLocaleTimeString(
                [],
                { hour: '2-digit', minute: '2-digit' }
              )}</span>`
            } catch (e) {
              console.error('Error formatting timestamp:', e)
            }
          }

          msgDiv.innerHTML = `
            <div class="message-header">${msg.username} ${timeString}</div>
            <div class="message-content">${msg.message}</div>
          `
        }

        elements.messages.appendChild(msgDiv)
      })

      // Scroll to bottom
      elements.messages.scrollTop = elements.messages.scrollHeight
    },

    updateRoomUI: function () {
      if (state.currentRoom) {
        elements.currentRoomName.textContent = state.currentRoom
        elements.messageInput.disabled = false
        elements.sendBtn.disabled = false
      } else {
        elements.currentRoomName.textContent = 'No Room'
        elements.messageInput.disabled = true
        elements.sendBtn.disabled = true
        elements.messages.innerHTML = ''
      }

      // Update active room in room list
      this.updateRoomListUI()
    },

    updateRoomListUI: function () {
      elements.roomList.innerHTML = ''

      // Always include general room if not already in the list
      if (!state.knownRooms.includes('general')) {
        state.knownRooms.push('general')
        saveToStorage()
      }

      // Display known rooms from localStorage
      state.knownRooms.forEach(roomId => {
        const li = document.createElement('li')
        li.className = 'room-item'
        if (roomId === state.currentRoom) {
          li.classList.add('active')
        }

        li.dataset.roomId = roomId

        // Get message count if available
        const messageCount = state.messages[roomId]
          ? state.messages[roomId].length
          : 0

        li.innerHTML = `
          <span>${roomId}</span>
          <span class="message-count">${messageCount} msg</span>
        `

        li.addEventListener('click', () => {
          if (roomId !== state.currentRoom) {
            if (state.currentRoom) {
              this.leaveRoom(state.currentRoom)
            }
            this.joinRoom(roomId)
          }
        })

        elements.roomList.appendChild(li)
      })
    },

    // Clear chat history
    clearHistory: function () {
      if (confirm('This will clear all chat history. Continue?')) {
        state.messages = {}
        saveToStorage()
        this.updateRoomListUI()
        this.renderMessages()
      }
    }
  }

  // Update UI based on state
  function updateUI () {
    // Handle loading state
    if (state.loading) {
      elements.loadingView.classList.remove('hidden')
      elements.authView.classList.add('hidden')
      elements.chatView.classList.add('hidden')
      return
    } else {
      elements.loadingView.classList.add('hidden')
    }

    // Update UI based on authentication status
    if (state.isAuthenticated && state.user) {
      elements.chatView.classList.remove('hidden')
      elements.authView.classList.add('hidden')

      // Update user info
      elements.currentUser.textContent = state.user.username

      // Set avatar letter
      const avatarElement = document.querySelector('.user-avatar-large')
      if (avatarElement) {
        avatarElement.textContent = state.user.username.charAt(0).toUpperCase()
      }

      // Initialize WebSocket if not already connected
      if (!state.webSocket) {
        chatWs.connect()
      }

      // Update room list from localStorage
      chatWs.updateRoomListUI()

      // Render messages if in a room
      if (state.currentRoom) {
        chatWs.renderMessages()
      }
    } else {
      elements.authView.classList.remove('hidden')
      elements.chatView.classList.add('hidden')
    }

    // Display any errors
    if (state.error) {
      elements.loginError.textContent = state.error
    } else {
      elements.loginError.textContent = ''
    }
  }

  // Set up event listeners
  function setupEventListeners () {
    // Login button
    elements.loginBtn.addEventListener('click', async () => {
      const username = elements.username.value
      const password = elements.password.value

      if (!username || !password) {
        state.error = 'Please enter username and password'
        updateUI()
        return
      }

      showLoading(true)
      const success = await auth.login(username, password)
      showLoading(false)

      if (success) {
        // Clear form
        elements.username.value = ''
        elements.password.value = ''
      }
    })

    // Logout button
    elements.logoutBtn.addEventListener('click', async () => {
      await auth.logout()
      updateUI()
    })

    // Create/Join room button
    elements.createRoomBtn.addEventListener('click', () => {
      const roomId = elements.newRoomId.value.trim()
      if (!roomId) return

      // Add to known rooms if it's not already there
      if (!state.knownRooms.includes(roomId)) {
        state.knownRooms.push(roomId)
        saveToStorage()
        chatWs.updateRoomListUI()
      }

      if (state.currentRoom) {
        chatWs.leaveRoom(state.currentRoom)
      }

      chatWs.joinRoom(roomId)
      elements.newRoomId.value = ''
    })

    // Leave room button
    elements.leaveRoomBtn.addEventListener('click', () => {
      if (state.currentRoom) {
        chatWs.leaveRoom(state.currentRoom)
      }
    })

    // Send message button
    elements.sendBtn.addEventListener('click', () => {
      const content = elements.messageInput.value.trim()
      if (content && chatWs.sendMessage(content)) {
        elements.messageInput.value = ''
      }
    })

    // Send on Enter key
    elements.messageInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        elements.sendBtn.click()
      }
    })

    // Login on Enter key
    elements.password.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        elements.loginBtn.click()
      }
    })

    // Join room on Enter key
    elements.newRoomId.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        elements.createRoomBtn.click()
      }
    })

    // Add CRT effect
    const crtEffect = document.createElement('div')
    crtEffect.className = 'crt-effect'
    document.body.appendChild(crtEffect)
  }

  // Load data from localStorage
  loadFromStorage()

  // Initialize app
  setupEventListeners()
  auth.initialize()
})
