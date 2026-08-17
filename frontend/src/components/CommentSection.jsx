import { useMemo, useState } from 'react'
import { Send, Heart, CornerDownRight, Pencil, Trash2, X, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { api, errorMessage } from '../services/api'

const formatTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return date.toLocaleString()
}

function CommentItem({ comment, replies, depth, postId, currentUser, onChanged }) {
  const [replyText, setReplyText] = useState('')
  const [showReply, setShowReply] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.body)
  const [busy, setBusy] = useState(false)
  const [liked, setLiked] = useState((comment.likes || []).includes(currentUser?.user_id))
  const [likeCount, setLikeCount] = useState(comment.like_count || 0)
  const [collapsed, setCollapsed] = useState(false)

  const isOwner = currentUser?.user_id === comment.author_id
  const canModerate = isOwner || currentUser?.role === 'Administrator'

  const handleLike = async () => {
    try {
      const { data } = await api.post(`/posts/${postId}/comments/${comment.id}/like`)
      setLiked(data.liked)
      setLikeCount(data.like_count)
    } catch (err) { alert(errorMessage(err)) }
  }

  const handleReply = async (event) => {
    event.preventDefault()
    if (!replyText.trim()) return
    setBusy(true)
    try {
      await api.post(`/posts/${postId}/comments`, { body: replyText.trim(), parent_id: comment.id })
      setReplyText('')
      setShowReply(false)
      await onChanged()
    } catch (err) { alert(errorMessage(err)) }
    finally { setBusy(false) }
  }

  const handleEdit = async (event) => {
    event.preventDefault()
    if (!editText.trim()) return
    setBusy(true)
    try {
      await api.put(`/posts/${postId}/comments/${comment.id}`, { body: editText.trim() })
      setEditing(false)
      await onChanged()
    } catch (err) { alert(errorMessage(err)) }
    finally { setBusy(false) }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this comment?')) return
    try {
      await api.delete(`/posts/${postId}/comments/${comment.id}`)
      await onChanged()
    } catch (err) { alert(errorMessage(err)) }
  }

  return <div className={`comment-thread ${depth > 0 ? 'comment-nested' : ''}`}>
    <div className="comment">
      <div className="comment-avatar">{comment.author_name?.slice(0, 1).toUpperCase()}</div>
      <div className="comment-content">
        <div className="comment-bubble">
          <div className="comment-meta">
            <strong>{comment.author_name}</strong>
            <span className={`role-pill role-${(comment.author_role || 'user').toLowerCase().replace(/\s+/g, '-')}`}>{comment.author_role}</span>
            <time>{formatTime(comment.created_at)}</time>
            {comment.edited && <span className="comment-edited">edited</span>}
          </div>
          {editing ? (
            <form onSubmit={handleEdit} className="comment-edit-form">
              <input value={editText} onChange={e => setEditText(e.target.value)} maxLength={1000} autoFocus />
              <div className="comment-edit-actions">
                <button type="button" className="icon-button" onClick={() => { setEditing(false); setEditText(comment.body) }} aria-label="Cancel"><X size={14} /></button>
                <button type="submit" className="icon-button" disabled={busy || !editText.trim()} aria-label="Save"><Check size={14} /></button>
              </div>
            </form>
          ) : <p>{comment.body}</p>}
        </div>
        <div className="comment-toolbar">
          <button type="button" className={`comment-tool ${liked ? 'liked' : ''}`} onClick={handleLike}>
            <Heart size={13} fill={liked ? 'currentColor' : 'none'} /> {likeCount > 0 ? likeCount : 'Like'}
          </button>
          <button type="button" className="comment-tool" onClick={() => setShowReply(!showReply)}>
            <CornerDownRight size={13} /> Reply
          </button>
          {canModerate && <>
            {isOwner && <button type="button" className="comment-tool" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</button>}
            <button type="button" className="comment-tool danger" onClick={handleDelete}><Trash2 size={13} /> Delete</button>
          </>}
        </div>
        {showReply && (
          <form onSubmit={handleReply} className="comment-form comment-reply-form">
            <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={`Reply to ${comment.author_name}…`} maxLength={1000} autoFocus />
            <button type="submit" className="btn btn-compact" disabled={busy || !replyText.trim()}><Send size={14} /></button>
          </form>
        )}
      </div>
    </div>
    {replies.length > 0 && (
      <div className="comment-replies">
        <button type="button" className="replies-toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </button>
        {!collapsed && replies.map(reply => (
          <CommentItem key={reply.id} comment={reply} replies={[]} depth={depth + 1}
            postId={postId} currentUser={currentUser} onChanged={onChanged} />
        ))}
      </div>
    )}
  </div>
}

export default function CommentSection({ post, currentUser, onChanged }) {
  const [commentText, setCommentText] = useState('')
  const [busy, setBusy] = useState(false)

  // Build a thread tree: top-level comments plus their direct replies.
  const { topLevel, repliesByParent } = useMemo(() => {
    const comments = post.comments || []
    const byParent = {}
    const top = []
    for (const c of comments) {
      if (c.parent_id) (byParent[c.parent_id] ||= []).push(c)
      else top.push(c)
    }
    const sortAsc = (a, b) => new Date(a.created_at) - new Date(b.created_at)
    top.sort(sortAsc)
    Object.values(byParent).forEach(list => list.sort(sortAsc))
    return { topLevel: top, repliesByParent: byParent }
  }, [post.comments])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!commentText.trim()) return
    setBusy(true)
    try {
      await api.post(`/posts/${post.id}/comments`, { body: commentText.trim() })
      setCommentText('')
      await onChanged()
    } catch (err) { alert(errorMessage(err)) }
    finally { setBusy(false) }
  }

  return <div className="post-comments">
    {topLevel.length > 0 ? topLevel.map(comment => (
      <CommentItem key={comment.id} comment={comment} replies={repliesByParent[comment.id] || []}
        depth={0} postId={post.id} currentUser={currentUser} onChanged={onChanged} />
    )) : <p className="muted">No comments yet. Be the first to share your thoughts.</p>}
    <form onSubmit={handleSubmit} className="comment-form">
      <div className="comment-avatar">{currentUser?.name?.slice(0, 1).toUpperCase() || '?'}</div>
      <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Write a comment…" maxLength={1000} />
      <button type="submit" className="btn btn-compact" disabled={busy || !commentText.trim()} aria-label="Post comment"><Send size={14} /></button>
    </form>
  </div>
}
