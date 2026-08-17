import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthPage from './pages/AuthPage'
import Layout from './Layout'
import UserManagement from './pages/UserManagement'
import Feed from './pages/Feed'
import Profile from './pages/Profile'
import {
  Dashboard, ActivityLogs, MySecurity, Support
} from './pages/MockPages'

function ProfileRoute() {
  const { userId } = useParams()
  return <Profile userId={userId} />
}

function ProtectedApp() {
  const { user } = useAuth()
  if (!user) return <AuthPage />
  return (
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="feed" element={<Feed />} />
          <Route path="profile/:userId" element={<ProfileRoute />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="logs" element={<ActivityLogs />} />
          <Route path="security" element={<MySecurity />} />
          <Route path="support" element={<Support />} />
        </Route>
      </Routes>
  )
}

function App() {
  return <BrowserRouter><AuthProvider><ProtectedApp /></AuthProvider></BrowserRouter>
}

export default App
