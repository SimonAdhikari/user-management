import { useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, ClipboardList, Copy, KeyRound, ShieldCheck, UsersRound } from 'lucide-react'
import { api, errorMessage } from '../services/api'
import { useAuth } from '../context/AuthContext'

const PageHeader = ({ eyebrow = 'SECURE WORKSPACE', title, subtitle, children }) => (
  <div className="page-header page-header-row">
    <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{subtitle}</p></div>{children}
  </div>
)

const Empty = ({ children }) => <div className="empty-state glass-panel">{children}</div>

const formatTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function Dashboard() {
  const { user } = useAuth()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!['Administrator', 'Security Analyst'].includes(user?.role)) return
    api.get('/reports/activity').then(({ data }) => setReport(data)).catch(err => setError(errorMessage(err)))
  }, [user?.role])

  const events = report?.recent_events ? [...report.recent_events].reverse().slice(0, 5) : []
  return <div className="page-container">
    <PageHeader eyebrow="WELCOME BACK" title={`Hello, ${user?.name?.split(' ')[0] || 'there'}`} subtitle="Here is the current state of your secure workspace." />
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {report ? <>
      <div className="metric-row">
        <div className="metric-card"><UsersRound size={19} /><div><span>Registered users</span><strong>{report.total_users}</strong></div></div>
        <div className="metric-card metric-safe"><CheckCircle2 size={19} /><div><span>Unlocked accounts</span><strong>{report.total_users - report.locked_accounts}</strong></div></div>
        <div className="metric-card metric-admin"><ShieldCheck size={19} /><div><span>Locked accounts</span><strong>{report.locked_accounts}</strong></div></div>
      </div>
      <section className="glass-panel activity-panel"><div className="section-heading"><span className="icon-chip"><Activity size={18} /></span><div><h3>Recent activity</h3><p>Latest events recorded by the audit log.</p></div></div>{events.length ? <div className="activity-list">{events.map((event, index) => <div className="activity-item" key={`${event.timestamp}-${index}`}><div className="activity-dot" /><div><strong>{event.action.replaceAll('_', ' ')}</strong><span>{event.user_id} {event.details ? `· ${event.details}` : ''}</span></div><time>{formatTime(event.timestamp)}</time></div>)}</div> : <p className="muted">No activity has been recorded yet.</p>}</section>
    </> : <Empty><ClipboardList size={34} /><strong>{['Administrator', 'Security Analyst'].includes(user?.role) ? 'Loading workspace overview…' : 'Your account is ready'}</strong><span>{['Administrator', 'Security Analyst'].includes(user?.role) ? 'Fetching the latest audit summary.' : 'Use My security to protect your account with 2FA and identity verification.'}</span></Empty>}
  </div>
}

export function ActivityLogs() {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.get('/reports/activity').then(({ data }) => setReport(data)).catch(err => setError(errorMessage(err))) }, [])
  const events = useMemo(() => report?.recent_events ? [...report.recent_events].reverse() : [], [report])
  return <div className="page-container"><PageHeader title="Activity log" subtitle="A concise, read-only record of security-relevant actions." />{error && <div className="alert alert-error" role="alert">{error}</div>}<section className="glass-panel table-panel"><div className="section-heading"><span className="icon-chip"><Activity size={18} /></span><div><h3>Audit trail</h3><p>{report ? `${events.length} most recent events` : 'Loading audit events…'}</p></div></div>{events.length ? <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>When</th><th>Action</th><th>Account</th><th>Details</th></tr></thead><tbody>{events.map((event, index) => <tr key={`${event.timestamp}-${index}`}><td>{formatTime(event.timestamp)}</td><td><span className="event-label">{event.action.replaceAll('_', ' ')}</span></td><td><code>{event.user_id}</code></td><td>{event.details || '—'}</td></tr>)}</tbody></table></div> : !error && <p className="muted">No activity recorded yet.</p>}</section></div>
}

export function MySecurity() {
  const { user } = useAuth()
  const [kyc, setKyc] = useState({ status: user?.kyc_status || 'unverified', document_type: user?.kyc_document_type || '' })
  const [document, setDocument] = useState({ document_type: '', document_number: '' })
  const [totp, setTotp] = useState(user?.totp_enabled)
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const notify = (value) => { setError(''); setMessage(value) }
  const request = async (action, task) => { setLoading(action); setError(''); setMessage(''); try { await task() } catch (err) { setError(errorMessage(err)) } finally { setLoading('') } }
  const copy = async (value) => { try { await navigator.clipboard.writeText(value); notify('Copied to your clipboard.') } catch { setError('Copy is not available in this browser. Select the value and copy it manually.') } }
  return <div className="page-container"><PageHeader title="My security" subtitle="Review your account, protect sign-in with 2FA, and manage identity verification." />{error && <div className="alert alert-error" role="alert">{error}</div>}{message && <div className="alert alert-success" role="status">{message}</div>}<div className="security-grid"><section className="glass-panel security-panel"><div className="section-heading"><span className="icon-chip"><ShieldCheck size={18} /></span><div><h3>Account details</h3><p>Information tied to your current session.</p></div></div><dl className="details-list"><div><dt>Name</dt><dd>{user?.name}</dd></div><div><dt>Email</dt><dd>{user?.email}</dd></div><div><dt>Role</dt><dd><span className="role-pill">{user?.role}</span></dd></div><div><dt>User key</dt><dd><code>{user?.user_id}</code></dd></div></dl></section><section className="glass-panel security-panel"><div className="section-heading"><span className="icon-chip"><KeyRound size={18} /></span><div><h3>Two-factor authentication</h3><p>{totp ? 'Two-factor authentication is enabled.' : 'Add an authenticator app for a stronger sign-in.'}</p></div></div>{!totp && !setup && <button className="btn" disabled={loading === 'setup'} onClick={() => request('setup', async () => { const { data } = await api.post('/2fa/setup'); setSetup(data) })}>{loading === 'setup' ? 'Preparing…' : 'Set up 2FA'}</button>}{setup && !totp && <div className="setup-box"><p>Add this secret to an authenticator app, then enter its six-digit code.</p><code>{setup.secret}</code><button className="icon-button" onClick={() => copy(setup.secret)} aria-label="Copy 2FA secret"><Copy size={16} /></button><label className="form-group">Verification code<input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="123456" /></label><button className="btn" disabled={loading === 'confirm' || code.length !== 6} onClick={() => request('confirm', async () => { await api.post('/2fa/confirm', { code }); setTotp(true); setSetup(null); notify('Two-factor authentication is enabled.') })}>Confirm and enable</button></div>}{totp && <button className="btn btn-secondary" disabled={loading === 'disable'} onClick={() => request('disable', async () => { await api.post('/2fa/disable', { code: window.prompt('Enter your current six-digit authenticator code:') || '' }); setTotp(false); notify('Two-factor authentication is disabled.') })}>{loading === 'disable' ? 'Disabling…' : 'Disable 2FA'}</button>}</section><section className="glass-panel security-panel"><div className="section-heading"><span className="icon-chip"><CheckCircle2 size={18} /></span><div><h3>Identity verification</h3><p>Status: <strong className={kyc.status === 'verified' ? 'success-text' : ''}>{kyc.status}</strong>{kyc.document_type ? ` · ${kyc.document_type}` : ''}</p></div></div>{kyc.status !== 'verified' ? <form className="stack-form" onSubmit={e => { e.preventDefault(); request('kyc', async () => { const { data } = await api.post('/kyc/submit', document); setKyc({ status: data.kyc_status, document_type: document.document_type }); notify('Identity verification was submitted successfully.') }) }}><label className="form-group">Document type<select value={document.document_type} onChange={e => setDocument({ ...document, document_type: e.target.value })} required><option value="">Choose a document</option><option>Passport</option><option>National ID</option><option>Driving licence</option></select></label><label className="form-group">Document number<input value={document.document_number} onChange={e => setDocument({ ...document, document_number: e.target.value })} minLength="4" required /></label><button className="btn" disabled={loading === 'kyc'}>{loading === 'kyc' ? 'Submitting…' : 'Verify identity'}</button></form> : <p className="success-text">Your identity verification is complete.</p>}</section></div></div>
}

export function Support() {
  return <div className="page-container"><PageHeader title="Using the workspace" subtitle="A few practical steps for managing access safely." /><section className="glass-panel support-panel"><ol><li><strong>Create only necessary accounts.</strong> Use the least privileged role that fits the person’s work.</li><li><strong>Keep passwords temporary and strong.</strong> Share initial credentials through a secure, separate channel.</li><li><strong>Review the activity log regularly.</strong> Investigate unfamiliar sign-ins, lockouts, or account changes.</li><li><strong>Enable 2FA on your own account.</strong> It adds an important safeguard if a password is exposed.</li></ol></section></div>
}
