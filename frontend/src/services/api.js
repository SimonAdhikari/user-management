import axios from 'axios'
import { mockApi } from './mockApi'

export const API_URL = import.meta.env.VITE_API_URL || '/api'

// `VITE_OFFLINE_MODE=true` (npm run dev:offline) forces offline mode permanently.
// Otherwise the app starts online and automatically falls back to the local
// offline store when the backend cannot be reached, then recovers when it can.
// When opened directly from disk (file://) there is no backend, so the app
// always runs in offline mode.
export const forcedOffline =
  import.meta.env.VITE_OFFLINE_MODE === 'true' ||
  (typeof window !== 'undefined' && window.location.protocol === 'file:')

const onlineClient = axios.create({ baseURL: API_URL, timeout: 10000 })

// ---------------------------------------------------------------------------
// Reactive connection state: 'online' | 'offline'
// ---------------------------------------------------------------------------
let connectionState = forcedOffline ? 'offline' : 'online'
const stateListeners = new Set()

export const getConnectionState = () => connectionState

export function onConnectionChange(listener) {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

function setConnectionState(next) {
  if (connectionState === next) return
  connectionState = next
  stateListeners.forEach((listener) => listener(next))
}

// True when the failure is a network-level problem (server down / unreachable)
// rather than an HTTP error response (4xx/5xx), which should surface normally.
const isNetworkFailure = (error) => !error?.response

async function withFallback(method, args) {
  if (connectionState === 'offline') return mockApi[method](...args)
  try {
    return await onlineClient[method](...args)
  } catch (error) {
    if (isNetworkFailure(error)) {
      setConnectionState('offline')
      startRecoveryProbe()
      return mockApi[method](...args)
    }
    throw error
  }
}

// While offline, periodically check whether the backend is reachable again so
// the app can seamlessly return to online mode.
let probeTimer = null
function startRecoveryProbe() {
  if (forcedOffline || probeTimer) return
  probeTimer = setInterval(async () => {
    try {
      await onlineClient.get('/health', { timeout: 4000 })
      setConnectionState('online')
      clearInterval(probeTimer)
      probeTimer = null
    } catch {
      /* still offline — keep probing */
    }
  }, 8000)
}

// React to the browser's own connectivity events as an extra signal.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => { if (!forcedOffline) { setConnectionState('offline'); startRecoveryProbe() } })
  window.addEventListener('online', () => { if (!forcedOffline) { setConnectionState('online'); if (probeTimer) { clearInterval(probeTimer); probeTimer = null } } })
}

// ---------------------------------------------------------------------------
// Unified API surface. Components import { api } and call get/post/put/delete;
// the calls are routed to the live backend or the offline store automatically.
// ---------------------------------------------------------------------------
export const api = {
  defaults: onlineClient.defaults,
  get: (...args) => withFallback('get', args),
  post: (...args) => withFallback('post', args),
  put: (...args) => withFallback('put', args),
  delete: (...args) => withFallback('delete', args),
}

const TOKEN_KEY = 'sums_token'

export function setAccessToken(token) {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token)
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    sessionStorage.removeItem(TOKEN_KEY)
    delete api.defaults.headers.common.Authorization
  }
}

export function loadStoredToken() {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`
  return token
}

export function errorMessage(error) {
  const detail = error.response?.data?.detail
  if (!detail) return 'Unable to complete that request. Please try again.'
  if (typeof detail === 'string') return detail
  // FastAPI 422 validation errors arrive as an array of { loc, msg, ... } objects
  if (Array.isArray(detail)) {
    return detail.map(item => (typeof item === 'string' ? item : item?.msg || 'Invalid input')).join(' · ')
  }
  if (typeof detail === 'object' && detail.msg) return detail.msg
  return 'Unable to complete that request. Please try again.'
}
