import { LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react'
function UserList({ users, loading }) {
  if (loading) return <div className="list-empty">Loading user directory…</div>
  if (!users.length) return <div className="list-empty"><UserRound size={32} /><strong>Your directory is ready</strong><span>Create the first user using the form.</span></div>
  return <div className="directory-list">{users.map(user => <article key={user.user_id} className="directory-row"><div className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="directory-identity"><strong>{user.name}</strong><span><Mail size={13} /> {user.email}</span></div><span className={`role-pill role-${user.role.toLowerCase().replaceAll(' ', '-')}`}>{user.role === 'Administrator' && <ShieldCheck size={13} />}{user.role}</span><div className="directory-key"><span>USER KEY</span><code>{user.user_id}</code></div>{user.is_locked && <span className="lock-state" title="Account locked"><LockKeyhole size={16} /></span>}</article>)}</div>
}
export default UserList
