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
  const body = JSON.stringify({ db, username, password })
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  }
  let res = await fetch(serverRoot() + 'api/' + encodeURIComponent(db) + '/login', init)
  if (res.status === 404 || res.status === 405) {
    res = await fetch(serverRoot() + 'hserv/controller/auth.php', init)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || !data.access_token) {
    const message = (data && (data.message || data.error)) || 'Login failed'
    throw new AuthError(res.status, message)
  }
  state.token = data.access_token
  state.db = db
  state.username = username
  state.expiresAt = Date.now() + (Number(data.expires_in) || 600) * 1000
  persist()
  return data
}

function logout() {
  state.token = null
  state.db = null
  state.username = null
  state.expiresAt = null
  localStorage.removeItem(STORAGE_KEY)
}

function onSessionExpired(handler) {
  expiredHandlers.push(handler)
  return () => {
    expiredHandlers = expiredHandlers.filter((fn) => fn !== handler)
  }
}

function handleUnauthorized() {
  if (expiryHandled) {
    return expiryHandled
  }
  expiryHandled = Promise.resolve().then(() => {
    state.token = null
    persist()
    expiredHandlers.forEach((fn) => fn())
    return false
  }).finally(() => {
    expiryHandled = null
  })
  return expiryHandled
}

export function useAuth() {
  return {
    state,
    isAuthenticated,
    login,
    logout,
    lastDb,
    handleUnauthorized,
    onSessionExpired
  }
}
