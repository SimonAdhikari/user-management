import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, Shield, Activity, LogIn,
  Network, AlertTriangle, Bug, Search, Download,
  Settings, Sliders, User, HelpCircle, Info, LogOut, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from './context/AuthContext'

function Layout() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const routes = [
    { path: '/', name: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: '/users', name: 'User Management', icon: <Users size={18} /> },
    { path: '/roles', name: 'Roles & Policies', icon: <Shield size={18} /> },
    { path: '/logs', name: 'Activity Logs', icon: <Activity size={18} /> },
    { path: '/logins', name: 'Login Attempts', icon: <LogIn size={18} /> },
    { path: '/network', name: 'Network Monitor', icon: <Network size={18} /> },
    { path: '/incidents', name: 'Incident Response', icon: <AlertTriangle size={18} /> },
    { path: '/threats', name: 'Threat Intel', icon: <Bug size={18} /> },
    { path: '/scans', name: 'Vulnerability Scans', icon: <Search size={18} /> },
    { path: '/export', name: 'Data Export', icon: <Download size={18} /> },
    { path: '/security', name: 'Security Settings', icon: <Settings size={18} /> },
    { path: '/settings', name: 'System Config', icon: <Sliders size={18} /> },
    { path: '/profile', name: 'My Profile', icon: <User size={18} /> },
    { path: '/support', name: 'Help & Support', icon: <HelpCircle size={18} /> },
    { path: '/about', name: 'About Institute', icon: <Info size={18} /> },
  ]

  return (
    <div className="app-layout">
      <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X /> : <Menu />}</button>
      <nav className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <Shield size={24} color="#818cf8" />
          <h1>Cyber Portal</h1>
        </div>
        <div style={{ flex: 1 }}>
          {routes.map(r => (
            <NavLink 
              key={r.path}
              to={r.path}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {r.icon}
              {r.name}
            </NavLink>
          ))}
        </div>
        <div className="sidebar-user">
          <div className="avatar">{user?.name?.slice(0, 1).toUpperCase()}</div>
          <div><strong>{user?.name}</strong><span>{user?.role}</span></div>
          <button onClick={logout} title="Sign out"><LogOut size={16} /></button>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
