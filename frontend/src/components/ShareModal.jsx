import { useState } from 'react'
import { X, Link2, Repeat2, Send, Check } from 'lucide-react'
import { api, errorMessage } from '../services/api'

export default function ShareModal({ post, currentUser, onClose, onShared }) {
  const [mode, setMode] = useState(null) // null | 'repost'
  const [repostText, setRepostText] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const postLink = `${window.location.origin}/post/${post.id}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(postLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
      // Count the share action on the backend too.
      try { await api.post(`/posts/${post.id}/share`) } catch { /* non-fatal */ }
      onShared?.()
    } catch {
      alert('Could not copy the link. Your browser may block clipboard access.')
    }
  }

  const handleRepost = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.post('/posts', { body: repostText.trim() || `Reposted from ${post.author_name}`, repost_of: post.id })
      try { await api.post(`/posts/${post.id}/share`) } catch { /* non-fatal */ }
      onShared?.()
      onClose()
    } catch (err) {
      alert(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Share post">
    <div className="modal-card glass-panel" onClick={e => e.stopPropagation()}>
      <header className="modal-header">
        <h3>Share this post</h3>
        <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </header>
      <div className="share-options">
        <button type="button" className="share-option" onClick={handleCopyLink}>
          {copied ? <Check size={20} className="share-ok" /> : <Link2 size={20} />}
          <span>
            <strong>{copied ? 'Link copied!' : 'Copy link'}</strong>
            <small>Share the post URL anywhere</small>
          </span>
        </button>
        <button type="button" className="share-option" onClick={() => setMode(mode === 'repost' ? null : 'repost')}>
          <Repeat2 size={20} />
          <span>
            <strong>Repost to your feed</strong>
            <small>Share with your own thoughts</small>
          </span>
        </button>
      </div>
      {mode === 'repost' && (
        <form onSubmit={handleRepost} className="share-repost-form">
          <textarea value={repostText} onChange={e => setRepostText(e.target.value)}
            placeholder="Say something about this post (optional)…" rows={2} maxLength={2000} autoFocus />
          <div className="share-repost-actions">
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => setMode(null)}>Cancel</button>
            <button type="submit" className="btn btn-compact" disabled={busy}>
              {busy ? 'Reposting…' : <><Send size={14} /> Repost</>}
            </button>
          </div>
        </form>
      )}
    </div>
  </div>
}
