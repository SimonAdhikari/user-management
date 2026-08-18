import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clapperboard, MessageCircle, UserPlus, UserRound, Users, Video } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  useSocial, friendStatus, friendsOf, isFollowing, toggleFollow,
  sendFriendRequest, respondFriendRequest, mutualFriendCount, presenceOf,
} from '../services/socialStore'
import { CreatePost, PostCard } from './Feed'
import ProfileCardModal from '../components/ProfileCardModal'
import MessengerModal from '../components/MessengerModal'

/**
 * Facebook-style home: shortcuts on the left, the news feed in the centre,
 * and contacts / people-you-may-know on the right.
 */
export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  useSocial()
  const [posts, setPosts] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profileUser, setProfileUser] = useState(null)
  const [chatUser, setChatUser] = useState(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [postsRes, peopleRes] = await Promise.all([
        api.get('/posts'),
        api.get('/people').catch(() => ({ data: [] })),
      ])
      setPosts(postsRes.data)
      setPeople(peopleRes.data)
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

  const myId = user?.user_id
  const friends = people.filter(p => friendsOf(myId).includes(p.user_id))
  const suggestions = people
    .filter(p => p.user_id !== myId && friendStatus(myId, p.user_id) === 'none')
    .sort((a, b) => mutualFriendCount(myId, b.user_id) - mutualFriendCount(myId, a.user_id))
    .slice(0, 4)

  return <div className="home-layout">
    {/* ---- Left: shortcuts ---- */}
    <aside className="home-left">
      <Link to={`/profile/${myId}`} className="home-shortcut">
        <span className="avatar">{user?.name?.slice(0, 1).toUpperCase()}</span>
        <strong>{user?.name}</strong>
      </Link>
      <Link to="/people" className="home-shortcut"><span className="home-shortcut-icon"><Users size={20} /></span> Friends</Link>
      <Link to="/feed" className="home-shortcut"><span className="home-shortcut-icon"><MessageCircle size={20} /></span> Feed</Link>
      <Link to="/clips" className="home-shortcut"><span className="home-shortcut-icon"><Clapperboard size={20} /></span> Clips</Link>
    </aside>

    {/* ---- Centre: news feed ---- */}
    <section className="home-center">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <CreatePost onCreated={load} />
      {loading ? <div className="empty-state glass-panel"><strong>Loading your feed…</strong></div>
        : posts.length === 0 ? <div className="empty-state glass-panel"><strong>No posts yet</strong><span>Be the first to share something with your friends.</span></div>
        : <div className="feed-list">{posts.map(post => <PostCard key={post.id} post={post} currentUser={user} onChange={load} onDelete={handleDelete} />)}</div>}
    </section>

    {/* ---- Right: contacts & suggestions ---- */}
    <aside className="home-right">
      {suggestions.length > 0 && <div className="home-panel">
        <h4><UserPlus size={15} /> People you may know</h4>
        {suggestions.map(person => (
          <div key={person.user_id} className="home-suggestion">
            <button type="button" className="home-contact" onClick={() => setProfileUser(person)}>
              <span className="avatar">{person.name.slice(0, 1).toUpperCase()}<span className={`presence-dot ${presenceOf(person)}`} /></span>
              <strong>{person.name}</strong>
            </button>
            <button type="button" className="btn btn-compact" onClick={() => sendFriendRequest(myId, person.user_id)}>Add</button>
          </div>
        ))}
      </div>}

      <div className="home-panel">
        <h4><Users size={15} /> Contacts</h4>
        {friends.length === 0 ? <p className="home-empty">No friends yet. Add people to see them here.</p>
          : friends.map(friend => (
            <div key={friend.user_id} className="home-suggestion">
              <button type="button" className="home-contact" onClick={() => setProfileUser(friend)}>
                <span className="avatar">{friend.name.slice(0, 1).toUpperCase()}<span className={`presence-dot ${presenceOf(friend)}`} /></span>
                <strong>{friend.name}</strong>
              </button>
              <button type="button" className="icon-button" title="Message" onClick={() => setChatUser(friend)}><MessageCircle size={16} /></button>
            </div>
          ))}
      </div>

      <div className="home-panel">
        <h4><UserRound size={15} /> Discover</h4>
        <button type="button" className="home-shortcut" onClick={() => navigate('/people')}>
          <span className="home-shortcut-icon"><Users size={20} /></span> Find friends
        </button>
        <button type="button" className="home-shortcut" onClick={() => navigate('/clips')}>
          <span className="home-shortcut-icon"><Video size={20} /></span> Watch clips
        </button>
      </div>
    </aside>

    {profileUser && <ProfileCardModal user={profileUser} onClose={() => setProfileUser(null)} onMessage={setChatUser} />}
    {chatUser && <MessengerModal user={chatUser} onClose={() => setChatUser(null)} />}
  </div>
}
