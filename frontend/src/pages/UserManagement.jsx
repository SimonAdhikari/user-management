import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, UsersRound, UserRoundCheck } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import CreateUserForm from '../components/CreateUserForm'
import UserList from '../components/UserList'

function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const fetchData = async () => { setLoading(true); setError(''); try { setUsers((await api.get('/users')).data) } catch (err) { setError(errorMessage(err)) } finally { setLoading(false) } }
  useEffect(() => { if (isAdmin) fetchData() }, [isAdmin])
  if (!isAdmin) return <div className="page-container"><div className="empty-state glass-panel"><ShieldCheck size={38} /><h2>Administrator access required</h2><p>Your role can view its privileges and security reports, but user management is reserved for administrators.</p></div></div>
  const admins = users.filter(item => item.role === 'Administrator').length
  return <div className="page-container">
    <div className="page-header page-header-row"><div><span className="eyebrow">ACCESS CONTROL</span><h2>People & access</h2><p>Create secure accounts and keep your organisation’s access clean.</p></div><button className="btn btn-secondary" onClick={fetchData} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh</button></div>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="metric-row"><div className="metric-card"><UsersRound size={19} /><div><span>All users</span><strong>{users.length}</strong></div></div><div className="metric-card metric-admin"><ShieldCheck size={19} /><div><span>Administrators</span><strong>{admins}</strong></div></div><div className="metric-card metric-safe"><UserRoundCheck size={19} /><div><span>Active accounts</span><strong>{users.filter(item => !item.is_locked).length}</strong></div></div></div>
    <div className="management-grid"><section className="glass-panel form-panel"><div className="section-heading"><span className="icon-chip"><UserRoundCheck size={18} /></span><div><h3>Add a user</h3><p>A secure user key is generated automatically.</p></div></div><CreateUserForm onUserCreated={fetchData} /></section><section className="glass-panel list-panel"><div className="section-heading"><div><h3>Directory</h3><p>{loading ? 'Loading secure records…' : `${users.length} protected user records`}</p></div></div><UserList users={users} loading={loading} onUserUpdated={fetchData} /></section></div>
  </div>
}
export default UserManagement
