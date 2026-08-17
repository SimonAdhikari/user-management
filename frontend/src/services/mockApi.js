const STORAGE_KEY = 'sums_offline_users'
const EVENTS_KEY = 'sums_offline_events'
const POSTS_KEY = 'sums_offline_posts'

const initialUsers = [
  {
    user_id: 'ADMIN_DEMO01',
    name: 'Demo Administrator',
    email: 'admin@example.test',
    password: 'DemoPass1!',
    role: 'Administrator',
    is_locked: false,
    kyc_status: 'unverified',
    kyc_document_type: null,
    totp_enabled: false,
  },
]

const read = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return value ?? fallback
  } catch {
    return fallback
  }
}

const users = () => read(STORAGE_KEY, initialUsers)
const saveUsers = (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
const events = () => read(EVENTS_KEY, [])
const fail = (detail, status = 400) => Promise.reject({ response: { status, data: { detail } } })
const response = (data, status = 200) => Promise.resolve({ data, status })
const publicUser = ({ password, ...user }) => user

function addEvent(action, userId, details = '') {
  const record = { timestamp: new Date().toISOString(), action, user_id: userId, details }
  localStorage.setItem(EVENTS_KEY, JSON.stringify([...events(), record]))
}

function createUser(data) {
  const records = users()
  const email = data.email.trim().toLowerCase()
  if (records.some((user) => user.email === email)) return fail('A user with this email already exists.', 409)
  if (!data.name?.trim() || !data.password || !data.role) return fail('Name, password, and role are required.')
  const userId = data.user_id?.trim() || `USR_${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
  if (records.some((user) => user.user_id === userId)) return fail('A user with this ID already exists.', 409)
  const user = { user_id: userId, name: data.name.trim(), email, password: data.password, role: data.role, is_locked: false, kyc_status: 'unverified', kyc_document_type: null, totp_enabled: false }
  saveUsers([...records, user])
  addEvent('USER_CREATED', userId, `role=${user.role}`)
  return response({ message: 'User created.', user: publicUser(user) }, 201)
}

// ---------------------------------------------------------------------------
// Offline social store (posts, comments, reactions, share, repost)
// Mirrors the storage-server shapes so the UI works identically offline.
// ---------------------------------------------------------------------------
const ALLOWED_REACTIONS = ['like', 'love', 'haha', 'wow', 'sad', 'angry']
const nowIso = () => new Date().toISOString()
const newId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`

const posts = () => read(POSTS_KEY, [])
const savePosts = (value) => localStorage.setItem(POSTS_KEY, JSON.stringify(value))

const reactionSummary = (reactions) => ALLOWED_REACTIONS.reduce((acc, kind) => {
  acc[kind] = reactions.filter((r) => r.type === kind).length
  return acc
}, {})

const publicPost = (post) => ({
  id: post.id,
  author_id: post.author_id,
  author_name: post.author_name,
  author_role: post.author_role,
  body: post.body,
  media: post.media || [],
  created_at: post.created_at,
  like_count: (post.likes || []).length,
  likes: post.likes || [],
  reactions: reactionSummary(post.reactions || []),
  my_reaction: null,
  share_count: post.shares || 0,
  comment_count: (post.comments || []).length,
  repost_of: post.repost_of || null,
  comments: (post.comments || []).map((c) => ({
    id: c.id,
    author_id: c.author_id,
    author_name: c.author_name,
    author_role: c.author_role,
    body: c.body,
    created_at: c.created_at,
    parent_id: c.parent_id || null,
    likes: c.likes || [],
    like_count: (c.likes || []).length,
    edited: c.edited || false,
  })),
})

const findPost = (records, postId) => records.find((p) => p.id === postId)

// Offline mode has no bearer-token session, so the signed-in user is read from
// the same sessionStorage slot AuthContext writes on login.
const currentOfflineUser = () => {
  try { return JSON.parse(sessionStorage.getItem('sums_user') || 'null') } catch { return null }
}

function createOfflinePost(data, actor) {
  const records = posts()
  let repostRef = null
  if (data.repost_of) {
    const original = findPost(records, data.repost_of)
    if (!original) return fail('Original post not found.', 404)
    repostRef = {
      id: original.id,
      author_id: original.author_id,
      author_name: original.author_name,
      author_role: original.author_role,
      body: original.body,
      media: original.media || [],
      created_at: original.created_at,
      like_count: (original.likes || []).length,
      comment_count: (original.comments || []).length,
    }
  }
  const post = {
    id: newId('POST'),
    author_id: actor.user_id,
    author_name: actor.name,
    author_role: actor.role,
    body: (data.body || '').trim(),
    media: data.media || [],
    created_at: nowIso(),
    likes: [],
    reactions: [],
    shares: 0,
    comments: [],
    repost_of: repostRef,
  }
  if (!post.body) return fail('Post body is required.')
  records.unshift(post)
  savePosts(records)
  addEvent('POST_CREATED', actor.user_id, post.id)
  return response({ message: 'Post created.', post: publicPost(post) }, 201)
}

export const mockApi = {
  defaults: { headers: { common: {} } },

  get(url) {
    if (url === '/health') return response({ status: 'ok' })
    if (url === '/users') return response(users().map(publicUser))
    if (url === '/posts') return response(posts().map(publicPost))
    const userPosts = url.match(/^\/posts\/user\/([^/]+)$/)
    if (userPosts) return response(posts().filter((p) => p.author_id === userPosts[1]).map(publicPost))
    const singlePost = url.match(/^\/posts\/([^/]+)$/)
    if (singlePost) {
      const post = findPost(posts(), singlePost[1])
      return post ? response(publicPost(post)) : fail('Post not found.', 404)
    }
    if (url === '/reports/activity') {
      const records = users()
      return response({
        total_users: records.length,
        locked_accounts: records.filter((user) => user.is_locked).length,
        by_role: records.reduce((roles, user) => ({ ...roles, [user.role]: (roles[user.role] || 0) + 1 }), {}),
        recent_events: events().slice(-10),
      })
    }
    if (url === '/kyc/status') {
      const user = users()[0]
      return response({ kyc_status: user.kyc_status || 'unverified', document_type: user.kyc_document_type || null })
    }
    return fail(`Offline endpoint not implemented: GET ${url}`, 404)
  },

  post(url, data = {}) {
    if (url === '/auth/logout') return response(null, 204)
    if (url === '/auth/login') {
      const identifier = (data.email || data.user_id || '').trim().toLowerCase()
      const user = users().find((item) =>
        (item.email && item.email.toLowerCase() === identifier) || item.user_id.toLowerCase() === identifier)
      if (!user || user.password !== data.password) return fail('Invalid email or password.', 401)
      if (user.is_locked) return fail('This account is locked. Contact an administrator.', 403)
      addEvent('LOGIN_SUCCESS', user.user_id)
      const token = `offline_${crypto.randomUUID().replaceAll('-', '')}`
      return response({ expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), token, user: publicUser(user) })
    }
    if (url === '/setup/administrator') {
      return fail('Offline mode already includes a demo administrator account.', 409)
    }
    if (url === '/users') return createUser(data)
    if (url === '/2fa/setup') return response({ secret: 'OFFLINE-DEMO-SECRET', provisioning_uri: 'otpauth://totp/SUMS:offline' })
    if (url === '/2fa/confirm') {
      if (data.code !== '123456') return fail('For offline mode, use verification code 123456.')
      const records = users(); records[0] = { ...records[0], totp_enabled: true }; saveUsers(records)
      addEvent('TWO_FACTOR_ENABLED', records[0].user_id)
      return response({ message: 'Two-factor authentication enabled.', totp_enabled: true })
    }
    if (url === '/2fa/disable') {
      if (data.code !== '123456') return fail('For offline mode, use verification code 123456.')
      const records = users(); records[0] = { ...records[0], totp_enabled: false }; saveUsers(records)
      addEvent('TWO_FACTOR_DISABLED', records[0].user_id)
      return response({ message: 'Two-factor authentication disabled.', totp_enabled: false })
    }
    if (url === '/kyc/submit') {
      const records = users(); records[0] = { ...records[0], kyc_status: 'verified', kyc_document_type: data.document_type }; saveUsers(records)
      addEvent('KYC_VERIFIED', records[0].user_id, `document_type=${data.document_type}`)
      return response({ message: 'KYC verification completed.', kyc_status: 'verified' })
    }
    const unlock = url.match(/^\/users\/([^/]+)\/unlock$/)
    if (unlock) {
      const records = users()
      const index = records.findIndex((user) => user.user_id === unlock[1])
      if (index === -1) return fail(`No user found with ID '${unlock[1]}'.`, 404)
      records[index] = { ...records[index], is_locked: false }
      saveUsers(records)
      addEvent('ACCOUNT_UNLOCKED', unlock[1])
      return response(publicUser(records[index]))
    }

    // ---- Offline social endpoints ----
    if (url === '/posts') {
      const actor = currentOfflineUser()
      if (!actor) return fail('Sign in to post.', 401)
      return createOfflinePost(data, actor)
    }
    if (url === '/media/upload') {
      // Offline: persist the file as a data URL so it renders without a server.
      const file = data?.get?.('file')
      if (!file) return fail('No file provided.', 400)
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve({
          status: 201,
          data: {
            url: reader.result,
            kind: file.type.startsWith('video') ? 'video' : 'image',
            mime_type: file.type,
            filename: file.name,
          },
        })
        reader.readAsDataURL(file)
      })
    }
    const like = url.match(/^\/posts\/([^/]+)\/like$/)
    if (like) {
      const actor = currentOfflineUser()
      if (!actor) return fail('Sign in to like posts.', 401)
      const records = posts()
      const post = findPost(records, like[1])
      if (!post) return fail('Post not found.', 404)
      post.likes = post.likes || []
      const idx = post.likes.indexOf(actor.user_id)
      let liked
      if (idx >= 0) { post.likes.splice(idx, 1); liked = false } else { post.likes.push(actor.user_id); liked = true }
      savePosts(records)
      return response({ liked, like_count: post.likes.length })
    }
    const react = url.match(/^\/posts\/([^/]+)\/react$/)
    if (react) {
      const actor = currentOfflineUser()
      if (!actor) return fail('Sign in to react.', 401)
      if (!ALLOWED_REACTIONS.includes(data.reaction)) return fail('Unknown reaction type.')
      const records = posts()
      const post = findPost(records, react[1])
      if (!post) return fail('Post not found.', 404)
      post.reactions = post.reactions || []
      const existing = post.reactions.find((r) => r.user_id === actor.user_id)
      let myReaction
      if (existing && existing.type === data.reaction) {
        post.reactions = post.reactions.filter((r) => r !== existing); myReaction = null
      } else if (existing) {
        existing.type = data.reaction; myReaction = data.reaction
      } else {
        post.reactions.push({ user_id: actor.user_id, type: data.reaction }); myReaction = data.reaction
      }
      savePosts(records)
      return response({ my_reaction: myReaction, reactions: reactionSummary(post.reactions), like_count: (post.likes || []).length + post.reactions.length })
    }
    const share = url.match(/^\/posts\/([^/]+)\/share$/)
    if (share) {
      const records = posts()
      const post = findPost(records, share[1])
      if (!post) return fail('Post not found.', 404)
      post.shares = (post.shares || 0) + 1
      savePosts(records)
      return response({ share_count: post.shares })
    }
    const addComment = url.match(/^\/posts\/([^/]+)\/comments$/)
    if (addComment) {
      const actor = currentOfflineUser()
      if (!actor) return fail('Sign in to comment.', 401)
      const body = (data.body || '').trim()
      if (!body) return fail('Comment body is required.')
      const records = posts()
      const post = findPost(records, addComment[1])
      if (!post) return fail('Post not found.', 404)
      if (data.parent_id && !(post.comments || []).some((c) => c.id === data.parent_id)) {
        return fail('Parent comment not found.', 404)
      }
      const comment = {
        id: newId('CMT'),
        author_id: actor.user_id,
        author_name: actor.name,
        author_role: actor.role,
        body,
        created_at: nowIso(),
        parent_id: data.parent_id || null,
        likes: [],
        edited: false,
      }
      post.comments = post.comments || []
      post.comments.push(comment)
      savePosts(records)
      return response({ message: 'Comment added.', comment }, 201)
    }
    const commentLike = url.match(/^\/posts\/([^/]+)\/comments\/([^/]+)\/like$/)
    if (commentLike) {
      const actor = currentOfflineUser()
      if (!actor) return fail('Sign in to like comments.', 401)
      const records = posts()
      const post = findPost(records, commentLike[1])
      if (!post) return fail('Post not found.', 404)
      const comment = (post.comments || []).find((c) => c.id === commentLike[2])
      if (!comment) return fail('Comment not found.', 404)
      comment.likes = comment.likes || []
      const idx = comment.likes.indexOf(actor.user_id)
      let liked
      if (idx >= 0) { comment.likes.splice(idx, 1); liked = false } else { comment.likes.push(actor.user_id); liked = true }
      savePosts(records)
      return response({ liked, like_count: comment.likes.length })
    }
    return fail(`Offline endpoint not implemented: POST ${url}`, 404)
  },

  put(url, data = {}) {
    const editComment = url.match(/^\/posts\/([^/]+)\/comments\/([^/]+)$/)
    if (editComment) {
      const actor = currentOfflineUser()
      if (!actor) return fail('Sign in to edit comments.', 401)
      const body = (data.body || '').trim()
      if (!body) return fail('Comment body is required.')
      const records = posts()
      const post = findPost(records, editComment[1])
      if (!post) return fail('Post not found.', 404)
      const comment = (post.comments || []).find((c) => c.id === editComment[2])
      if (!comment) return fail('Comment not found.', 404)
      if (comment.author_id !== actor.user_id && actor.role !== 'Administrator') {
        return fail('You can only edit your own comments.', 403)
      }
      comment.body = body
      comment.edited = true
      savePosts(records)
      return response({ message: 'Comment updated.', comment })
    }
    return fail(`Offline endpoint not implemented: PUT ${url}`, 404)
  },

  delete(url) {
    const actor = currentOfflineUser()
    if (!actor) return fail('Sign in to delete.', 401)
    const delComment = url.match(/^\/posts\/([^/]+)\/comments\/([^/]+)$/)
    if (delComment) {
      const records = posts()
      const post = findPost(records, delComment[1])
      if (!post) return fail('Post not found.', 404)
      const comment = (post.comments || []).find((c) => c.id === delComment[2])
      if (!comment) return fail('Comment not found.', 404)
      if (comment.author_id !== actor.user_id && actor.role !== 'Administrator') {
        return fail('You can only delete your own comments.', 403)
      }
      // Remove the comment and any replies nested under it.
      post.comments = (post.comments || []).filter((c) => c.id !== delComment[2] && c.parent_id !== delComment[2])
      savePosts(records)
      return response(null, 204)
    }
    const delPost = url.match(/^\/posts\/([^/]+)$/)
    if (delPost) {
      const records = posts()
      const post = findPost(records, delPost[1])
      if (!post) return fail('Post not found.', 404)
      if (post.author_id !== actor.user_id && actor.role !== 'Administrator') {
        return fail('You can only delete your own posts.', 403)
      }
      savePosts(records.filter((p) => p.id !== delPost[1]))
      return response(null, 204)
    }
    return fail(`Offline endpoint not implemented: DELETE ${url}`, 404)
  },
}
