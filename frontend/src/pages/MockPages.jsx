import { useEffect, useState } from 'react'
import { 
  Activity, ShieldAlert, BarChart3, Clock, 
  Network, Zap, Database, Download, CheckCircle, XCircle, Search 
} from 'lucide-react'
import { api, errorMessage } from '../services/api'

const PageWrapper = ({ title, subtitle, children }) => (
  <div className="page-container">
    <div className="page-header visual-page-header">
      <div>
        <span className="eyebrow">CYBER OPERATIONS</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="header-graphic" aria-hidden="true">
        <div className="radar-core"><span></span></div>
        <i></i><i></i><i></i>
      </div>
    </div>
    {children}
  </div>
)

const StatCard = ({ title, value, icon, color }) => (
  <div className="glass-panel stat-card visual-stat-card">
    <div className="stat-icon" style={{ color: color, background: `${color}1A` }}>
      {icon}
    </div>
    <div className="stat-content">
      <h4>{title}</h4>
      <h2>{value}</h2>
    </div>
    <div className="stat-spark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  </div>
)

export const Dashboard = () => (
  <PageWrapper title="Dashboard" subtitle="Overview of your Cyber Security Institute system.">
    <div className="users-grid">
      <StatCard title="Total Users" value="1,248" icon={<BarChart3 />} color="#6366f1" />
      <StatCard title="Active Incidents" value="3" icon={<ShieldAlert />} color="#ef4444" />
      <StatCard title="System Uptime" value="99.9%" icon={<Activity />} color="#10b981" />
      <StatCard title="Network Load" value="45%" icon={<Network />} color="#f59e0b" />
    </div>
    <div className="dashboard-visual-grid">
      <div className="glass-panel activity-orbit">
        <div className="orbit-copy"><span className="eyebrow">LIVE DEFENCE</span><h3>Security posture <strong>Protected</strong></h3><p>All critical systems are operating within their secure baseline.</p></div>
        <div className="orbit-art" aria-label="Security status visual"><div className="orbit-ring ring-one"></div><div className="orbit-ring ring-two"></div><div className="orbit-shield"><ShieldAlert size={34} /></div><span className="orbit-dot dot-one"></span><span className="orbit-dot dot-two"></span></div>
      </div>
      <div className="glass-panel activity-feed">
        <div className="feed-title"><div><span className="eyebrow">AUDIT STREAM</span><h3>Recent activity</h3></div><span className="live-pill"><i /> LIVE</span></div>
        <div className="timeline"><p><span className="timeline-icon ok"><CheckCircle size={14} /></span><b>Administrator signed in</b><small>just now</small></p><p><span className="timeline-icon warning"><ShieldAlert size={14} /></span><b>Access review completed</b><small>12 min ago</small></p><p><span className="timeline-icon ok"><Activity size={14} /></span><b>Nightly scan completed</b><small>2 hr ago</small></p></div>
      </div>
    </div>
  </PageWrapper>
)

export const RolesPolicies = () => (
  <PageWrapper title="Roles & Policies" subtitle="Manage RBAC (Role-Based Access Control) configuration.">
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>Active Policies</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li style={{ padding: '1rem', borderBottom: '1px solid var(--card-border)' }}><strong>Administrator:</strong> Full system access, CRUD on users, Configuration.</li>
        <li style={{ padding: '1rem', borderBottom: '1px solid var(--card-border)' }}><strong>Security Analyst:</strong> Read-only logs, Execute Scans, Incident Reporting.</li>
        <li style={{ padding: '1rem' }}><strong>Standard User:</strong> Profile access only.</li>
      </ul>
    </div>
  </PageWrapper>
)

export const ActivityLogs = () => {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/reports/activity')
      .then(res => setReport(res.data))
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const events = report?.recent_events ? [...report.recent_events].reverse() : []

  return (
    <PageWrapper title="Activity Logs" subtitle="System-wide audit trail of all actions.">
      {error && <div className="alert alert-error">{error}</div>}
      {report && (
        <div className="users-grid" style={{ marginBottom: '1.5rem' }}>
          <StatCard title="Total Users" value={report.total_users} icon={<BarChart3 />} color="#6366f1" />
          <StatCard title="Locked Accounts" value={report.locked_accounts} icon={<ShieldAlert />} color="#ef4444" />
          {Object.entries(report.by_role).map(([role, count], i) => (
            <StatCard key={role} title={role + 's'} value={count} icon={<Activity />} color={['#10b981', '#f59e0b', '#3b82f6'][i % 3]} />
          ))}
        </div>
      )}
      <div className="glass-panel" style={{ padding: '2rem', minHeight: '400px' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--card-border)' }}>
              <th style={{ padding: '1rem' }}>Timestamp</th>
              <th style={{ padding: '1rem' }}>User</th>
              <th style={{ padding: '1rem' }}>Action</th>
              <th style={{ padding: '1rem' }}>Details</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {loading && <tr><td colSpan="4" style={{ padding: '1rem' }}>Loading audit trail…</td></tr>}
            {!loading && !events.length && !error && <tr><td colSpan="4" style={{ padding: '1rem' }}>No activity recorded yet.</td></tr>}
            {events.map((event, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--card-border)' }}>
                <td style={{ padding: '1rem' }}>{event.timestamp}</td>
                <td style={{ padding: '1rem' }}>{event.user_id}</td>
                <td style={{ padding: '1rem' }}>{event.action}</td>
                <td style={{ padding: '1rem' }}>{event.details || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrapper>
  )
}

export const LoginAttempts = () => (
  <PageWrapper title="Login Attempts" subtitle="Monitor authentication success and failures.">
    <div className="users-grid">
      <StatCard title="Successful Logins" value="1,042" icon={<CheckCircle />} color="#10b981" />
      <StatCard title="Failed Attempts" value="87" icon={<XCircle />} color="#ef4444" />
    </div>
  </PageWrapper>
)

export const NetworkMonitor = () => (
  <PageWrapper title="Network Monitor" subtitle="Real-time traffic and connection health.">
    <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center' }}>
      <Network size={64} color="var(--primary)" style={{ marginBottom: '1rem' }} />
      <h3>Network Status: Optimal</h3>
      <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>No anomalous packets detected in the last 24 hours.</p>
    </div>
  </PageWrapper>
)

export const IncidentResponse = () => (
  <PageWrapper title="Incident Response" subtitle="Manage and triage active security tickets.">
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <h3>No Active Incidents</h3>
      <p style={{ color: 'var(--text-secondary)' }}>All clear! You can click 'Create Ticket' if you notice suspicious behavior.</p>
      <button className="btn" style={{ marginTop: '1rem' }}><Zap size={16} /> Create Ticket</button>
    </div>
  </PageWrapper>
)

export const ThreatIntel = () => (
  <PageWrapper title="Threat Intelligence" subtitle="Live feed of global CVEs and vulnerabilities.">
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <div className="alert alert-error"><strong>CRITICAL:</strong> CVE-2026-9999 - Zero-day vulnerability in common package. Patch immediately.</div>
      <div className="alert" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
        <strong>WARN:</strong> Increased phishing campaigns detected targeting educational sectors.
      </div>
    </div>
  </PageWrapper>
)

export const VulnerabilityScans = () => (
  <PageWrapper title="Vulnerability Scans" subtitle="Schedule and review system port/app scans.">
    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h3>Last Scan: 2 hours ago</h3>
        <p style={{ color: 'var(--success)' }}>0 Critical, 2 Low vulnerabilities found.</p>
      </div>
      <button className="btn"><Search size={16} /> Run Scan Now</button>
    </div>
  </PageWrapper>
)

export const DataExport = () => (
  <PageWrapper title="Data Export" subtitle="Download audit logs and user records (JSON/CSV).">
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <h3>Generate Backup</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Select the format you wish to export the system state in.</p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button className="btn" style={{ background: '#10b981' }}><Database size={16} /> Export JSON</button>
        <button className="btn" style={{ background: '#3b82f6' }}><Download size={16} /> Export CSV</button>
      </div>
    </div>
  </PageWrapper>
)

export const SecuritySettings = () => (
  <PageWrapper title="Security Settings" subtitle="Configure 2FA, password expiration, and timeouts.">
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <div className="form-group">
        <label>Require 2FA for all Administrators?</label>
        <select className="form-control" defaultValue="yes">
          <option value="yes">Yes, Enforced</option>
          <option value="no">No, Optional</option>
        </select>
      </div>
      <div className="form-group">
        <label>Session Timeout (Minutes)</label>
        <input type="number" className="form-control" defaultValue="30" />
      </div>
      <button className="btn">Save Configuration</button>
    </div>
  </PageWrapper>
)

export const SystemConfig = () => (
  <PageWrapper title="System Configuration" subtitle="Global environment variables and integrations.">
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <p style={{ color: 'var(--text-secondary)' }}>System configurations are currently locked by the Super Admin.</p>
    </div>
  </PageWrapper>
)

export const MyProfile = () => (
  <PageWrapper title="My Profile" subtitle="Manage your personal account settings.">
    <div className="glass-panel" style={{ padding: '2rem', maxWidth: '500px' }}>
      <div className="form-group">
        <label>Name</label>
        <input type="text" className="form-control" defaultValue="System Administrator" disabled />
      </div>
      <div className="form-group">
        <label>Email</label>
        <input type="email" className="form-control" defaultValue="admin@cyberinstitute.edu" disabled />
      </div>
      <button className="btn">Request Change</button>
    </div>
  </PageWrapper>
)

export const Support = () => (
  <PageWrapper title="Help & Support" subtitle="Need assistance? We're here to help.">
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <h3>Documentation</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Read our quickstart guide to learn how to manage users effectively.</p>
      <button className="btn" style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)' }}>Read Docs</button>
    </div>
  </PageWrapper>
)

export const About = () => (
  <PageWrapper title="About Institute" subtitle="Information about the Cyber Security Institute.">
    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
      <ShieldAlert size={64} color="var(--primary)" style={{ marginBottom: '1rem' }} />
      <h2>Cyber Security Institute v2.0</h2>
      <p style={{ color: 'var(--text-secondary)', marginTop: '1rem', maxWidth: '600px', margin: '1rem auto' }}>
        This portal was built to manage robust security requirements, showcasing object-oriented principles, secure authentication handling, and modern frontend design patterns.
      </p>
    </div>
  </PageWrapper>
)
