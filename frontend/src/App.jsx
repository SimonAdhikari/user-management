import { HashRouter, Routes, Route, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthPage from './pages/AuthPage'
import Layout from './Layout'
import UserManagement from './pages/UserManagement'
import Feed from './pages/Feed'
import Clips from './pages/Clips'
import Profile from './pages/Profile'
import CallModal from './components/CallModal'
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
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="feed" element={<Feed />} />
          <Route path="clips" element={<Clips />} />
          <Route path="profile/:userId" element={<ProfileRoute />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="logs" element={<ActivityLogs />} />
          <Route path="security" element={<MySecurity />} />
          <Route path="support" element={<Support />} />
        </Route>
      </Routes>
      <CallModal />
    </>
  )
}

function App() {
  // HashRouter works everywhere — including when index.html is opened
  // directly from the file system (file://) with no web server.
  return <HashRouter><AuthProvider><ProtectedApp /></AuthProvider></HashRouter>
}

export default App
