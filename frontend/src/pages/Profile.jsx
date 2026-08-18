import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, Check, Clock, Heart, MessageCircle, Phone, Trash2, UserCheck, UserPlus, User as UserIcon, Users, Video } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  useSocial, isFollowing, toggleFollow, friendStatus, sendFriendRequest,
  cancelFriendRequest, respondFriendRequest, removeFriend, isBlocked, blockUser, unblockUser,
  followerCount, followingCount, mutualFriendCount, presenceOf, profileExtra,
} from '../services/socialStore'
import MessengerModal from '../components/MessengerModal'
import { initiateCall } from '../services/callService'

const formatTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const mediaUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  // Keep /media/... relative so it flows through the dev/reverse proxy to the
  // storage server (port 8001). Prefixing the API origin would 404/ORB.
  return path
}

export default function Profile({ userId }) {
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  useSocial()
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chatOpen, setChatOpen] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [peopleRes, postsRes] = await Promise.all([
        api.get('/people'),
        api.get(`/posts/user/${userId}`),
      ])
      setProfile(peopleRes.data.find(u => u.user_id === userId) || null)
      setPosts(postsRes.data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])

  const handleDelete = async (postId) => {
    if (!confirm('Delete this post?')) return
    try { await api.delete(`/posts/${postId}`); await load() }
    catch (err) { alert(errorMessage(err)) }
  }

  if (loading) return <div className="page-container"><div className="empty-state glass-panel"><strong>Loading profile…</strong></div></div>
  if (!profile) return <div className="page-container"><div className="empty-state glass-panel"><strong>User not found</strong></div></div>

  const myId = currentUser?.user_id
  const isOwn = myId === profile.user_id
  const { bio, cover } = profileExtra(profile)
  const following = isFollowing(myId, profile.user_id)
  const status = friendStatus(myId, profile.user_id)
  const blocked = isBlocked(myId, profile.user_id)

  const handleFriend = () => {
    if (status === 'none') sendFriendRequest(myId, profile.user_id)
    else if (status === 'outgoing') cancelFriendRequest(myId, profile.user_id)
    else if (status === 'incoming') respondFriendRequest(myId, profile.user_id, true)
    else if (status === 'friends' && confirm(`Remove ${profile.name} from your friends?`)) removeFriend(myId, profile.user_id)
  }

  const friendButton = {
    none: { icon: <UserPlus size={15} />, label: 'Add friend', className: '' },
    outgoing: { icon: <Clock size={15} />, label: 'Cancel request', className: 'btn-secondary' },
    incoming: { icon: <UserCheck size={15} />, label: 'Accept request', className: '' },
    friends: { icon: <Check size={15} />, label: 'Friends', className: 'btn-secondary is-friends' },
  }[status]

  return <div className="page-container profile-page">
    <section className="profile-cover glass-panel">
      <div className={`profile-cover-art cover-${cover}`} />
      <div className="profile-main">
        <div className="profile-avatar">{profile.name?.slice(0, 1).toUpperCase() || <UserIcon size={32} />}<span className={`presence-dot ${presenceOf(profile)}`} /></div>
        <div className="profile-info">
          <h2>{profile.name}</h2>
          <p className="profile-bio">{bio}</p>
          <div className="profile-stats">
            <span><strong>{posts.length}</strong> posts</span>
            <span><strong>{followerCount(profile.user_id)}</strong> followers</span>
            <span><strong>{followingCount(profile.user_id)}</strong> following</span>
            {!isOwn && <span><strong>{mutualFriendCount(myId, profile.user_id)}</strong> mutual friends</span>}
          </div>
        </div>
        <div className="profile-actions">
          {isOwn ? (
            <button className="btn btn-secondary" onClick={() => navigate('/people')}><Users size={16} /> Find friends</button>
          ) : <>
            <button className={`btn ${following ? 'btn-secondary' : ''}`} onClick={() => toggleFollow(myId, profile.user_id)}>
              {following ? <><Check size={16} /> Following</> : 'Follow'}
            </button>
            <button className={`btn ${friendButton.className}`} onClick={handleFriend}>{friendButton.icon} {friendButton.label}</button>
            <button className="btn btn-secondary" onClick={() => setChatOpen(true)}><MessageCircle size={16} /> Message</button>
            <button className="btn btn-secondary" title="Audio call" onClick={() => initiateCall(profile.user_id, 'audio').catch(err => alert(err.message))}><Phone size={16} /></button>
            <button className="btn btn-secondary" title="Video call" onClick={() => initiateCall(profile.user_id, 'video').catch(err => alert(err.message))}><Video size={16} /></button>
            <button className={`btn ${blocked ? 'btn-secondary' : 'btn-danger'}`} onClick={() => blocked ? unblockUser(myId, profile.user_id) : blockUser(myId, profile.user_id)}>
              <Ban size={16} /> {blocked ? 'Unblock' : 'Block'}
            </button>
          </>}
        </div>
      </div>
    </section>

    <div className="page-header"><span className="eyebrow">{isOwn ? 'YOUR POSTS' : 'POSTS'}</span><h2>{posts.length} {posts.length === 1 ? 'post' : 'posts'}</h2></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {posts.length === 0 ? <div className="empty-state glass-panel"><strong>No posts yet</strong><span>{isOwn ? 'Share something from the home page.' : 'This user has not posted anything yet.'}</span></div>
      : <div className="feed-list">{posts.map(post => (
        <article key={post.id} className="post-card glass-panel">
          <header className="post-header">
            <div className="post-avatar">{post.author_name?.slice(0, 1).toUpperCase()}</div>
            <div className="post-author"><strong>{post.author_name}</strong><time>{formatTime(post.created_at)}</time></div>
            {currentUser?.user_id === post.author_id && (
              <button className="icon-button" onClick={() => handleDelete(post.id)} aria-label="Delete post"><Trash2 size={16} /></button>
            )}
          </header>
          <div className="post-body"><p>{post.body}</p></div>
          {post.media?.length > 0 && (
            <div className={`post-media post-media-${Math.min(post.media.length, 4)}`}>
              {post.media.map((item, index) => (
                <div key={index} className="post-media-item">
                  {item.kind === 'image' ? <img src={mediaUrl(item.url)} alt={item.filename || ''} loading="lazy" /> : <video src={mediaUrl(item.url)} controls />}
                </div>
              ))}
            </div>
          )}
          <footer className="post-actions">
            <span className="post-action"><Heart size={18} /> {post.like_count}</span>
            <span className="post-action"><MessageCircle size={18} /> {post.comment_count}</span>
          </footer>
        </article>
      ))}</div>}

    {chatOpen && <MessengerModal user={profile} onClose={() => setChatOpen(false)} />}
  </div>
}
