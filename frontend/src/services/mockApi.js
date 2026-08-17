const STORAGE_KEY = 'sums_offline_users'
const EVENTS_KEY = 'sums_offline_events'

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

export const mockApi = {
  defaults: { headers: { common: {} } },

  get(url) {
    if (url === '/health') return response({ status: 'ok' })
    if (url === '/users') return response(users().map(publicUser))
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
      const user = users().find((item) => item.user_id === data.user_id && item.password === data.password)
      if (!user || user.is_locked) return fail('Invalid user ID or password.', 401)
      addEvent('LOGIN_SUCCESS', user.user_id)
      return response({ expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), user: publicUser(user) })
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
    return fail(`Offline endpoint not implemented: POST ${url}`, 404)
  },
}
