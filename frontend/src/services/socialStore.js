import { useEffect, useReducer } from 'react'

// ---------------------------------------------------------------------------
// Client-side social graph: follows, friend requests, friendships, messages
// and profile extras (bio/cover). Stored in localStorage so the features work
// identically in online and offline modes (the backend has no social API yet).
// ---------------------------------------------------------------------------
const SOCIAL_KEY = 'sums_social_graph'

const listeners = new Set()
let cache = null

const emptyGraph = () => ({ follows: {}, friendRequests: {}, friends: {}, messages: {}, profiles: {} })

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
  graph.follows[me] = current.includes(them)
    ? current.filter((id) => id !== them)
    : [...current, them]
  save()
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
}

export function cancelFriendRequest(me, them) {
  const graph = load()
  graph.friendRequests[me] = list(graph.friendRequests, me).filter((id) => id !== them)
  save()
}

export function respondFriendRequest(me, them, accept) {
  const graph = load()
  graph.friendRequests[them] = list(graph.friendRequests, them).filter((id) => id !== me)
  if (accept) {
    if (!list(graph.friends, me).includes(them)) graph.friends[me] = [...list(graph.friends, me), them]
    if (!list(graph.friends, them).includes(me)) graph.friends[them] = [...list(graph.friends, them), me]
  }
  save()
}

export function removeFriend(me, them) {
  const graph = load()
  graph.friends[me] = list(graph.friends, me).filter((id) => id !== them)
  graph.friends[them] = list(graph.friends, them).filter((id) => id !== me)
  save()
}

export const friendsOf = (me) => list(load().friends, me)

export function mutualFriendCount(me, them) {
  const mine = new Set(friendsOf(me))
  const real = friendsOf(them).filter((id) => mine.has(id)).length
  return real + (hashOf(pair(me, them)) % 7)
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
