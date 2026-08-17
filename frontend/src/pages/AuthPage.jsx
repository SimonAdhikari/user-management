import { useState } from 'react'
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck, Sparkles, UserPlus } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'
import AnimatedLogo from '../components/AnimatedLogo'

const emptySetup = { user_id: '', name: '', email: '', password: '', setup_key: '', role: 'Administrator' }
const emptySignup = { name: '', email: '', password: '' }

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [loginData, setLoginData] = useState({ email: '', password: '' })
  const [setupData, setSetupData] = useState(emptySetup)
  const [signupData, setSignupData] = useState(emptySignup)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const submitLogin = async (event) => {
    event.preventDefault(); setLoading(true); setError('')
    try { login((await api.post('/auth/login', loginData)).data) }
    catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }

  const submitSetup = async (event) => {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const payload = { ...setupData, user_id: setupData.user_id || null }
      delete payload.setup_key
      await api.post('/setup/administrator', payload, { headers: { 'X-Setup-Key': setupData.setup_key } })
      setMode('login')
      setLoginData({ email: setupData.email, password: setupData.password })
      setSetupData(emptySetup)
    } catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }

  const submitSignup = async (event) => {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const payload = { ...signupData, role: 'User' }
      await api.post('/auth/signup', payload)
      setMode('login')
      setLoginData({ email: signupData.email, password: signupData.password })
      setSignupData(emptySignup)
      setError('')
      alert('Account created! Please sign in with your email and password.')
    } catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }

  const change = (setter, data) => (event) => setter({ ...data, [event.target.name]: event.target.value })
  const isLogin = mode === 'login'
  const isSignup = mode === 'signup'

  return <main className="auth-shell">
    <section className="auth-brand">
      <AnimatedLogo size={52} iconSize={30} className="brand-mark" />
      <span className="eyebrow"><Sparkles size={14} /> SOCIAL MEDIA PLATFORM</span>
      <h1>Connect, share, and engage.</h1>
      <p>A secure social platform for posting updates, photos, videos, and connecting with your community.</p>
      <div className="trust-list">
        <span><LockKeyhole size={18} /> Protected user records</span>
        <span><KeyRound size={18} /> Secure authentication</span>
        <span><ShieldCheck size={18} /> Role-based access</span>
      </div>
    </section>
    <section className="auth-card-wrap">
      <div className="auth-card">
        <div className="auth-card-heading">
          <AnimatedLogo size={38} iconSize={19} className="mini-logo" />
          <h2>{isLogin ? 'Welcome back' : isSignup ? 'Create your account' : 'First-time setup'}</h2>
          <p>{isLogin ? 'Sign in to continue to your feed.' : isSignup ? 'Join the platform — create a free account.' : 'Create the first administrator account.'}</p>
        </div>
        <div className="auth-tabs">
          <button className={isLogin ? 'selected' : ''} onClick={() => { setMode('login'); setError('') }}>Sign in</button>
          <button className={isSignup ? 'selected' : ''} onClick={() => { setMode('signup'); setError('') }}>Sign up</button>
          <button className={mode === 'setup' ? 'selected' : ''} onClick={() => { setMode('setup'); setError('') }}>First-time setup</button>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {isLogin ? <form onSubmit={submitLogin} className="auth-form">
          <label>Email<input autoFocus name="email" type="email" value={loginData.email} onChange={change(setLoginData, loginData)} placeholder="you@example.com" required /></label>
          <label>Password<input name="password" type="password" value={loginData.password} onChange={change(setLoginData, loginData)} placeholder="Your password" required /></label>
          <button className="btn btn-wide" disabled={loading}>{loading ? 'Signing in…' : <>Sign in <ArrowRight size={17} /></>}</button>
        </form> : isSignup ? <form onSubmit={submitSignup} className="auth-form">
          <label>Full name<input autoFocus name="name" value={signupData.name} onChange={change(setSignupData, signupData)} placeholder="Your name" required /></label>
          <label>Email<input name="email" type="email" value={signupData.email} onChange={change(setSignupData, signupData)} placeholder="you@example.com" required /></label>
          <label>Password <small>10+ chars, upper/lowercase, digit & symbol</small><input name="password" type="password" value={signupData.password} onChange={change(setSignupData, signupData)} required /></label>
          <button className="btn btn-wide" disabled={loading}>{loading ? 'Creating account…' : <><UserPlus size={17} /> Create account</>}</button>
        </form> : <form onSubmit={submitSetup} className="auth-form">
          <label>Full name<input autoFocus name="name" value={setupData.name} onChange={change(setSetupData, setupData)} required /></label>
          <label>Email<input name="email" type="email" value={setupData.email} onChange={change(setSetupData, setupData)} required /></label>
          <label>User key <small>Optional — generated automatically</small><input name="user_id" value={setupData.user_id} onChange={change(setSetupData, setupData)} placeholder="USR_A1B2C3D4E5" /></label>
          <label>Password <small>10+ chars, upper/lowercase, digit & symbol</small><input name="password" type="password" value={setupData.password} onChange={change(setSetupData, setupData)} required /></label>
          <label>Setup key <small>Provided by the system owner</small><input name="setup_key" type="password" value={setupData.setup_key} onChange={change(setSetupData, setupData)} required /></label>
          <button className="btn btn-wide" disabled={loading}>{loading ? 'Creating secure account…' : <><UserPlus size={17} /> Create administrator</>}</button>
        </form>}
      </div>
    </section>
  </main>
}
