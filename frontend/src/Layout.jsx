import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, Activity, Settings, HelpCircle, LogOut, Menu, X, Shield, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from './context/AuthContext'

function Layout() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const routes = [
    { path: '/', name: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: '/feed', name: 'Feed', icon: <MessageCircle size={18} /> },
    { path: '/users', name: 'Users', icon: <Users size={18} /> },
    { path: '/logs', name: 'Activity', icon: <Activity size={18} /> },
    { path: '/security', name: 'Security', icon: <Settings size={18} /> },
    { path: '/support', name: 'Support', icon: <HelpCircle size={18} /> },
  ]

  return (
    <div className="app-layout">
      <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X /> : <Menu />}</button>
      <nav className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <Shield size={24} color="#818cf8" />
          <h1>Social Hub</h1>
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
