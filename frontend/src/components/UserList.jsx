import { useEffect, useState } from 'react'
import { BadgeCheck, Check, Clock, LockOpen, Mail, MessageCircle, Phone, Video, ShieldCheck, UserCheck, UserPlus, UserRound, Users } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { initiateCall } from '../services/callService'
import {
  useSocial, isFollowing, toggleFollow, friendStatus, sendFriendRequest,
  cancelFriendRequest, respondFriendRequest, followerCount, mutualFriendCount, presenceOf,
} from '../services/socialStore'
import ProfileCardModal from './ProfileCardModal'
import MessengerModal from './MessengerModal'

function FriendButton({ user, me }) {
  const status = friendStatus(me.user_id, user.user_id)
  const config = {
    none: { icon: <UserPlus size={14} />, label: 'Add friend', className: 'btn-friend' },
    outgoing: { icon: <Clock size={14} />, label: 'Requested', className: 'btn-friend btn-friend-pending' },
    incoming: { icon: <UserCheck size={14} />, label: 'Accept', className: 'btn-friend btn-friend-accept' },
    friends: { icon: <Check size={14} />, label: 'Friends', className: 'btn-friend btn-friend-done' },
  }[status]
  const handleClick = () => {
    if (status === 'none') sendFriendRequest(me.user_id, user.user_id)
    else if (status === 'outgoing') cancelFriendRequest(me.user_id, user.user_id)
    else if (status === 'incoming') respondFriendRequest(me.user_id, user.user_id, true)
  }
  return <button type="button" className={config.className} title={status === 'outgoing' ? 'Cancel friend request' : config.label} onClick={handleClick}>{config.icon} {config.label}</button>
}

function UserList({ users, loading, onUserUpdated, emptyMessage }) {
  const { user: me } = useAuth()
  useSocial()
  const [unlocking, setUnlocking] = useState('')
  const [error, setError] = useState('')
  const [profileUser, setProfileUser] = useState(null)
  const [chatUser, setChatUser] = useState(null)
  const [allUsers, setAllUsers] = useState([])

  useEffect(() => {
    api.get('/users').then(({ data }) => setAllUsers(data)).catch(() => {})
  }, [users])

  const unlock = async (userId) => {
    setUnlocking(userId); setError('')
    try { await api.post(`/users/${userId}/unlock`); onUserUpdated?.() }
    catch (err) { setError(errorMessage(err)) }
    finally { setUnlocking('') }
  }

  if (loading) return <div className="list-empty">Loading user directory…</div>
  if (!users.length) return <div className="list-empty"><UserRound size={32} /><strong>Your directory is ready</strong><span>{emptyMessage || 'Create the first user using the form.'}</span></div>

  const suggestions = allUsers
    .filter(item => item.user_id !== me?.user_id && friendStatus(me?.user_id, item.user_id) === 'none')
    .sort((a, b) => mutualFriendCount(me?.user_id, b.user_id) - mutualFriendCount(me?.user_id, a.user_id))
    .slice(0, 3)

  return <>
    {error && <div className="alert alert-error" role="alert">{error}</div>}

    {suggestions.length > 0 && <div className="suggestions">
      <h4><Users size={15} /> People you may know</h4>
      <div className="suggestion-row">
        {suggestions.map(item => <div key={item.user_id} className="suggestion-card">
          <button type="button" className="suggestion-avatar" onClick={() => setProfileUser(item)} aria-label={`View ${item.name}`}>
            {item.name.slice(0, 1).toUpperCase()}
            <span className={`presence-dot ${presenceOf(item)}`} />
          </button>
          <strong>{item.name}{item.role === 'Administrator' && <BadgeCheck size={14} className="verified-badge" />}</strong>
          <span>{mutualFriendCount(me?.user_id, item.user_id)} mutual friends</span>
          <div className="suggestion-actions">
            <FriendButton user={item} me={me} />
            <button type="button" className={`btn-follow ${isFollowing(me?.user_id, item.user_id) ? 'following' : ''}`} onClick={() => toggleFollow(me?.user_id, item.user_id)}>
              {isFollowing(me?.user_id, item.user_id) ? <><Check size={13} /> Following</> : 'Follow'}
            </button>
          </div>
        </div>)}
      </div>
    </div>}

    <div className="directory-list">
      {users.map(user => {
        const isSelf = user.user_id === me?.user_id
        const following = isFollowing(me?.user_id, user.user_id)
        return <article key={user.user_id} className="directory-row">
          <button type="button" className="user-avatar avatar-btn" title="View profile card" onClick={() => setProfileUser(user)}>
            {user.name.slice(0, 1).toUpperCase()}
            <span className={`presence-dot ${presenceOf(user)}`} />
          </button>
          <div className="directory-identity">
            <strong className="identity-name" onClick={() => setProfileUser(user)} title="View profile card">
              {user.name}
              {user.role === 'Administrator' && <BadgeCheck size={15} className="verified-badge" title="Verified administrator" />}
            </strong>
            <span><Mail size={13} /> {user.email}</span>
          </div>
          <span className={`role-pill role-${user.role.toLowerCase().replaceAll(' ', '-')}`}>{user.role === 'Administrator' && <ShieldCheck size={13} />}{user.role}</span>
          <div className="social-stats">
            <span><strong>{followerCount(user.user_id)}</strong> followers</span>
            {!isSelf && <span><strong>{mutualFriendCount(me?.user_id, user.user_id)}</strong> mutual</span>}
          </div>
          <div className="directory-key"><span>USER KEY</span><code>{user.user_id}</code></div>
          {!isSelf && <div className="social-actions">
            <button type="button" className={`btn-follow ${following ? 'following' : ''}`} title={following ? 'Unfollow' : 'Follow'} onClick={() => toggleFollow(me?.user_id, user.user_id)}>
              {following ? <><Check size={14} /> Following</> : 'Follow'}
            </button>
            <FriendButton user={user} me={me} />
            <button type="button" className="btn-message" title="Send message" onClick={() => setChatUser(user)}><MessageCircle size={14} /> Message</button>
            <button type="button" className="btn-call" title="Start audio call" onClick={() => initiateCall(user.user_id, 'audio').catch(err => alert(err.message))}><Phone size={14} /> Call</button>
            <button type="button" className="btn-call-video" title="Start video call" onClick={() => initiateCall(user.user_id, 'video').catch(err => alert(err.message))}><Video size={14} /> Video</button>
          </div>}
          {isSelf && <span className="you-pill">You</span>}
          {user.is_locked && <button type="button" className="btn btn-secondary unlock-btn" title="Unlock account" disabled={unlocking === user.user_id} onClick={() => unlock(user.user_id)}><LockOpen size={15} /> {unlocking === user.user_id ? 'Unlocking…' : 'Unlock'}</button>}
        </article>
      })}
    </div>

    {profileUser && <ProfileCardModal user={profileUser} onClose={() => setProfileUser(null)} onMessage={setChatUser} />}
    {chatUser && <MessengerModal user={chatUser} onClose={() => setChatUser(null)} />}
  </>
}
export default UserList
