import { createContext, useContext, useState } from 'react'
import { api, setAccessToken, loadStoredToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  loadStoredToken()
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem('sums_user') || 'null'))

  const login = ({ token, user: loggedInUser }) => {
    if (token) setAccessToken(token)
    sessionStorage.setItem('sums_user', JSON.stringify(loggedInUser))
    setUser(loggedInUser)
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch { /* Session may already be expired. */ }
    setAccessToken(null)
    sessionStorage.removeItem('sums_user')
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
