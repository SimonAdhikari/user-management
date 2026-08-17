import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Activity, Settings, HelpCircle, LogOut, Menu, X, MessageCircle, Clapperboard, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext'
import { getConnectionState, onConnectionChange } from './services/api'
import BrandLogo from './components/BrandLogo'
import InstallPrompt from './components/InstallPrompt'

function ConnectionBadge() {
  const [state, setState] = useState(getConnectionState())
  useEffect(() => onConnectionChange(setState), [])
  const offline = state === 'offline'
  return <span className={`offline-banner ${offline ? 'offline' : 'online'}`} role="status">
    {offline ? <><WifiOff size={14} /> Offline mode — changes saved locally</> : <><Wifi size={14} /> Online</>}
  </span>
}

function Layout() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  // Close the mobile drawer whenever the route changes (incl. back/forward).
  useEffect(() => { setOpen(false) }, [location.pathname])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.classList.toggle('drawer-open', open)
    return () => document.body.classList.remove('drawer-open')
  }, [open])

  const routes = [
    { path: '/', name: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: '/feed', name: 'Feed', icon: <MessageCircle size={18} /> },
    { path: '/clips', name: 'Clips', icon: <Clapperboard size={18} /> },
    { path: '/users', name: 'Users', icon: <Users size={18} /> },
    { path: '/logs', name: 'Activity', icon: <Activity size={18} /> },
    { path: '/security', name: 'Security', icon: <Settings size={18} /> },
    { path: '/support', name: 'Support', icon: <HelpCircle size={18} /> },
  ]

  // Main sections shown as clickable icon tabs at the top of every page.
  const quickRoutes = [
    { path: '/', name: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { path: '/feed', name: 'Feed', icon: <MessageCircle size={17} /> },
    { path: '/clips', name: 'Clips', icon: <Clapperboard size={17} /> },
  ]

  return (
    <div className="app-layout">
      <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}>{open ? <X /> : <Menu />}</button>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-header">
          <BrandLogo size={40} className="sidebar-logo" />
          <h1>Social Hub</h1>
        </div>
        <div style={{ flex: 1 }}>
          {routes.map(r => (
            <NavLink 
              key={r.path}
              to={r.path}
              end={r.path === '/'}
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
          <button onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
        <InstallPrompt />
      </nav>

      <main className="main-content">
        <ConnectionBadge />
        <nav className="page-tabs" aria-label="Section navigation">
          {quickRoutes.map(r => (
            <NavLink
              key={r.path}
              to={r.path}
              end={r.path === '/'}
              className={({ isActive }) => `page-tab ${isActive ? 'active' : ''}`}
            >
              {r.icon}
              <span>{r.name}</span>
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
