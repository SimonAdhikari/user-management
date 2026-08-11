import { createContext, useContext, useState } from 'react'
import { api } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem('sums_user') || 'null'))

  const login = ({ user: loggedInUser }) => {
    sessionStorage.setItem('sums_user', JSON.stringify(loggedInUser))
    setUser(loggedInUser)
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch { /* Session may already be expired. */ }
    sessionStorage.removeItem('sums_user')
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
