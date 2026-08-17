import { useEffect, useState } from 'react'
import { Trash2, X, Send, Heart, MessageCircle, User as UserIcon } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'

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
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [usersRes, postsRes] = await Promise.all([
        api.get('/users'),
        api.get(`/posts/user/${userId}`),
      ])
      const found = usersRes.data.find(u => u.user_id === userId)
      setProfile(found || null)
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

  const isOwn = currentUser?.user_id === profile.user_id

  return <div className="page-container">
    <section className="profile-header glass-panel">
      <div className="profile-avatar">{profile.name?.slice(0, 1).toUpperCase() || <UserIcon size={32} />}</div>
      <div>
        <h2>{profile.name}</h2>
        <p>{profile.email}</p>
        <span className={`role-pill role-${profile.role.toLowerCase().replace(/\s+/g, '-')}`}>{profile.role}</span>
        <code className="profile-key">{profile.user_id}</code>
      </div>
    </section>
    <div className="page-header"><span className="eyebrow">{isOwn ? 'YOUR POSTS' : 'POSTS'}</span><h2>{posts.length} {posts.length === 1 ? 'post' : 'posts'}</h2></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {posts.length === 0 ? <div className="empty-state glass-panel"><strong>No posts yet</strong><span>{isOwn ? 'Share something from the feed page.' : 'This user has not posted anything yet.'}</span></div>
      : <div className="feed-list">{posts.map(post => (
        <article key={post.id} className="post-card glass-panel">
          <header className="post-header">
            <div className="post-avatar">{post.author_name?.slice(0, 1).toUpperCase()}</div>
            <div className="post-author"><strong>{post.author_name}</strong><time>{formatTime(post.created_at)}</time></div>
            {(currentUser?.user_id === post.author_id || currentUser?.role === 'Administrator') && (
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
  </div>
}
