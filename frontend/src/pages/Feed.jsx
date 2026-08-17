import { useEffect, useState } from 'react'
import { ImagePlus, MessageCircle, Send, Trash2, X, Heart, Repeat2, User as UserIcon } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const formatTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const mediaUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  if (path.startsWith('/media/')) return `${API_BASE.replace(/\/api$/, '')}${path}`
  return path
}

function RepostCard({ repost }) {
  return <div className="repost-card">
    <header className="repost-header">
      <div className="post-avatar small">{repost.author_name?.slice(0, 1).toUpperCase()}</div>
      <div className="post-author">
        <strong>{repost.author_name}</strong>
        <span className={`role-pill role-${(repost.author_role || 'user').toLowerCase().replace(/\s+/g, '-')}`}>{repost.author_role}</span>
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

function PostCard({ post, currentUser, onChange, onDelete }) {
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [showRepost, setShowRepost] = useState(false)
  const [repostText, setRepostText] = useState('')
  const [busy, setBusy] = useState(false)
  const [liked, setLiked] = useState(post.like_count > 0 && post.likes?.includes?.(currentUser?.user_id))
  const [likeCount, setLikeCount] = useState(post.like_count)

  const handleLike = async () => {
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

  const handleComment = async (event) => {
    event.preventDefault()
    if (!commentText.trim()) return
    setBusy(true)
    try {
      await api.post(`/posts/${post.id}/comments`, { body: commentText.trim() })
      setCommentText('')
      await onChange()
      setShowComments(true)
    } catch (err) {
      alert(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleRepost = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.post('/posts', { body: repostText.trim() || 'Repost', repost_of: post.id })
      setShowRepost(false)
      setRepostText('')
      await onChange()
    } catch (err) {
      alert(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!confirm('Delete this comment?')) return
    try {
      await api.delete(`/posts/${post.id}/comments/${commentId}`)
      await onChange()
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  const canDelete = currentUser?.user_id === post.author_id || currentUser?.role === 'Administrator'

  return <article className="post-card glass-panel">
    <header className="post-header">
      <div className="post-avatar">{post.author_name?.slice(0, 1).toUpperCase() || '?'}</div>
      <div className="post-author">
        <strong>{post.author_name}</strong>
        <span className={`role-pill role-${(post.author_role || 'user').toLowerCase().replace(/\s+/g, '-')}`}>{post.author_role}</span>
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
      <button className={`post-action ${liked ? 'liked' : ''}`} onClick={handleLike} disabled={busy}>
        <Heart size={18} fill={liked ? 'currentColor' : 'none'} /> {likeCount}
      </button>
      <button className="post-action" onClick={() => setShowComments(!showComments)}>
        <MessageCircle size={18} /> {post.comment_count}
      </button>
      <button className="post-action" onClick={() => setShowRepost(!showRepost)}>
        <Repeat2 size={18} /> Repost
      </button>
    </footer>
    {showRepost && (
      <form onSubmit={handleRepost} className="repost-form">
        <textarea value={repostText} onChange={e => setRepostText(e.target.value)} placeholder="Say something about this post (optional)…" rows={2} maxLength={2000} />
        <div className="repost-form-actions">
          <button type="button" className="btn btn-secondary btn-compact" onClick={() => setShowRepost(false)}>Cancel</button>
          <button type="submit" className="btn btn-compact" disabled={busy}>{busy ? 'Reposting…' : 'Repost'}</button>
        </div>
      </form>
    )}
    {showComments && (
      <div className="post-comments">
        {post.comments?.length > 0 ? post.comments.map(comment => (
          <div key={comment.id} className="comment">
            <div className="comment-avatar">{comment.author_name?.slice(0, 1).toUpperCase()}</div>
            <div className="comment-body">
              <div className="comment-meta">
                <strong>{comment.author_name}</strong>
                <span className={`role-pill role-${(comment.author_role || 'user').toLowerCase().replace(/\s+/g, '-')}`}>{comment.author_role}</span>
                <time>{formatTime(comment.created_at)}</time>
              </div>
              <p>{comment.body}</p>
            </div>
            {(currentUser?.user_id === comment.author_id || currentUser?.role === 'Administrator') && (
              <button className="icon-button" onClick={() => handleDeleteComment(comment.id)} title="Delete comment" aria-label="Delete comment"><X size={14} /></button>
            )}
          </div>
        )) : <p className="muted">No comments yet. Be the first to reply.</p>}
        <form onSubmit={handleComment} className="comment-form">
          <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Write a comment…" maxLength={1000} />
          <button type="submit" className="btn btn-compact" disabled={busy || !commentText.trim()}><Send size={14} /></button>
        </form>
      </div>
    )}
  </article>
}

function CreatePost({ onCreated }) {
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
