import axios from 'axios'
import { mockApi } from './mockApi'

export const API_URL = import.meta.env.VITE_API_URL || '/api'
export const isOfflineMode = import.meta.env.VITE_OFFLINE_MODE === 'true'

export const api = isOfflineMode
  ? mockApi
  : axios.create({ baseURL: API_URL, timeout: 10000 })

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
  return error.response?.data?.detail || 'Unable to complete that request. Please try again.'
}
