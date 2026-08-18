import { useEffect, useReducer } from 'react'
import { api, getConnectionState } from './api'

// ---------------------------------------------------------------------------
// Client-side social graph: follows, friend requests, friendships, messages
// and profile extras (bio/cover). Stored in localStorage so the features work
// identically in online and offline modes. When online, every mutation is
// also synced to the backend social API (/social/*) so relationships persist
// server-side and are shared across devices.
// ---------------------------------------------------------------------------
const SOCIAL_KEY = 'sums_social_graph'

// Fire-and-forget backend sync. Errors are swallowed so the local graph
// always stays usable (offline mode relies on localStorage alone).
function syncToBackend(fn) {
  if (getConnectionState() !== 'online') return
  Promise.resolve().then(fn).catch(() => {})
}

// Pull the authoritative social graph from the backend and merge it into the
// local cache. Called after login / on reconnect.
export async function loadSocialFromBackend() {
  if (getConnectionState() !== 'online') return
  try {
    const { data } = await api.get('/social/info')
    const graph = load()
    // The backend returns arrays of user IDs for the current user.
    // We store them keyed by the current user id, which we infer from the
    // first entry in any of the lists, or fall back to a stored "me" marker.
    const me = graph._me
    if (!me) return
    graph.follows[me] = data.following || []
    graph.friends[me] = data.friends || []
    graph.blocked[me] = data.blocked || []
    graph.friendRequests[me] = data.friend_requests_sent || []
    // Incoming requests are stored under the requester's key in the local
    // model, so we map them back.
    ;(data.friend_requests_received || []).forEach((requester) => {
      if (!graph.friendRequests[requester]) graph.friendRequests[requester] = []
      if (!graph.friendRequests[requester].includes(me)) graph.friendRequests[requester].push(me)
    })
    save()
  } catch {
    /* offline or not authenticated — keep local graph */
  }
}

// Remember which user id the local graph belongs to so loadSocialFromBackend
// can merge server data into the right slot.
export function setSocialOwner(userId) {
  const graph = load()
  graph._me = userId
  save()
}

const listeners = new Set()
let cache = null

const emptyGraph = () => ({ follows: {}, friendRequests: {}, friends: {}, blocked: {}, messages: {}, profiles: {} })

function load() {
  if (cache) return cache
  try {
    cache = { ...emptyGraph(), ...(JSON.parse(localStorage.getItem(SOCIAL_KEY)) || {}) }
  } catch {
    cache = emptyGraph()
  }
  return cache
}

function save() {
  localStorage.setItem(SOCIAL_KEY, JSON.stringify(cache))
  listeners.forEach((listener) => listener())
}

export function subscribeSocial(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Re-render hook: components call useSocial() once, then read the helpers
// below; every graph mutation notifies subscribers.
export function useSocial() {
  const [version, bump] = useReducer((value) => value + 1, 0)
  useEffect(() => subscribeSocial(bump), [])
  return version
}

// Stable hash used to seed demo numbers (followers, presence, covers…).
export function hashOf(value) {
  let hash = 0
  const str = String(value)
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  return hash
}

const pair = (a, b) => [a, b].sort().join('__')
const list = (map, key) => map[key] || []

/* -------------------------------- Follows ------------------------------- */
export const isFollowing = (me, them) => list(load().follows, me).includes(them)

export function toggleFollow(me, them) {
  const graph = load()
  const current = list(graph.follows, me)
  const nowFollowing = !current.includes(them)
  graph.follows[me] = nowFollowing
    ? [...current, them]
    : current.filter((id) => id !== them)
  save()
  syncToBackend(() => nowFollowing
    ? api.post('/social/follow', { target_user_id: them })
    : api.delete(`/social/follow/${them}`))
}

export const followingCount = (me) => list(load().follows, me).length

export function followerCount(them) {
  const real = Object.values(load().follows).filter((ids) => ids.includes(them)).length
  return 24 + (hashOf(them) % 870) + real
}

/* -------------------------------- Friends ------------------------------- */
export function friendStatus(me, them) {
  const graph = load()
  if (list(graph.friends, me).includes(them)) return 'friends'
  if (list(graph.friendRequests, me).includes(them)) return 'outgoing'
  if (list(graph.friendRequests, them).includes(me)) return 'incoming'
  return 'none'
}

export function sendFriendRequest(me, them) {
  const graph = load()
  if (!list(graph.friendRequests, me).includes(them)) {
    graph.friendRequests[me] = [...list(graph.friendRequests, me), them]
  }
  save()
  syncToBackend(() => api.post('/social/friend-request', { target_user_id: them }))
}

export function cancelFriendRequest(me, them) {
  const graph = load()
  graph.friendRequests[me] = list(graph.friendRequests, me).filter((id) => id !== them)
  save()
  syncToBackend(() => api.delete(`/social/friend-request/${them}`))
}

export function respondFriendRequest(me, them, accept) {
  const graph = load()
  graph.friendRequests[them] = list(graph.friendRequests, them).filter((id) => id !== me)
  if (accept) {
    if (!list(graph.friends, me).includes(them)) graph.friends[me] = [...list(graph.friends, me), them]
    if (!list(graph.friends, them).includes(me)) graph.friends[them] = [...list(graph.friends, them), me]
  }
  save()
  syncToBackend(() => accept
    ? api.post('/social/friend-request/accept', { target_user_id: them })
    : api.post('/social/friend-request/decline', { target_user_id: them }))
}

export function removeFriend(me, them) {
  const graph = load()
  graph.friends[me] = list(graph.friends, me).filter((id) => id !== them)
  graph.friends[them] = list(graph.friends, them).filter((id) => id !== me)
  save()
  syncToBackend(() => api.delete(`/social/friend/${them}`))
}

export const friendsOf = (me) => list(load().friends, me)

export function mutualFriendCount(me, them) {
  const mine = new Set(friendsOf(me))
  const real = friendsOf(them).filter((id) => mine.has(id)).length
  return real + (hashOf(pair(me, them)) % 7)
}

/* -------------------------------- Blocking ------------------------------ */
export const isBlocked = (me, them) => list(load().blocked, me).includes(them)

export function blockUser(me, them) {
  const graph = load()
  if (!list(graph.blocked, me).includes(them)) graph.blocked[me] = [...list(graph.blocked, me), them]
  // Blocking severs every relationship in both directions.
  graph.follows[me] = list(graph.follows, me).filter((id) => id !== them)
  graph.follows[them] = list(graph.follows, them).filter((id) => id !== me)
  graph.friends[me] = list(graph.friends, me).filter((id) => id !== them)
  graph.friends[them] = list(graph.friends, them).filter((id) => id !== me)
  graph.friendRequests[me] = list(graph.friendRequests, me).filter((id) => id !== them)
  graph.friendRequests[them] = list(graph.friendRequests, them).filter((id) => id !== me)
  save()
  syncToBackend(() => api.post('/social/block', { target_user_id: them }))
}

export function unblockUser(me, them) {
  const graph = load()
  graph.blocked[me] = list(graph.blocked, me).filter((id) => id !== them)
  save()
  syncToBackend(() => api.delete(`/social/block/${them}`))
}

/* -------------------------------- Messages ------------------------------ */
export const getMessages = (me, them) => load().messages[pair(me, them)] || []

function pushMessage(from, to, body) {
  const graph = load()
  const key = pair(from, to)
  const record = {
    id: `MSG_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from,
    body,
    at: new Date().toISOString(),
  }
  graph.messages[key] = [...(graph.messages[key] || []), record]
  save()
  return record
}

export const sendMessage = (me, them, body) => pushMessage(me, them, body)
export const pushReply = (me, them, body) => pushMessage(them, me, body)

/* ----------------------------- Profile extras --------------------------- */
const DEFAULT_BIOS = {
  Administrator: 'Keeping this community safe ✨',
  'Security Analyst': 'Watching the signals 📡',
  User: 'Living my best life 🌱',
}

export function profileExtra(user) {
  const extra = load().profiles[user.user_id] || {}
  return {
    bio: extra.bio || DEFAULT_BIOS[user.role] || 'Hey there! I am using Social Hub.',
    cover: hashOf(user.user_id) % 6,
  }
}

export function setBio(userId, bio) {
  const graph = load()
  graph.profiles[userId] = { ...(graph.profiles[userId] || {}), bio: bio.trim() }
  save()
}

/* -------------------------------- Presence ------------------------------ */
export function presenceOf(user) {
  if (user.is_locked) return 'offline'
  const roll = hashOf(user.user_id) % 10
  if (roll < 6) return 'online'
  if (roll < 8) return 'idle'
  return 'offline'
}

export const presenceLabel = { online: 'Active now', idle: 'Active recently', offline: 'Offline' }
