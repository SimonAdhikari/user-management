import { useEffect, useRef, useState, useCallback } from 'react'
import { Heart, MessageCircle, Share2, Music2, ChevronUp, ChevronDown, Play, Volume2, VolumeX, X, Upload, Send } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import ShareModal from '../components/ShareModal'

const mediaUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  if (path.startsWith('data:')) return path
  // Keep /media/... relative so it flows through the dev/reverse proxy to the
  // storage server (port 8001). Prefixing the API origin would 404/ORB.
  return path
}

const formatTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return date.toLocaleString()
}

// ---------------------------------------------------------------------------
// Upload modal — lets any signed-in user publish a reel/clip (video or image)
// ---------------------------------------------------------------------------
function UploadClipModal({ onClose, onUploaded }) {
  const { user } = useAuth()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleFile = (event) => {
    const selected = event.target.files?.[0]
    if (!selected) return
    if (!selected.type.startsWith('video/') && !selected.type.startsWith('image/')) {
      setError('Please choose a video or image file.')
      return
    }
    setError('')
    setFile(selected)
    setPreview({ url: URL.createObjectURL(selected), kind: selected.type.startsWith('video/') ? 'video' : 'image' })
    event.target.value = ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!file) { setError('Choose a video or image to upload.'); return }
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/media/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      await api.post('/posts', { body: caption.trim() || `${user?.name || 'Someone'} shared a clip`, media: [data] })
      await onUploaded()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Upload clip">
    <div className="modal-card glass-panel" onClick={e => e.stopPropagation()}>
      <header className="modal-header">
        <h3>Upload a clip</h3>
        <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </header>
      <form onSubmit={handleSubmit} className="clip-upload-form">
        {preview ? (
          <div className="clip-upload-preview">
            {preview.kind === 'video'
              ? <video src={preview.url} controls muted playsInline />
              : <img src={preview.url} alt="Clip preview" />}
            <button type="button" className="media-remove" onClick={() => { setFile(null); setPreview(null) }} aria-label="Remove file"><X size={14} /></button>
          </div>
        ) : (
          <label className="clip-upload-drop">
            <Upload size={28} />
            <strong>Choose a video or image</strong>
            <span>MP4, WebM, MOV, JPG, PNG, GIF, WebP</span>
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" onChange={handleFile} hidden />
          </label>
        )}
        <textarea value={caption} onChange={e => setCaption(e.target.value)}
          placeholder="Write a caption…" rows={2} maxLength={2000} />
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="clip-upload-actions">
          <button type="button" className="btn btn-secondary btn-compact" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-compact" disabled={busy || !file}>
            {busy ? 'Uploading…' : <><Send size={14} /> Publish clip</>}
          </button>
        </div>
      </form>
    </div>
  </div>
}

// ---------------------------------------------------------------------------
// Comments panel — list + add-comment form
// ---------------------------------------------------------------------------
function ClipComments({ clip, currentUser, onClose, onCommented }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [comments, setComments] = useState(clip.comments || [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      const { data } = await api.post(`/posts/${clip.id}/comments`, { body: text.trim() })
      setComments((prev) => [...prev, {
        id: data.comment?.id,
        author_name: data.comment?.author_name || currentUser?.name,
        body: data.comment?.body || text.trim(),
        created_at: data.comment?.created_at || new Date().toISOString(),
      }])
      setText('')
      onCommented?.()
    } catch (err) { alert(errorMessage(err)) }
    finally { setBusy(false) }
  }

  return (
    <div className="clip-comments glass-panel">
      <div className="clip-comments-header">
        <strong>{comments.length} comments</strong>
        <button className="icon-button" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="clip-comments-list">
        {comments.length > 0 ? comments.map(c => (
          <div key={c.id} className="comment">
            <div className="comment-avatar">{c.author_name?.slice(0, 1).toUpperCase()}</div>
            <div className="comment-body">
              <div className="comment-meta"><strong>{c.author_name}</strong><time>{formatTime(c.created_at)}</time></div>
              <p>{c.body}</p>
            </div>
          </div>
        )) : <p className="muted">No comments yet. Be the first!</p>}
      </div>
      <form className="clip-comment-form" onSubmit={handleSubmit}>
        <div className="comment-avatar">{currentUser?.name?.slice(0, 1).toUpperCase() || '?'}</div>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment…" maxLength={1000} />
        <button type="submit" className="icon-button" disabled={busy || !text.trim()} aria-label="Post comment"><Send size={16} /></button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single clip card — full-bleed video + TikTok action rail
// ---------------------------------------------------------------------------
function ClipCard({ clip, isActive, currentUser, onChanged }) {
  const videoRef = useRef(null)
  const [liked, setLiked] = useState(clip.likes?.includes?.(currentUser?.user_id) || false)
  const [likeCount, setLikeCount] = useState(clip.like_count || 0)
  const [commentCount, setCommentCount] = useState(clip.comment_count || 0)
  const [shareCount, setShareCount] = useState(clip.share_count || 0)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const video = clip.media?.find(m => m.kind === 'video')
  const image = clip.media?.find(m => m.kind === 'image')
  const handle = `@${(clip.author_name || 'user').toLowerCase().replace(/\s+/g, '')}`

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (isActive) {
      el.currentTime = 0
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      el.pause()
      setPlaying(false)
    }
  }, [isActive])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) { el.play(); setPlaying(true) } else { el.pause(); setPlaying(false) }
  }

  const handleLike = async () => {
    try {
      const { data } = await api.post(`/posts/${clip.id}/like`)
      setLiked(data.liked)
      setLikeCount(data.like_count)
    } catch (err) { alert(errorMessage(err)) }
  }

  const handleCommented = () => {
    setCommentCount((count) => count + 1)
    onChanged?.()
  }

  const handleShared = async () => {
    setShareCount((count) => count + 1)
    await onChanged?.()
  }

  return (
    <section className={`clip-card ${isActive ? 'active' : ''}`}>
      <div className="clip-media" onClick={togglePlay}>
        {video
          ? <video ref={videoRef} src={mediaUrl(video.url)} loop muted={muted} playsInline preload="metadata" />
          : image
            ? <img src={mediaUrl(image.url)} alt={clip.body} />
            : <div className="clip-text-only"><p>{clip.body}</p></div>}
        {video && !playing && <div className="clip-play-overlay"><Play size={64} /></div>}
        <div className="clip-gradient" />
      </div>

      {/* Right action rail — TikTok style */}
      <div className="clip-rail">
        <div className="clip-avatar-wrap">
          <div className="clip-avatar">{clip.author_name?.slice(0, 1).toUpperCase()}</div>
        </div>
        <button className="clip-action" onClick={handleLike} aria-label="Like clip">
          <span className={`clip-action-icon ${liked ? 'liked' : ''}`}><Heart size={28} fill={liked ? 'currentColor' : 'none'} /></span>
          <span>{likeCount}</span>
        </button>
        <button className="clip-action" onClick={() => setShowComments(!showComments)} aria-label="Comment on clip">
          <span className="clip-action-icon"><MessageCircle size={28} /></span>
          <span>{commentCount}</span>
        </button>
        <button className="clip-action" onClick={() => setShowShare(true)} aria-label="Share clip">
          <span className="clip-action-icon"><Share2 size={28} /></span>
          <span>{shareCount > 0 ? shareCount : 'Share'}</span>
        </button>
        {video && (
          <button className="clip-action" onClick={() => setMuted(!muted)} aria-label="Toggle sound">
            <span className="clip-action-icon">{muted ? <VolumeX size={24} /> : <Volume2 size={24} />}</span>
          </button>
        )}
      </div>

      {/* Bottom info — TikTok style */}
      <div className="clip-info">
        <strong>{handle}</strong>
        <p>{clip.body}</p>
        <div className="clip-sound"><Music2 size={14} /> <span>original sound — {clip.author_name}</span></div>
      </div>

      {showComments && (
        <ClipComments clip={clip} currentUser={currentUser} onClose={() => setShowComments(false)} onCommented={handleCommented} />
      )}
      {showShare && (
        <ShareModal post={clip} currentUser={currentUser} onClose={() => setShowShare(false)} onShared={handleShared} />
      )}
    </section>
  )
}

export default function Clips() {
  const { user } = useAuth()
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [showUpload, setShowUpload] = useState(false)
  const [tab, setTab] = useState('foryou') // 'following' | 'foryou'
  const containerRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data } = await api.get('/posts')
      // TikTok feed = posts that have media (video preferred)
      const withMedia = data.filter(p => p.media?.length > 0)
      setClips(withMedia)
    } catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const index = Math.round(el.scrollTop / el.clientHeight)
    if (index !== activeIndex && index >= 0 && index < clips.length) setActiveIndex(index)
  }

  const goTo = (index) => {
    const el = containerRef.current
    if (!el || index < 0 || index >= clips.length) return
    el.scrollTo({ top: index * el.clientHeight, behavior: 'smooth' })
    setActiveIndex(index)
  }

  return (
    <div className="tiktok-page">
      {/* Top tabs — TikTok style */}
      <div className="tiktok-topbar">
        <button className={`tiktok-tab ${tab === 'following' ? 'active' : ''}`} onClick={() => setTab('following')}>Following</button>
        <span className="tiktok-tab-divider" />
        <button className={`tiktok-tab ${tab === 'foryou' ? 'active' : ''}`} onClick={() => setTab('foryou')}>For You</button>
      </div>

      {error && <div className="alert alert-error tiktok-error">{error}</div>}

      {loading ? (
        <div className="tiktok-empty"><strong className="loading-shimmer">Loading clips…</strong></div>
      ) : clips.length === 0 ? (
        <div className="tiktok-empty">
          <Play size={44} />
          <strong>No clips yet</strong>
          <span>Upload a video or image to start the feed.</span>
        </div>
      ) : (
        <div className="tiktok-stage">
          <div className="tiktok-scroller" ref={containerRef} onScroll={handleScroll}>
            {clips.map((clip, i) => (
              <ClipCard key={clip.id} clip={clip} isActive={i === activeIndex} currentUser={user} onChanged={load} />
            ))}
          </div>
          <div className="tiktok-nav">
            <button onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="Previous clip"><ChevronUp size={22} /></button>
            <button onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === clips.length - 1} aria-label="Next clip"><ChevronDown size={22} /></button>
          </div>
        </div>
      )}

      {/* Floating upload button — TikTok "+" style */}
      <button className="tiktok-upload" onClick={() => setShowUpload(true)} aria-label="Upload clip">
        <Upload size={22} />
      </button>

      {showUpload && <UploadClipModal onClose={() => setShowUpload(false)} onUploaded={load} />}
    </div>
  )
}
