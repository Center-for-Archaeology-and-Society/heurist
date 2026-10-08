import { useAuth, serverRoot } from '../store/auth.js'

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || 'Request failed (' + status + ')')
    this.name = 'ApiError'
    this.status = status
    this.error = code || 'ERROR'
    this.message = message || this.message
  }
}

export { serverRoot }

export function apiUrl(db, path, query) {
  const url = new URL(serverRoot() + 'api/' + encodeURIComponent(db) + '/' + String(path).replace(/^\//, ''))
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    }
  }
  return url.toString()
}

export function absoluteUrl(url) {
  if (!url || /^(https?:|data:|blob:)/i.test(url)) {
    return url
  }
  return serverRoot() + String(url).replace(/^\//, '')
}

async function parseBody(res) {
  const text = await res.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

export async function apiRequest(path, { method = 'GET', query, body, db, headers, signal } = {}) {
  const auth = useAuth()
  const database = db || auth.state.db
  if (!database) {
    throw new ApiError(0, 'NO_DB', 'No database selected')
  }
  const requestHeaders = { Accept: 'application/json', ...headers }
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json; charset=UTF-8'
  }
  if (auth.state.token) {
    requestHeaders.Authorization = 'Bearer ' + auth.state.token
  }

  const doFetch = () => fetch(apiUrl(database, path, query), {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body)),
    signal,
    credentials: 'same-origin'
  })

  let res = await doFetch()
  if (res.status === 401) {
    const renewed = await auth.handleUnauthorized()
    if (renewed) {
      res = await doFetch()
    } else {
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired — please sign in again')
    }
  }
  const data = await parseBody(res)
  if (!res.ok) {
    throw new ApiError(res.status, data && data.error, data && (data.message || data.error))
  }
  if (data && typeof data.status === 'string' && data.status.toLowerCase() === 'error') {
    throw new ApiError(200, data.error || 'ERROR', data.message || 'Request failed')
  }
  return data
}
