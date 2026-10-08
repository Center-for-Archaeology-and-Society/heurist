import { reactive, computed } from 'vue'

const STORAGE_KEY = 'heurist-mobile-auth'
const LAST_DB_KEY = 'heurist-mobile-last-db'

export class AuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function serverRoot() {
  const configured = import.meta.env && import.meta.env.VITE_HEURIST_ROOT
  if (configured) {
    return configured.endsWith('/') ? configured : configured + '/'
  }
  const path = window.location.pathname
  const marker = '/hclient/'
  const idx = path.indexOf(marker)
  if (idx >= 0) {
    return path.slice(0, idx + 1)
  }
  return '/'
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.token || !parsed.db) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const state = reactive(Object.assign({
  token: null,
  db: null,
  username: null,
  expiresAt: null
}, loadStored()))

const isAuthenticated = computed(() =>
  Boolean(state.token) && (!state.expiresAt || state.expiresAt > Date.now())
)

let expiredHandlers = []
let expiryHandled = null
const sessionAttempts = new Set()
let sessionReuseDisabled = false

function persist() {
  if (state.token) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      token: state.token,
      db: state.db,
      username: state.username,
      expiresAt: state.expiresAt
    }))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
  if (state.db) {
    localStorage.setItem(LAST_DB_KEY, state.db)
  }
}

export function lastDb() {
  return localStorage.getItem(LAST_DB_KEY) || ''
}

async function login(db, username, password) {
  const body = JSON.stringify({ db, username, password, client: 'mobile' })
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  }
  const res = await fetch(serverRoot() + 'hserv/controller/auth.php', { ...init, credentials: 'same-origin' })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || !data.access_token) {
    const message = (data && (data.message || data.error)) || 'Login failed'
    throw new AuthError(res.status, message)
  }
  sessionReuseDisabled = false
  sessionAttempts.clear()
  state.token = data.access_token
  state.db = db
  state.username = username
  state.expiresAt = Date.now() + (Number(data.expires_in) || 600) * 1000
  persist()
  return data
}

function logout() {
  sessionReuseDisabled = true
  state.token = null
  state.db = null
  state.username = null
  state.expiresAt = null
  localStorage.removeItem(STORAGE_KEY)
}

// A desktop login is stored in an HttpOnly session cookie, not localStorage.
// Exchange it for a mobile token without asking for credentials again.
async function restoreSession(db = state.db || lastDb(), force = false) {
  if (isAuthenticated.value && state.db === db && !force) return true
  if (state.db && state.db !== db) {
    state.token = null
    state.db = null
    state.username = null
    state.expiresAt = null
    persist()
  }
  if (!db || sessionReuseDisabled || (!force && sessionAttempts.has(db))) return false
  sessionAttempts.add(db)
  try {
    const res = await fetch(serverRoot() + 'hserv/controller/auth.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'session', db, client: 'mobile' })
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.access_token) return false
    state.db = db
    state.username = data.username || ''
    applyToken(data)
    return true
  } catch {
    return false
  }
}

function onSessionExpired(handler) {
  expiredHandlers.push(handler)
  return () => {
    expiredHandlers = expiredHandlers.filter((fn) => fn !== handler)
  }
}

function applyToken(data) {
  state.token = data.access_token
  state.expiresAt = Date.now() + (Number(data.expires_in) || 600) * 1000
  persist()
}

function expireSession() {
  state.token = null
  state.expiresAt = null
  persist()
  expiredHandlers.forEach((fn) => fn())
}

async function requestRefresh() {
  if (!state.token || !state.db) {
    return false
  }
  try {
    const res = await fetch(
      serverRoot() + 'api/' + encodeURIComponent(state.db) + '/auth/refresh',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + state.token
        },
        body: JSON.stringify({ client: 'mobile' })
      }
    )
    if (res.status === 404 || res.status === 405) {
      // older servers: fall back to the direct controller entry point
      const fallback = await fetch(serverRoot() + 'hserv/controller/auth.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + state.token
        },
        body: JSON.stringify({ action: 'refresh', client: 'mobile' })
      })
      return await consumeRefresh(fallback)
    }
    return await consumeRefresh(res)
  } catch {
    return false
  }
}

async function consumeRefresh(res) {
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || !data.access_token) {
    return false
  }
  applyToken(data)
  return true
}

function handleUnauthorized() {
  if (expiryHandled) {
    return expiryHandled
  }
  expiryHandled = Promise.resolve()
    .then(async () => (await requestRefresh()) || (await restoreSession(state.db, true)))
    .then((renewed) => {
      if (!renewed) {
        expireSession()
      }
      return renewed
    })
    .finally(() => {
      expiryHandled = null
    })
  return expiryHandled
}

export function useAuth() {
  return {
    state,
    isAuthenticated,
    login,
    restoreSession,
    logout,
    lastDb,
    handleUnauthorized,
    onSessionExpired
  }
}
