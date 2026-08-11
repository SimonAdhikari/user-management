import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthPage from './pages/AuthPage'
import Layout from './Layout'
import UserManagement from './pages/UserManagement'
import {
  Dashboard, RolesPolicies, ActivityLogs, LoginAttempts,
  NetworkMonitor, IncidentResponse, ThreatIntel, VulnerabilityScans,
  DataExport, SecuritySettings, SystemConfig, MyProfile,
  Support, About
} from './pages/MockPages'

function ProtectedApp() {
  const { user } = useAuth()
  if (!user) return <AuthPage />
  return (
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="roles" element={<RolesPolicies />} />
          <Route path="logs" element={<ActivityLogs />} />
          <Route path="logins" element={<LoginAttempts />} />
          <Route path="network" element={<NetworkMonitor />} />
          <Route path="incidents" element={<IncidentResponse />} />
          <Route path="threats" element={<ThreatIntel />} />
          <Route path="scans" element={<VulnerabilityScans />} />
          <Route path="export" element={<DataExport />} />
          <Route path="security" element={<SecuritySettings />} />
          <Route path="settings" element={<SystemConfig />} />
          <Route path="profile" element={<MyProfile />} />
          <Route path="support" element={<Support />} />
          <Route path="about" element={<About />} />
        </Route>
      </Routes>
  )
}

function App() {
  return <BrowserRouter><AuthProvider><ProtectedApp /></AuthProvider></BrowserRouter>
}

export default App
