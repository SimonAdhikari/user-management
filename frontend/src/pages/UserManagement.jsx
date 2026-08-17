import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, ShieldCheck, UsersRound, UserRoundCheck } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import CreateUserForm from '../components/CreateUserForm'
import UserList from '../components/UserList'

function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('all')
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const fetchData = async () => { setLoading(true); setError(''); try { setUsers((await api.get('/users')).data) } catch (err) { setError(errorMessage(err)) } finally { setLoading(false) } }
  useEffect(() => { if (isAdmin) fetchData() }, [isAdmin])
  const filteredUsers = useMemo(() => users.filter(item => {
    const value = query.trim().toLowerCase()
    const matchesQuery = !value || [item.name, item.email, item.user_id].some(field => field.toLowerCase().includes(value))
    return matchesQuery && (role === 'all' || item.role === role)
  }), [users, query, role])

  if (!isAdmin) return <div className="page-container"><div className="empty-state glass-panel"><ShieldCheck size={38} /><h2>Administrator access required</h2><p>Your role can review your security settings and activity reports, but user management is reserved for administrators.</p></div></div>
  const admins = users.filter(item => item.role === 'Administrator').length
  const active = users.filter(item => !item.is_locked).length
  return <div className="page-container">
    <div className="page-header page-header-row"><div><span className="eyebrow">ACCESS CONTROL</span><h2>People & access</h2><p>Create secure accounts, find people quickly, and resolve locked accounts.</p></div><button className="btn btn-secondary" onClick={fetchData} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh</button></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <div className="metric-row"><div className="metric-card"><UsersRound size={19} /><div><span>All users</span><strong>{users.length}</strong></div></div><div className="metric-card metric-admin"><ShieldCheck size={19} /><div><span>Administrators</span><strong>{admins}</strong></div></div><div className="metric-card metric-safe"><UserRoundCheck size={19} /><div><span>Unlocked accounts</span><strong>{active}</strong></div></div></div>
    <div className="management-grid"><section className="glass-panel form-panel"><div className="section-heading"><span className="icon-chip"><UserRoundCheck size={18} /></span><div><h3>Add a user</h3><p>A secure user key is generated automatically.</p></div></div><CreateUserForm onUserCreated={fetchData} /></section><section className="glass-panel list-panel"><div className="section-heading"><div><h3>Directory</h3><p>{loading ? 'Loading secure records…' : `${filteredUsers.length} of ${users.length} protected user records`}</p></div></div><div className="directory-filters"><label><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, email, or key" aria-label="Search users" /></label><select value={role} onChange={event => setRole(event.target.value)} aria-label="Filter users by role"><option value="all">All roles</option><option>Administrator</option><option>Security Analyst</option><option>User</option></select></div><UserList users={filteredUsers} loading={loading} onUserUpdated={fetchData} emptyMessage={users.length ? 'No users match your filters.' : undefined} /></section></div>
  </div>
}

export default UserManagement
