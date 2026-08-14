import { useState } from 'react'
import { LockKeyhole, LockOpen, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { api, errorMessage } from '../services/api'
function UserList({ users, loading, onUserUpdated }) {
  const [unlocking, setUnlocking] = useState('')
  const [error, setError] = useState('')
  const unlock = async (userId) => {
    setUnlocking(userId); setError('')
    try { await api.post(`/users/${userId}/unlock`); onUserUpdated?.() }
    catch (err) { setError(errorMessage(err)) }
    finally { setUnlocking('') }
  }
  if (loading) return <div className="list-empty">Loading user directory…</div>
  if (!users.length) return <div className="list-empty"><UserRound size={32} /><strong>Your directory is ready</strong><span>Create the first user using the form.</span></div>
  return <>{error && <div className="alert alert-error" role="alert">{error}</div>}<div className="directory-list">{users.map(user => <article key={user.user_id} className="directory-row"><div className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="directory-identity"><strong>{user.name}</strong><span><Mail size={13} /> {user.email}</span></div><span className={`role-pill role-${user.role.toLowerCase().replaceAll(' ', '-')}`}>{user.role === 'Administrator' && <ShieldCheck size={13} />}{user.role}</span><div className="directory-key"><span>USER KEY</span><code>{user.user_id}</code></div>{user.is_locked && <button type="button" className="btn btn-secondary unlock-btn" title="Unlock account" disabled={unlocking === user.user_id} onClick={() => unlock(user.user_id)}><LockOpen size={15} /> {unlocking === user.user_id ? 'Unlocking…' : 'Unlock'}</button>}</article>)}</div></>
}
export default UserList
