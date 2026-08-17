import { useEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  useSocial, getMessages, sendMessage, pushReply, presenceOf, presenceLabel, hashOf,
} from '../services/socialStore'

const CANNED_REPLIES = [
  'Hey! 👋',
  "That's awesome 😄",
  'Haha totally!',
  'Tell me more!',
  '🔥🔥🔥',
  'Sounds good to me 👍',
  'I was just thinking about that!',
  "Let's catch up soon ☕",
]

const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function MessengerModal({ user, onClose }) {
  const { user: me } = useAuth()
  useSocial()
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const bodyRef = useRef(null)
  const timersRef = useRef([])

  const messages = getMessages(me?.user_id, user.user_id)
  const presence = presenceOf(user)

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [messages.length, typing])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const submit = (event) => {
    event.preventDefault()
    const body = text.trim()
    if (!body) return
    sendMessage(me.user_id, user.user_id, body)
    setText('')
    // Simulated reply so the conversation feels alive (demo only).
    timersRef.current.push(setTimeout(() => setTyping(true), 700))
    timersRef.current.push(setTimeout(() => {
      setTyping(false)
      pushReply(me.user_id, user.user_id, CANNED_REPLIES[hashOf(body) % CANNED_REPLIES.length])
    }, 2100))
  }

  return <div className="chat-window glass-panel" role="dialog" aria-label={`Chat with ${user.name}`}>
    <header className="chat-header">
      <div className="chat-peer">
        <div className="user-avatar">{user.name.slice(0, 1).toUpperCase()}<span className={`presence-dot ${presence}`} /></div>
        <div><strong>{user.name}</strong><span>{typing ? 'Typing…' : presenceLabel[presence]}</span></div>
      </div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="Close chat"><X size={17} /></button>
    </header>
    <div className="chat-body" ref={bodyRef}>
      {messages.length === 0 && <div className="chat-empty">Say hi to {user.name.split(' ')[0]} 👋</div>}
      {messages.map((message) => (
        <div key={message.id} className={`chat-bubble ${message.from === me?.user_id ? 'mine' : ''}`}>
          {message.body}
          <time>{formatTime(message.at)}</time>
        </div>
      ))}
      {typing && <div className="chat-bubble typing" aria-label="Typing"><span /><span /><span /></div>}
    </div>
    <form className="chat-input" onSubmit={submit}>
      <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Aa" aria-label="Message" maxLength={1000} autoFocus />
      <button type="submit" className="chat-send" disabled={!text.trim()} aria-label="Send"><Send size={16} /></button>
    </form>
  </div>
}
