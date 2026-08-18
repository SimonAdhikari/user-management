import { useEffect, useRef, useState } from 'react'
import { ImagePlus, MessageCircle, Trash2, X, Heart, Repeat2, Share2, User as UserIcon } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import CommentSection from '../components/CommentSection'
import ShareModal from '../components/ShareModal'

// Facebook-style reaction palette
export const REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Like' },
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'haha', emoji: '😂', label: 'Haha' },
  { type: 'wow', emoji: '😮', label: 'Wow' },
  { type: 'sad', emoji: '😢', label: 'Sad' },
  { type: 'angry', emoji: '😠', label: 'Angry' },
]

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

function RepostCard({ repost }) {
  return <div className="repost-card">
    <header className="repost-header">
      <div className="post-avatar small">{repost.author_name?.slice(0, 1).toUpperCase()}</div>
      <div className="post-author">
        <strong>{repost.author_name}</strong>
        <time>{formatTime(repost.created_at)}</time>
      </div>
    </header>
    <div className="post-body"><p>{repost.body}</p></div>
    {repost.media?.length > 0 && (
      <div className={`post-media post-media-${Math.min(repost.media.length, 4)}`}>
        {repost.media.map((item, index) => (
          <div key={index} className="post-media-item">
            {item.kind === 'image'
              ? <img src={mediaUrl(item.url)} alt={item.filename || ''} loading="lazy" />
              : <video src={mediaUrl(item.url)} controls preload="metadata" />}
          </div>
        ))}
      </div>
    )}
    <footer className="repost-stats">
      <span><Heart size={14} /> {repost.like_count}</span>
      <span><MessageCircle size={14} /> {repost.comment_count}</span>
    </footer>
  </div>
}

export function PostCard({ post, currentUser, onChange, onDelete }) {
  const [showComments, setShowComments] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [liked, setLiked] = useState(post.like_count > 0 && post.likes?.includes?.(currentUser?.user_id))
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [reactions, setReactions] = useState(post.reactions || {})
  const [myReaction, setMyReaction] = useState(post.my_reaction || null)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [shareCount, setShareCount] = useState(post.share_count || 0)
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)

  const totalReactions = REACTIONS.reduce((sum, r) => sum + (reactions[r.type] || 0), 0)

  // Touch support: a long press (450ms) on the like button opens the reaction
  // picker, since hover doesn't exist on mobile. A quick tap still toggles like.
  const startLongPress = () => {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setShowReactionPicker(true)
    }, 450)
  }
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }
  useEffect(() => cancelLongPress, [])

  const handleLike = async () => {
    if (longPressFired.current) { longPressFired.current = false; return }
    // On touch, a tap while the picker is open dismisses it instead of liking.
    if (showReactionPicker) { setShowReactionPicker(false); return }
    setBusy(true)
    try {
      const { data } = await api.post(`/posts/${post.id}/like`)
      setLiked(data.liked)
      setLikeCount(data.like_count)
    } catch (err) {
      alert(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleReact = async (type) => {
    setShowReactionPicker(false)
    try {
      const { data } = await api.post(`/posts/${post.id}/react`, { reaction: type })
      setMyReaction(data.my_reaction)
      setReactions(data.reactions)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  const handleShared = async () => {
    setShareCount((count) => count + 1)
    await onChange()
  }

  const canDelete = currentUser?.user_id === post.author_id

  return <article className="post-card glass-panel">
    <header className="post-header">
      <div className="post-avatar">{post.author_name?.slice(0, 1).toUpperCase() || '?'}</div>
      <div className="post-author">
        <strong>{post.author_name}</strong>
        <time>{formatTime(post.created_at)}</time>
      </div>
      {canDelete && <button className="icon-button" onClick={() => onDelete(post.id)} title="Delete post" aria-label="Delete post"><Trash2 size={16} /></button>}
    </header>
    {post.repost_of && <div className="repost-banner"><Repeat2 size={14} /> Reposted</div>}
    <div className="post-body"><p>{post.body}</p></div>
    {post.media?.length > 0 && (
      <div className={`post-media post-media-${Math.min(post.media.length, 4)}`}>
        {post.media.map((item, index) => (
          <div key={index} className="post-media-item">
            {item.kind === 'image'
              ? <img src={mediaUrl(item.url)} alt={item.filename || 'Post image'} loading="lazy" />
              : <video src={mediaUrl(item.url)} controls preload="metadata" />}
          </div>
        ))}
      </div>
    )}
    {post.repost_of && <RepostCard repost={post.repost_of} />}
    <footer className="post-actions">
      <div className="reaction-wrap">
        <button className={`post-action ${liked || myReaction ? 'liked' : ''}`} onClick={handleLike} disabled={busy}
          onMouseEnter={() => setShowReactionPicker(true)} onMouseLeave={() => setTimeout(() => setShowReactionPicker(false), 350)}
          onTouchStart={startLongPress} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress} onContextMenu={(e) => e.preventDefault()}>
          <Heart size={18} fill={liked || myReaction ? 'currentColor' : 'none'} /> {likeCount + totalReactions}
        </button>
        {showReactionPicker && (
          <div className="reaction-picker" onMouseEnter={() => setShowReactionPicker(true)} onMouseLeave={() => setShowReactionPicker(false)}>
            {REACTIONS.map(r => (
              <button key={r.type} type="button" title={r.label}
                className={`reaction-option ${myReaction === r.type ? 'active' : ''}`}
                onClick={() => handleReact(r.type)}>
                <span>{r.emoji}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="post-action" onClick={() => setShowComments(!showComments)}>
        <MessageCircle size={18} /> {post.comment_count}
      </button>
      <button className="post-action" onClick={() => setShowShare(true)}>
        <Repeat2 size={18} /> Repost
      </button>
      <button className="post-action" onClick={() => setShowShare(true)}>
        <Share2 size={18} /> {shareCount > 0 ? shareCount : 'Share'}
      </button>
    </footer>
    {showComments && <CommentSection post={post} currentUser={currentUser} onChanged={onChange} />}
    {showShare && <ShareModal post={post} currentUser={currentUser} onClose={() => setShowShare(false)} onShared={handleShared} />}
  </article>
}

export function CreatePost({ onCreated }) {
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleFiles = (event) => {
    const selected = Array.from(event.target.files || [])
    const combined = [...files, ...selected].slice(0, 4)
    setFiles(combined)
    setPreviews(combined.map(file => ({ url: URL.createObjectURL(file), kind: file.type.startsWith('video') ? 'video' : 'image', name: file.name })))
    event.target.value = ''
  }

  const removeFile = (index) => {
    const next = files.filter((_, i) => i !== index)
    setFiles(next)
    setPreviews(next.map(file => ({ url: URL.createObjectURL(file), kind: file.type.startsWith('video') ? 'video' : 'image', name: file.name })))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!body.trim()) { setError('Write something before posting.'); return }
    setBusy(true); setError('')
    try {
      const media = []
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        const { data } = await api.post('/media/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
        media.push(data)
      }
      await api.post('/posts', { body: body.trim(), media })
      setBody(''); setFiles([]); setPreviews([])
      await onCreated()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <section className="create-post glass-panel">
    <div className="create-post-header">
      <div className="post-avatar">{user?.name?.slice(0, 1).toUpperCase() || <UserIcon size={18} />}</div>
      <div><strong>{user?.name}</strong><span>Share something with the community</span></div>
    </div>
    <form onSubmit={handleSubmit}>
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="What's on your mind?" rows={3} maxLength={2000} />
      {previews.length > 0 && (
        <div className={`post-media post-media-${Math.min(previews.length, 4)}`}>
          {previews.map((preview, index) => (
            <div key={index} className="post-media-item">
              {preview.kind === 'image'
                ? <img src={preview.url} alt={preview.name} />
                : <video src={preview.url} controls />}
              <button type="button" className="media-remove" onClick={() => removeFile(index)} aria-label="Remove"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="create-post-actions">
        <label className="btn btn-secondary btn-compact">
          <ImagePlus size={16} /> Photos / Videos
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" multiple onChange={handleFiles} hidden />
        </label>
        <span className="muted">{body.length}/2000</span>
        <button type="submit" className="btn" disabled={busy || !body.trim()}>{busy ? 'Posting…' : 'Post'}</button>
      </div>
    </form>
  </section>
}

export default function Feed() {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const { data } = await api.get('/posts')
      setPosts(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (postId) => {
    if (!confirm('Delete this post?')) return
    try {
      await api.delete(`/posts/${postId}`)
      await load()
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  return <div className="page-container">
    <div className="page-header"><span className="eyebrow">COMMUNITY</span><h2>Feed</h2><p>Share updates, photos, and videos with everyone.</p></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <CreatePost onCreated={load} />
    {loading ? <div className="empty-state glass-panel"><strong>Loading feed…</strong></div>
      : posts.length === 0 ? <div className="empty-state glass-panel"><strong>No posts yet</strong><span>Be the first to share something.</span></div>
      : <div className="feed-list">{posts.map(post => <PostCard key={post.id} post={post} currentUser={user} onChange={load} onDelete={handleDelete} />)}</div>}
  </div>
}
