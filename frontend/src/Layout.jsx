import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, Users, Activity, Settings, HelpCircle, LogOut, Menu, X, MessageCircle, Clapperboard, Wifi, WifiOff, Search } from 'lucide-react'
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
    { path: '/', name: 'Home', icon: <Home size={20} /> },
    { path: '/feed', name: 'Feed', icon: <MessageCircle size={20} /> },
    { path: '/clips', name: 'Clips', icon: <Clapperboard size={20} /> },
    { path: '/users', name: 'Users', icon: <Users size={20} /> },
    { path: '/logs', name: 'Activity', icon: <Activity size={20} /> },
    { path: '/security', name: 'Security', icon: <Settings size={20} /> },
    { path: '/support', name: 'Support', icon: <HelpCircle size={20} /> },
  ]

  // Facebook-style center tabs shown in the top navigation bar.
  const centerTabs = [
    { path: '/', name: 'Home', icon: <Home size={24} /> },
    { path: '/feed', name: 'Feed', icon: <MessageCircle size={24} /> },
    { path: '/clips', name: 'Clips', icon: <Clapperboard size={24} /> },
    { path: '/users', name: 'Users', icon: <Users size={24} /> },
  ]

  return (
    <div className="app-layout fb-layout">
      <header className="fb-topbar">
        <div className="fb-topbar-left">
          <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}>{open ? <X /> : <Menu />}</button>
          <NavLink to="/" className="fb-brand" aria-label="Social Hub home">
            <BrandLogo size={40} className="fb-logo" />
          </NavLink>
          <span className="fb-wordmark">socialhub</span>
          <div className="fb-search" aria-hidden="true"><Search size={16} /><span>Search Social Hub</span></div>
        </div>
        <nav className="fb-topbar-tabs" aria-label="Primary navigation">
          {centerTabs.map(t => (
            <NavLink
              key={t.path}
              to={t.path}
              end={t.path === '/'}
              title={t.name}
              className={({ isActive }) => `fb-tab ${isActive ? 'active' : ''}`}
            >
              {t.icon}
            </NavLink>
          ))}
        </nav>
        <div className="fb-topbar-right">
          <ConnectionBadge />
          <NavLink to={`/profile/${user?.user_id || ''}`} className="fb-me">
            <span className="avatar">{user?.name?.slice(0, 1).toUpperCase()}</span>
            <strong>{user?.name?.split(' ')[0]}</strong>
          </NavLink>
          <button className="fb-iconbtn" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </header>

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
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
