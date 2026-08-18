import { HashRouter, Routes, Route, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthPage from './pages/AuthPage'
import Layout from './Layout'
import Home from './pages/Home'
import Feed from './pages/Feed'
import Clips from './pages/Clips'
import People from './pages/People'
import Profile from './pages/Profile'
import CallModal from './components/CallModal'

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
          <Route index element={<Home />} />
          <Route path="feed" element={<Feed />} />
          <Route path="clips" element={<Clips />} />
          <Route path="people" element={<People />} />
          <Route path="profile/:userId" element={<ProfileRoute />} />
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
