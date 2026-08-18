import { useEffect, useMemo, useState } from 'react'
import { Check, Clock, MessageCircle, Phone, Search, UserCheck, UserPlus, UserRound, Users, Video } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { initiateCall } from '../services/callService'
import {
  useSocial, isFollowing, toggleFollow, friendStatus, sendFriendRequest,
  cancelFriendRequest, respondFriendRequest, removeFriend, followerCount,
  mutualFriendCount, presenceOf,
} from '../services/socialStore'
import ProfileCardModal from '../components/ProfileCardModal'
import MessengerModal from '../components/MessengerModal'

function FriendButton({ person, me }) {
  const status = friendStatus(me.user_id, person.user_id)
  const config = {
    none: { icon: <UserPlus size={14} />, label: 'Add friend', className: 'btn-friend' },
    outgoing: { icon: <Clock size={14} />, label: 'Requested', className: 'btn-friend btn-friend-pending' },
    incoming: { icon: <UserCheck size={14} />, label: 'Accept', className: 'btn-friend btn-friend-accept' },
    friends: { icon: <Check size={14} />, label: 'Friends', className: 'btn-friend btn-friend-done' },
  }[status]
  const handleClick = () => {
    if (status === 'none') sendFriendRequest(me.user_id, person.user_id)
    else if (status === 'outgoing') cancelFriendRequest(me.user_id, person.user_id)
    else if (status === 'incoming') respondFriendRequest(me.user_id, person.user_id, true)
    else if (status === 'friends' && confirm(`Remove ${person.name} from your friends?`)) removeFriend(me.user_id, person.user_id)
  }
  return <button type="button" className={config.className} onClick={handleClick}>{config.icon} {config.label}</button>
}

/**
 * Facebook-style People page: browse everyone on the platform, manage friend
 * requests, and see your friends. No administrative controls.
 */
export default function People() {
  const { user: me } = useAuth()
  useSocial()
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [profileUser, setProfileUser] = useState(null)
  const [chatUser, setChatUser] = useState(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const { data } = await api.get('/people')
      setPeople(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const myId = me?.user_id
  const others = useMemo(() => people.filter(p => p.user_id !== myId), [people, myId])

  const friends = others.filter(p => friendStatus(myId, p.user_id) === 'friends')
  const incoming = others.filter(p => friendStatus(myId, p.user_id) === 'incoming')

  const visible = useMemo(() => {
    let base = others
    if (tab === 'friends') base = friends
    else if (tab === 'requests') base = incoming
    const q = query.trim().toLowerCase()
    if (q) base = base.filter(p => p.name.toLowerCase().includes(q))
    return base
  }, [others, friends, incoming, tab, query])

  const tabs = [
    { id: 'all', label: 'Everyone', count: others.length },
    { id: 'friends', label: 'Friends', count: friends.length },
    { id: 'requests', label: 'Requests', count: incoming.length },
  ]

  return <div className="page-container people-page">
    <div className="page-header">
      <span className="eyebrow">COMMUNITY</span>
      <h2>People</h2>
      <p>Find friends, follow creators, and connect with the community.</p>
    </div>

    {error && <div className="alert alert-error" role="alert">{error}</div>}

    <div className="people-toolbar glass-panel">
      <div className="people-tabs">
        {tabs.map(t => (
          <button key={t.id} type="button" className={`people-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}{t.count > 0 && <span className="people-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="people-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people" /></div>
    </div>

    {loading ? <div className="empty-state glass-panel"><strong>Finding people…</strong></div>
      : visible.length === 0 ? (
        <div className="empty-state glass-panel">
          <UserRound size={32} />
          <strong>{tab === 'friends' ? 'No friends yet' : tab === 'requests' ? 'No pending requests' : 'No people found'}</strong>
          <span>{tab === 'friends' ? 'Add people from Everyone to start building your circle.' : tab === 'requests' ? 'Friend requests you receive will show up here.' : 'Try a different search.'}</span>
        </div>
      ) : (
        <div className="people-grid">
          {visible.map(person => {
            const following = isFollowing(myId, person.user_id)
            return <article key={person.user_id} className="person-card glass-panel">
              <button type="button" className="person-avatar" onClick={() => setProfileUser(person)} aria-label={`View ${person.name}`}>
                {person.name.slice(0, 1).toUpperCase()}
                <span className={`presence-dot ${presenceOf(person)}`} />
              </button>
              <div className="person-identity">
                <strong onClick={() => setProfileUser(person)}>{person.name}</strong>
                <span><Users size={13} /> {followerCount(person.user_id)} followers · {mutualFriendCount(myId, person.user_id)} mutual</span>
              </div>
              <div className="person-actions">
                <button type="button" className={`btn-follow ${following ? 'following' : ''}`} onClick={() => toggleFollow(myId, person.user_id)}>
                  {following ? <><Check size={13} /> Following</> : 'Follow'}
                </button>
                <FriendButton person={person} me={me} />
                <button type="button" className="btn-message" title="Message" onClick={() => setChatUser(person)}><MessageCircle size={14} /></button>
                <button type="button" className="btn-call" title="Audio call" onClick={() => initiateCall(person.user_id, 'audio').catch(err => alert(err.message))}><Phone size={14} /></button>
                <button type="button" className="btn-call-video" title="Video call" onClick={() => initiateCall(person.user_id, 'video').catch(err => alert(err.message))}><Video size={14} /></button>
              </div>
            </article>
          })}
        </div>
      )}

    {profileUser && <ProfileCardModal user={profileUser} onClose={() => setProfileUser(null)} onMessage={setChatUser} />}
    {chatUser && <MessengerModal user={chatUser} onClose={() => setChatUser(null)} />}
  </div>
}
