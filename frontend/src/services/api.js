import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export const api = axios.create({ baseURL: API_URL, timeout: 10000, withCredentials: true })

export function setAccessToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`
  else delete api.defaults.headers.common.Authorization
}

export function errorMessage(error) {
  return error.response?.data?.detail || 'Unable to complete that request. Please try again.'
}
