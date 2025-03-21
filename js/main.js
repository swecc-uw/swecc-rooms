document.addEventListener('DOMContentLoaded', () => {
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
    STORAGE_KEY: 'swecc_rooms_data',
    MSG_HISTORY_LIMIT: 100,
    MESSAGE_SOUND: false
  }

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
    isConnected: false,
    messageCount: 0,
    typing: {}
  }

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
    connectionStatus: document.getElementById('connection-status'),
    connectionStatusText: document.getElementById('connection-status-text')
  }

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
        if (parsedData.messageCount) {
          state.messageCount = parsedData.messageCount
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

  function saveToStorage () {
    try {
      const dataToSave = {
        knownRooms: state.knownRooms,
        messages: state.messages,
        messageCount: state.messageCount
      }
      localStorage.setItem(config.STORAGE_KEY, JSON.stringify(dataToSave))
    } catch (error) {
      console.error('Error saving to localStorage:', error)
    }
  }

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
    elements.connectionStatusText.textContent = isConnected
      ? 'Online'
      : 'Offline'

    if (isConnected) {
      showToast(
        'Connection Status',
        'Connected to SWECC Rooms successfully!',
        'success'
      )
    } else {
      showToast('Connection Status', 'Disconnected from SWECC Rooms.', 'error')
    }
  }

  function showToast (title, message, type = 'info') {
    const existingToasts = document.querySelectorAll('.toast')
    existingToasts.forEach(toast => {
      toast.remove()
    })

    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.style.borderLeftColor =
      type === 'success'
        ? 'var(--success)'
        : type === 'error'
        ? 'var(--error)'
        : 'var(--primary)'

    toast.innerHTML = `
      <div class="toast-header">
        <span class="toast-title">${title}</span>
        <button class="toast-close">&times;</button>
      </div>
      <div class="toast-body">${message}</div>
    `

    document.body.appendChild(toast)

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove()
    })

    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.opacity = '0'
        toast.style.transform = 'translateX(100%)'
        setTimeout(() => {
          if (document.body.contains(toast)) {
            toast.remove()
          }
        }, 300)
      }
    }, 5000)
  }

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
        await api.getCsrfToken()

        const res = await api.post('/auth/login/', { username, password })

        if (res.status === 200) {
          await api.getCsrfToken()
          state.isAuthenticated = true
          state.error = null
          await this.fetchUserData()

          showToast(
            'Welcome',
            `You've successfully logged in as ${username}!`,
            'success'
          )

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
          await api.getCsrfToken()
          state.isAuthenticated = false
          state.user = null

          if (state.webSocket) {
            if (state.currentRoom) {
              chatWs.leaveRoom(state.currentRoom)
            }
            chatWs.disconnect()
          }

          state.currentRoom = null

          showToast('Goodbye', 'You have been logged out successfully.', 'info')

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

        if (config.IS_DEV) {
          return 'dev_token'
        }

        return null
      } catch (error) {
        console.error('Failed to get JWT token:', error)

        if (config.IS_DEV) {
          return 'dev_token'
        }

        return null
      }
    }
  }

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

      this.updateRoomListUI()

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

          if (
            config.MESSAGE_SOUND &&
            data.user_id !== state.user.id &&
            data.username !== state.user.username
          ) {
            this.playMessageSound()
          }
        } else if (data.type === 'room_joined') {
          if (state.currentRoom !== data.room_id) {
            state.currentRoom = data.room_id

            if (!state.knownRooms.includes(data.room_id)) {
              state.knownRooms.push(data.room_id)
              saveToStorage()
              this.updateRoomListUI()
            }

            this.updateRoomUI()

            this.addSystemMessage(data.room_id, `You joined #${data.room_id}`)

            if (!state.messages[data.room_id]) {
              state.messages[data.room_id] = []
              saveToStorage()
            }

            showToast(
              'Room Joined',
              `You joined #${data.room_id} successfully!`,
              'success'
            )
          }
        } else if (data.type === 'room_left') {
          if (state.currentRoom) {
            this.addSystemMessage(
              state.currentRoom,
              `You left #${state.currentRoom}`
            )

            showToast('Room Left', `You left #${state.currentRoom}`, 'info')
          }

          state.currentRoom = null
          this.updateRoomUI()
        } else if (data.type === 'system' && data.message) {
          console.log('System message:', data.message)

          if (state.currentRoom) {
            this.addSystemMessage(state.currentRoom, data.message)
          }
        } else if (data.type === 'typing') {
          this.handleTypingIndicator(data)
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    },

    handleTypingIndicator: function (data) {
      if (!data.room_id || !data.username) return

      const roomId = data.room_id
      const username = data.username
      const isTyping = data.typing === true

      if (state.user && username === state.user.username) return

      if (!state.typing[roomId]) {
        state.typing[roomId] = {}
      }

      if (isTyping) {
        state.typing[roomId][username] = Date.now()
      } else {
        delete state.typing[roomId][username]
      }

      this.updateTypingIndicator(roomId)
    },

    updateTypingIndicator: function (roomId) {
      if (roomId !== state.currentRoom) return

      const existingIndicator = document.getElementById('typing-indicator')
      if (existingIndicator) {
        existingIndicator.remove()
      }

      const typingUsers = state.typing[roomId]
        ? Object.keys(state.typing[roomId])
        : []

      if (typingUsers.length > 0) {
        const indicatorDiv = document.createElement('div')
        indicatorDiv.id = 'typing-indicator'
        indicatorDiv.className = 'message message-system'

        let message = ''
        if (typingUsers.length === 1) {
          message = `${typingUsers[0]} is typing...`
        } else if (typingUsers.length === 2) {
          message = `${typingUsers[0]} and ${typingUsers[1]} are typing...`
        } else {
          message = `${typingUsers.length} people are typing...`
        }

        indicatorDiv.innerHTML = `
          ${message}
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        `

        elements.messages.appendChild(indicatorDiv)
      }
    },

    playMessageSound: function () {
      let audioElement = document.getElementById('message-sound')
      if (!audioElement) {
        audioElement = document.createElement('audio')
        audioElement.id = 'message-sound'
        audioElement.preload = 'auto'

        // why doesn't this work :'(
        audioElement.src =
          'data:audio/mp3;base64,SUQzAwAAAAAAJlRQRTEAAAAcAAAAU291bmRKYXkuY29tIFNvdW5kIEVmZmVjdHMA//uQwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAADAAAGhgBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr///////////////////////////////////////////8AAAA8TEFNRTMuOTlyAc0AAAAAAAAAABSAJAJAQgAAgAAAA+BnhyS7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uAxAAAFCD5YdTwAJcXlqT/OgAAAAIIIIBAMBgMBgMBgAAAABBv4ICAQCAQCB19gBAEAQfggCAIAgD/8EAQDAYD4Pg+D4YCAIAgCAAYD/w+D4Pgg//BAEAQf4IBgMB//BAEAQDhB/4PggCAIBgMB8EH/BAEH4PggIB//EHwQEA4QdwQDgYIAg+CAIAg//B//+D4Pg+CAgHCDuCAcDAQBAEA4Qf8EAQBAP//B8HwQEA//B8EAQf///B///wfB8HwfB8Hw//+CAYCAIBiTEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU='

        document.body.appendChild(audioElement)
      }

      audioElement
        .play()
        .catch(e => console.error('Could not play notification sound:', e))
    },

    handleClose: function (event) {
      console.log('WebSocket connection closed:', event.code, event.reason)
      updateConnectionStatus(false)

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

    sendMessage: function (content) {
      if (!state.webSocket || !state.currentRoom || !content.trim()) {
        return false
      }

      const message = {
        type: 'chat_message',
        room_id: state.currentRoom,
        content: content
      }

      state.webSocket.send(JSON.stringify(message))

      state.messageCount++
      document.getElementById('messages-sent') = state.messageCount
      saveToStorage()

      return true
    },

    sendTypingIndicator: function (isTyping) {
      if (!state.webSocket || !state.currentRoom) {
        return false
      }

      const message = {
        type: 'typing',
        room_id: state.currentRoom,
        typing: isTyping
      }

      state.webSocket.send(JSON.stringify(message))
      return true
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

      data.timestamp = data.timestamp || new Date().toISOString()

      if (!state.messages[roomId]) {
        state.messages[roomId] = []
      }

      state.messages[roomId].push(data)

      if (state.messages[roomId].length > config.MSG_HISTORY_LIMIT) {
        state.messages[roomId] = state.messages[roomId].slice(
          -config.MSG_HISTORY_LIMIT
        )
      }

      saveToStorage()

      if (roomId === state.currentRoom) {
        this.renderMessages()
      }

      this.updateRoomListUI()
    },

    renderMessages: function () {
      if (!state.currentRoom) return

      const messages = state.messages[state.currentRoom] || []
      elements.messages.innerHTML = ''

      let currentDate = null

      messages.forEach(msg => {
        if (msg.timestamp) {
          const messageDate = new Date(msg.timestamp).toLocaleDateString()
          if (messageDate !== currentDate) {
            currentDate = messageDate

            const dateDiv = document.createElement('div')
            dateDiv.className = 'message-date-separator'
            dateDiv.textContent =
              messageDate === new Date().toLocaleDateString()
                ? 'Today'
                : messageDate
            elements.messages.appendChild(dateDiv)
          }
        }

        const msgDiv = document.createElement('div')

        if (msg.username === 'System') {
          msgDiv.className = 'message message-system'
          msgDiv.innerHTML = `${msg.message}`
        } else {
          const isCurrentUser =
            msg.user_id === (state.user?.id || '') ||
            msg.username === (state.user?.username || '')
          msgDiv.className = isCurrentUser
            ? 'message message-self'
            : 'message message-user'

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
            <div class="message-header">
              <span>${msg.username}</span>
              ${timeString}
            </div>
            <div class="message-content">${msg.message}</div>
          `
        }

        elements.messages.appendChild(msgDiv)
      })

      this.updateTypingIndicator(state.currentRoom)

      elements.messages.scrollTop = elements.messages.scrollHeight
    },

    updateRoomUI: function () {
      if (state.currentRoom) {
        elements.currentRoomName.textContent = state.currentRoom
        elements.messageInput.disabled = false
        elements.sendBtn.disabled = false
        elements.messageInput.focus()
      } else {
        elements.currentRoomName.textContent = 'No Room'
        elements.messageInput.disabled = true
        elements.sendBtn.disabled = true
        elements.messages.innerHTML = ''
      }

      this.updateRoomListUI()
    },

    updateRoomListUI: function () {
      elements.roomList.innerHTML = ''

      if (!state.knownRooms.includes('general')) {
        state.knownRooms.push('general')
        saveToStorage()
      }

      state.knownRooms.forEach(roomId => {
        const li = document.createElement('li')
        li.className = 'room-item'
        if (roomId === state.currentRoom) {
          li.classList.add('active')
        }

        li.dataset.roomId = roomId

        const messageCount = state.messages[roomId]
          ? state.messages[roomId].length
          : 0

        li.innerHTML = `
          <span>${roomId}</span>
          <span class="message-count">${messageCount}</span>
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

    clearHistory: function () {
      if (confirm('This will clear all chat history. Continue?')) {
        state.messages = {}
        saveToStorage()
        this.updateRoomListUI()
        this.renderMessages()
        showToast(
          'History Cleared',
          'All chat history has been cleared.',
          'info'
        )
      }
    },

    animateMessage: function (messageElement) {
      messageElement.style.opacity = '0'
      messageElement.style.transform = 'translateY(20px)'

      setTimeout(() => {
        messageElement.style.opacity = '1'
        messageElement.style.transform = 'translateY(0)'
      }, 10)
    }
  }

  function updateUI () {
    if (state.loading) {
      elements.loadingView.classList.remove('hidden')
      elements.authView.classList.add('hidden')
      elements.chatView.classList.add('hidden')
      return
    } else {
      elements.loadingView.classList.add('hidden')
    }

    if (state.isAuthenticated && state.user) {
      elements.chatView.classList.remove('hidden')
      elements.authView.classList.add('hidden')

      elements.currentUser.textContent = state.user.username

      const avatarElement = document.querySelector('.user-avatar-large')
      if (avatarElement) {
        avatarElement.textContent = state.user.username.charAt(0).toUpperCase()
      }

      document.querySelector('.user-stats .stat-value').textContent =
        state.messageCount

      if (!state.webSocket) {
        chatWs.connect()
      }

      chatWs.updateRoomListUI()

      if (state.currentRoom) {
        chatWs.renderMessages()
      }
    } else {
      elements.authView.classList.remove('hidden')
      elements.chatView.classList.add('hidden')
    }

    if (state.error) {
      elements.loginError.textContent = state.error
      elements.loginError.style.display = 'block'
    } else {
      elements.loginError.textContent = ''
      elements.loginError.style.display = 'none'
    }
  }

  function setupEventListeners () {
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
        elements.username.value = ''
        elements.password.value = ''
      }
    })

    elements.logoutBtn.addEventListener('click', async () => {
      await auth.logout()
      updateUI()
    })

    elements.createRoomBtn.addEventListener('click', () => {
      const roomId = elements.newRoomId.value.trim()
      if (!roomId) return

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

    elements.leaveRoomBtn.addEventListener('click', () => {
      if (state.currentRoom) {
        chatWs.leaveRoom(state.currentRoom)
      }
    })

    elements.sendBtn.addEventListener('click', () => {
      const content = elements.messageInput.value.trim()
      if (content && chatWs.sendMessage(content)) {
        elements.messageInput.value = ''

        chatWs.sendTypingIndicator(false)
      }
    })

    elements.messageInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        elements.sendBtn.click()
      }
    })

    elements.password.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        elements.loginBtn.click()
      }
    })

    elements.newRoomId.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        elements.createRoomBtn.click()
      }
    })

    let typingTimer
    elements.messageInput.addEventListener('input', () => {
      chatWs.sendTypingIndicator(true)

      clearTimeout(typingTimer)

      typingTimer = setTimeout(() => {
        chatWs.sendTypingIndicator(false)
      }, 2000)
    })

    elements.messageInput.addEventListener('focus', () => {
      elements.chatView.classList.add('input-focused')
    })

    elements.messageInput.addEventListener('blur', () => {
      elements.chatView.classList.remove('input-focused')
    })

    createDarkModeToggle()

    createSoundToggle()
  }

  function createDarkModeToggle () {
    const toggle = document.createElement('button')
    toggle.className = 'theme-toggle'
    toggle.innerHTML = '🌙'
    toggle.title = 'Toggle Dark/Light Mode'

    toggle.addEventListener('click', () => {
      document.body.classList.toggle('light-theme')
      toggle.innerHTML = document.body.classList.contains('light-theme')
        ? '☀️'
        : '🌙'

      localStorage.setItem(
        'swecc_theme',
        document.body.classList.contains('light-theme') ? 'light' : 'dark'
      )
    })

    document.body.appendChild(toggle)

    if (localStorage.getItem('swecc_theme') === 'light') {
      document.body.classList.add('light-theme')
      toggle.innerHTML = '☀️'
    }
  }

  function createSoundToggle () {
    const toggle = document.createElement('button')
    toggle.className = 'sound-toggle'
    toggle.innerHTML = config.MESSAGE_SOUND ? '🔊' : '🔇'
    toggle.title = 'Toggle Sound'

    toggle.addEventListener('click', () => {
      config.MESSAGE_SOUND = !config.MESSAGE_SOUND
      toggle.innerHTML = config.MESSAGE_SOUND ? '🔊' : '🔇'

      localStorage.setItem('swecc_sound', config.MESSAGE_SOUND ? 'on' : 'off')

      showToast(
        'Sound',
        config.MESSAGE_SOUND
          ? 'Notification sounds enabled'
          : 'Notification sounds disabled',
        'info'
      )
    })

    document.body.appendChild(toggle)

    if (localStorage.getItem('swecc_sound') === 'off') {
      config.MESSAGE_SOUND = false
      toggle.innerHTML = '🔇'
    }
  }

  loadFromStorage()

  setupEventListeners()
  auth.initialize()
})
