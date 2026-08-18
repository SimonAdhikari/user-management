import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, Check, Clock, MessageCircle, Phone, Video, Pencil, UserCheck, UserPlus, Users, X } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { initiateCall } from '../services/callService'
import {
  useSocial, isFollowing, toggleFollow, friendStatus, sendFriendRequest,
  cancelFriendRequest, respondFriendRequest, removeFriend, isBlocked, blockUser, unblockUser,
  followerCount, followingCount, mutualFriendCount, presenceOf, profileExtra, setBio,
} from '../services/socialStore'

export default function ProfileCardModal({ user, onClose, onMessage }) {
  const { user: me } = useAuth()
  const navigate = useNavigate()
  useSocial()
  const [postCount, setPostCount] = useState(null)
  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState('')

  const isSelf = me?.user_id === user.user_id
  const { bio, cover } = profileExtra(user)
  const presence = presenceOf(user)

  useEffect(() => {
    let active = true
    api.get(`/posts/user/${user.user_id}`)
      .then(({ data }) => { if (active) setPostCount(data.length) })
      .catch(() => { if (active) setPostCount(0) })
    return () => { active = false }
  }, [user.user_id])

  const following = isFollowing(me?.user_id, user.user_id)
  const status = friendStatus(me?.user_id, user.user_id)
  const mutual = mutualFriendCount(me?.user_id, user.user_id)
  const blocked = isBlocked(me?.user_id, user.user_id)

  const handleFriend = () => {
    if (status === 'none') sendFriendRequest(me.user_id, user.user_id)
    else if (status === 'outgoing') cancelFriendRequest(me.user_id, user.user_id)
    else if (status === 'incoming') respondFriendRequest(me.user_id, user.user_id, true)
    else if (status === 'friends' && confirm(`Remove ${user.name} from your friends?`)) removeFriend(me.user_id, user.user_id)
  }

  const handleBlock = () => {
    if (blocked) {
      unblockUser(me.user_id, user.user_id)
    } else if (confirm(`Block ${user.name}? They won't be able to follow, message, or friend you.`)) {
      blockUser(me.user_id, user.user_id)
    }
  }

  const friendButton = {
    none: { icon: <UserPlus size={15} />, label: 'Add friend', className: '' },
    outgoing: { icon: <Clock size={15} />, label: 'Cancel request', className: 'btn-secondary' },
    incoming: { icon: <UserCheck size={15} />, label: 'Accept request', className: '' },
    friends: { icon: <Check size={15} />, label: 'Friends', className: 'btn-secondary is-friends' },
  }[status]

  return <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${user.name} profile card`}>
    <div className="profile-card-modal glass-panel" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="icon-button pcm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <div className={`pcm-cover cover-${cover}`} />
      <div className="pcm-head">
        <div className="pcm-avatar">{user.name.slice(0, 1).toUpperCase()}<span className={`presence-dot ${presence}`} /></div>
        <div className="pcm-title">
          <h3>{user.name}</h3>
          <div className="pcm-sub">
            <code>{user.user_id}</code>
          </div>
        </div>
      </div>

      {isSelf && editingBio ? (
        <form className="pcm-bio-edit" onSubmit={(event) => { event.preventDefault(); setBio(me.user_id, bioDraft); setEditingBio(false) }}>
          <input value={bioDraft} onChange={(event) => setBioDraft(event.target.value)} maxLength={120} autoFocus aria-label="Your bio" />
          <button type="submit" className="btn btn-compact">Save</button>
          <button type="button" className="btn btn-secondary btn-compact" onClick={() => setEditingBio(false)}>Cancel</button>
        </form>
      ) : (
        <p className="pcm-bio">
          {bio}
          {isSelf && <button type="button" className="icon-button" title="Edit bio" onClick={() => { setBioDraft(bio); setEditingBio(true) }}><Pencil size={13} /></button>}
        </p>
      )}

      <div className="pcm-stats">
        <div><strong>{postCount ?? '…'}</strong><span>Posts</span></div>
        <div><strong>{followerCount(user.user_id)}</strong><span>Followers</span></div>
        <div><strong>{followingCount(user.user_id)}</strong><span>Following</span></div>
      </div>

      {!isSelf && mutual > 0 && <div className="pcm-mutual"><Users size={14} /> {mutual} mutual friends</div>}

      {!isSelf && <div className="pcm-actions">
        <button type="button" className={`btn btn-compact pcm-btn ${following ? 'btn-secondary is-following' : ''}`} onClick={() => toggleFollow(me.user_id, user.user_id)}>
          {following ? <><Check size={15} /> Following</> : 'Follow'}
        </button>
        <button type="button" className={`btn btn-compact pcm-btn ${friendButton.className}`} onClick={handleFriend}>{friendButton.icon} {friendButton.label}</button>
        <button type="button" className="btn btn-compact pcm-btn btn-secondary" onClick={() => { onMessage?.(user); onClose() }}><MessageCircle size={15} /> Message</button>
        <button type="button" className="btn btn-compact pcm-btn btn-call" onClick={() => { initiateCall(user.user_id, 'audio').catch(err => alert(err.message)); onClose() }}><Phone size={15} /> Call</button>
        <button type="button" className="btn btn-compact pcm-btn btn-call-video" onClick={() => { initiateCall(user.user_id, 'video').catch(err => alert(err.message)); onClose() }}><Video size={15} /> Video</button>
        <button type="button" className={`btn btn-compact pcm-btn ${blocked ? 'btn-secondary' : 'btn-danger'}`} onClick={handleBlock}>
          <Ban size={15} /> {blocked ? 'Unblock' : 'Block'}
        </button>
      </div>}

      <button type="button" className="pcm-view" onClick={() => { onClose(); navigate(`/profile/${user.user_id}`) }}>View full profile</button>
    </div>
  </div>
}
