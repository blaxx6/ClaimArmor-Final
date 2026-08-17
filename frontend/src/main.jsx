import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import './style.css';

/* ═══════════════════════════════════════════════════════════════════════
   API Client & Auth Context
   ═══════════════════════════════════════════════════════════════════════ */
const AuthContext = createContext(null);

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const pct = n => `${Math.round((n || 0) * 100)}%`;
const shortDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('claimarmor_token') || '');
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('claimarmor_refresh') || '');
  const [user, setUser] = useState(null);

  const api = useCallback(async (path, options = {}) => {
    const headers = { Authorization: `Bearer ${token}`, ...options.headers };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, { cache: 'no-store', ...options, headers });
    if (res.status === 204) return null;
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || 'Request failed');
    return body;
  }, [token]);

  const login = async (username, password) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Login failed');
    localStorage.setItem('claimarmor_token', data.access_token);
    localStorage.setItem('claimarmor_refresh', data.refresh_token);
    setToken(data.access_token);
    setRefreshToken(data.refresh_token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('claimarmor_token');
    localStorage.removeItem('claimarmor_refresh');
    setToken('');
    setRefreshToken('');
    setUser(null);
  };

  useEffect(() => {
    if (token && !user) {
      api('/api/v1/auth/me').then(setUser).catch(() => logout());
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, api, isAuthenticated: !!token && !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */
function MetricCard({ title, value, subtitle, color, delay = 0 }) {
  return (
    <div className="card card-glass" style={{ animationDelay: `${delay}s` }}>
      <h3>{title}</h3>
      <div className="value" style={color ? { color } : {}}>{value}</div>
      {subtitle && <div className="subtitle">{subtitle}</div>}
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function StatusDot({ ok, label }) {
  return (
    <span className="indicator">
      <span className={`status-dot ${ok ? 'green' : 'red'}`} />
      <span style={{ color: ok ? 'var(--ca-success)' : 'var(--ca-danger)' }}>{label || (ok ? 'Online' : 'Offline')}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      await login(form.get('username'), form.get('password'));
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ fontSize: 36, marginBottom: 16 }}>🛡️</div>
        <h1>ClaimArmor AI</h1>
        <p>Pre-payment COB audit platform</p>
        {error && <div className="alert alert-error mb-4">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input name="username" defaultValue="analyst" autoFocus required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input name="password" type="password" defaultValue="Analyst123!" required />
          </div>
          <button className="btn btn-primary" disabled={loading} style={{ marginTop: 12 }}>
            {loading ? <><span className="spinner" /> Signing in…</> : 'Sign In'}
          </button>
        </form>
        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--ca-text-muted)' }}>
          Synthetic data environment · Demo credentials pre-filled
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DASHBOARD PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function DashboardPage() {
  const { api } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    Promise.all([
      api('/api/v1/metrics').catch(() => null),
      api('/api/v1/health').catch(() => null),
    ]).then(([m, h]) => { setMetrics(m); setHealth(h); });
  }, []);

  if (!metrics) return <div className="skeleton" style={{ height: 400 }} />;

  const routes = metrics.route_counts || {};
  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Real-time operational overview</p>
      </div>

      <div className="stats-grid">
        <MetricCard title="Claims Ingested" value={metrics.claims_ingested?.toLocaleString()} subtitle="Total claims in system" delay={0.05} />
        <MetricCard title="Investigated" value={metrics.claims_investigated?.toLocaleString()} subtitle="Completed investigations" delay={0.1} />
        <MetricCard title="Amount at Risk" value={money(metrics.estimated_amount_at_risk)} subtitle="Flagged for review" color="var(--ca-danger)" delay={0.15} />
        <MetricCard title="Pending Reviews" value={metrics.pending_reviews || 0} subtitle="Awaiting human reviewer" color="var(--ca-warning)" delay={0.2} />
      </div>

      <div className="grid-2 mb-6">
        <div className="card">
          <h3>Route Distribution</h3>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            {Object.entries(routes).map(([route, count]) => (
              <div key={route} style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
                <span className={`route-badge route-${route}`}>{route.replace('_', ' ')}</span>
                <div className="value" style={{ marginTop: 8, fontSize: 24 }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>System Health</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
            <div className="status-row">
              <span className="label">Environment</span>
              <span className="status-badge status-info">{health?.environment || 'dev'}</span>
            </div>
            <div className="status-row">
              <span className="label">Database</span>
              <span style={{ color: 'var(--ca-text-secondary)', fontSize: 13 }}>{metrics.storage?.backend || 'sqlite'}</span>
            </div>
            <div className="status-row">
              <span className="label">ML Model</span>
              <StatusDot ok={!!metrics.model_evaluation} label={metrics.model_evaluation ? 'Ready' : 'Not trained'} />
            </div>
            <div className="status-row">
              <span className="label">Coverage Rate</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{pct(metrics.coverage_rate)}</span>
            </div>
            {metrics.llm_usage && (
              <div className="status-row">
                <span className="label">LLM Calls</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{metrics.llm_usage.total_calls || 0}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CLAIMS PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function ClaimsPage() {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = () => api('/api/v1/claims').then(setClaims).catch(e => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const canIngest = ['ANALYST', 'ADMIN'].includes(user?.role);

  const createClaim = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      claim_id: form.get('claim_id'),
      member_name: form.get('member_name'),
      member_dob: form.get('member_dob'),
      member_id: form.get('member_id') || null,
      service_date: form.get('service_date'),
      amount: Number(form.get('amount')),
      submitted_payer: form.get('submitted_payer'),
      claim_type: form.get('claim_type'),
      accident_related: form.get('accident_related') === 'true',
      diagnosis_group: form.get('diagnosis_group'),
    };
    try {
      await api('/api/v1/claims', { method: 'POST', body: JSON.stringify(payload) });
      await refresh();
      setCreating(false);
      setNotice(`Created ${payload.claim_id}`);
    } catch (err) { setError(err.message); }
  };

  const uploadFile = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const isCsv = type === 'csv';
    try {
      const res = await api(isCsv ? '/api/v1/claims/upload-csv' : '/api/v1/claims/upload-edi', {
        method: 'POST', body: JSON.stringify(isCsv ? { csv_text: text } : { edi_text: text }),
      });
      await refresh();
      setNotice(`${isCsv ? 'CSV' : 'EDI'} upload: ${res.created?.length || res.summary?.created || 0} claims created`);
    } catch (err) { setError(err.message); }
    e.target.value = '';
  };

  return (
    <>
      <div className="page-header">
        <h1>Claims</h1>
        <p>Manage and investigate insurance claims</p>
      </div>

      {error && <div className="alert alert-error">{error}<button onClick={() => setError('')}>×</button></div>}
      {notice && <div className="alert alert-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {canIngest && (
        <div className="flex gap-3 mb-6">
          <button className="btn btn-primary" onClick={() => setCreating(!creating)}>+ Add Claim</button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>📄 Upload CSV<input type="file" accept=".csv" onChange={e => uploadFile(e, 'csv')} hidden /></label>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>📋 Upload EDI<input type="file" accept=".txt,.edi" onChange={e => uploadFile(e, 'edi')} hidden /></label>
        </div>
      )}

      {creating && (
        <div className="card mb-6">
          <h3>Create Claim</h3>
          <form onSubmit={createClaim} className="form-grid" style={{ marginTop: 12 }}>
            <div className="form-group"><label>Claim ID</label><input name="claim_id" defaultValue={`CLM-NEW-${Date.now().toString().slice(-6)}`} required /></div>
            <div className="form-group"><label>Member Name</label><input name="member_name" defaultValue="Rohan Kapoor" required /></div>
            <div className="form-group"><label>Date of Birth</label><input name="member_dob" type="date" defaultValue="1988-11-03" required /></div>
            <div className="form-group"><label>Member ID</label><input name="member_id" defaultValue="MBR-1002" /></div>
            <div className="form-group"><label>Service Date</label><input name="service_date" type="date" defaultValue="2026-08-06" required /></div>
            <div className="form-group"><label>Amount</label><input name="amount" type="number" min="1" defaultValue="15000" required /></div>
            <div className="form-group"><label>Submitted Payer</label><input name="submitted_payer" defaultValue="EMPLOYER_PLAN" required /></div>
            <div className="form-group"><label>Claim Type</label><select name="claim_type"><option>MEDICAL</option><option>INPATIENT</option><option>TRAUMA</option></select></div>
            <div className="form-group"><label>Accident Related</label><select name="accident_related"><option value="false">No</option><option value="true">Yes</option></select></div>
            <div className="form-group"><label>Diagnosis Group</label><input name="diagnosis_group" defaultValue="GENERAL" /></div>
            <div className="form-actions" style={{ gridColumn: '1/-1' }}>
              <button className="btn btn-primary">Create Claim</button>
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead><tr><th>Claim ID</th><th>Member</th><th>Service Date</th><th>Amount</th><th>Payer</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {claims.map(c => (
              <tr key={c.claim_id}>
                <td><Link to={`/claims/${c.claim_id}`} style={{ fontWeight: 600 }}>{c.claim_id}</Link></td>
                <td>{c.member_name}</td>
                <td>{shortDate(c.service_date)}</td>
                <td>{money(c.amount)}</td>
                <td style={{ color: 'var(--ca-text-secondary)' }}>{c.submitted_payer}</td>
                <td><span className="status-badge status-info">{c.claim_type}</span></td>
                <td><Link to={`/claims/${c.claim_id}`} className="btn btn-sm btn-secondary">View</Link></td>
              </tr>
            ))}
            {claims.length === 0 && <tr><td colSpan={7} className="empty-state"><div className="icon">📋</div><p>No claims yet</p></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CLAIM DETAIL PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function ClaimDetailPage() {
  const { api, user } = useAuth();
  const { claimId } = useParams();
  const [detail, setDetail] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [asyncTaskId, setAsyncTaskId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadDetail = () => {
    api(`/api/v1/claims/${claimId}`).then(d => {
      setDetail(d);
      if (d.investigation) setResult(d.investigation);
    }).catch(e => setError(e.message));
  };

  useEffect(() => { loadDetail(); }, [claimId]);

  /* Sync investigation */
  const investigate = async () => {
    setLoading(true); setError('');
    try {
      const res = await api(`/api/v1/claims/${claimId}/investigate`, { method: 'POST' });
      setResult(res);
      setNotice('Investigation completed');
      window.dispatchEvent(new Event('review-updated'));
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  /* Async investigation with polling */
  const investigateAsync = async () => {
    setLoading(true); setError('');
    try {
      const res = await api(`/api/v1/claims/${claimId}/investigate-async`, { method: 'POST' });
      setAsyncTaskId(res.task_id);
      setNotice('Investigation queued — polling for results…');
      pollTask(res.task_id);
    } catch (err) { setError(err.message); setLoading(false); }
  };

  const pollTask = async (taskId) => {
    const poll = async () => {
      try {
        const status = await api(`/api/v1/tasks/${taskId}`);
        if (status.status === 'COMPLETE') {
          setResult(status.result);
          setAsyncTaskId(null);
          setLoading(false);
          setNotice('Async investigation completed');
          window.dispatchEvent(new Event('review-updated'));
        } else if (status.status === 'FAILED') {
          setError('Investigation failed');
          setAsyncTaskId(null);
          setLoading(false);
        } else {
          setTimeout(poll, 2000);
        }
      } catch { setTimeout(poll, 3000); }
    };
    poll();
  };

  /* Replay */
  const replay = async () => {
    setLoading(true); setError('');
    try {
      const res = await api(`/api/v1/claims/${claimId}/replay`, { method: 'POST' });
      setResult(res.investigation || res);
      setNotice('Replay completed');
      window.dispatchEvent(new Event('review-updated'));
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  if (!detail) return <div className="skeleton" style={{ height: 200 }} />;
  const claim = detail.claim;
  const canInvestigate = ['ANALYST', 'REVIEWER'].includes(user?.role);

  return (
    <>
      <div className="page-header">
        <h1>{claimId}</h1>
        <p>{claim.member_name} · {money(claim.amount)} · {shortDate(claim.service_date)}</p>
      </div>

      {error && <div className="alert alert-error">{error}<button onClick={() => setError('')}>×</button></div>}
      {notice && <div className="alert alert-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {canInvestigate && (
        <div className="flex gap-3 mb-6">
          <button className="btn btn-primary" onClick={investigate} disabled={loading}>
            {loading && !asyncTaskId ? <><span className="spinner" /> Investigating…</> : '🔍 Investigate'}
          </button>
          <button className="btn btn-secondary" onClick={investigateAsync} disabled={loading}>
            {asyncTaskId ? <><span className="spinner" /> Polling…</> : '⚡ Async Investigate'}
          </button>
          {result && <button className="btn btn-secondary" onClick={replay} disabled={loading}>🔄 Replay</button>}
          <Link to={`/audit/${claimId}`} className="btn btn-secondary">📋 Audit Trail</Link>
        </div>
      )}

      {result && (
        <>
          <div className="stats-grid">
            <MetricCard title="Route" value={<span className={`route-badge route-${result.route}`} style={{ fontSize: 13 }}>{result.route?.replace('_', ' ')}</span>} />
            <MetricCard title="Confidence" value={pct(result.confidence)} />
            <MetricCard title="Amount at Risk" value={money(result.financial_impact?.amount_at_risk)} color="var(--ca-danger)" />
            <MetricCard title="Primary Payer" value={result.recommended_primary_payer || '—'} />
          </div>

          <div className="card mb-6">
            <h3>AI Explanation</h3>
            <p style={{ marginTop: 8, lineHeight: 1.7, fontSize: 14, color: 'var(--ca-text-secondary)' }}>{result.explanation}</p>
            {result.limitations?.length > 0 && (
              <div className="alert alert-warning mt-4" style={{ marginBottom: 0 }}>
                ⚠️ {result.limitations.join(' · ')}
              </div>
            )}
          </div>

          <div className="grid-2 mb-6">
            <div className="card">
              <h3>Identity Match</h3>
              <div style={{ marginTop: 8 }}>
                {[
                  ['Matched', result.member_match?.member_name || '—'],
                  ['Method', result.member_match?.method],
                  ['Confidence', pct(result.member_match?.confidence)],
                ].map(([k, v]) => (
                  <div key={k} className="status-row"><span className="label">{k}</span><span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span></div>
                ))}
              </div>
            </div>
            <div className="card">
              <h3>Coverage Timeline</h3>
              <div className="timeline" style={{ marginTop: 8 }}>
                {result.coverage_timeline?.map(c => (
                  <div className="timeline-item" key={c.coverage_id}>
                    <div className={`dot ${c.active_on_service_date ? 'active' : 'inactive'}`} />
                    <div><div className="payer">{c.payer}</div><div className="kind">{c.kind}</div></div>
                    <div className="dates">{c.start} → {c.end || 'open'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid-2 mb-6">
            <div className="card">
              <h3>Cited Policy Evidence</h3>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.evidence?.map(e => (
                  <div key={e.policy_id} style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--ca-radius-sm)', border: '0.5px solid var(--ca-glass-border)' }}>
                    <a href={e.source_url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: 13 }}>{e.policy_id}</a>
                    <div className="text-sm text-muted">{e.section}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <h3>COB Rules</h3>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.rules?.map((r, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--ca-radius-sm)', border: '0.5px solid var(--ca-glass-border)' }}>
                    <span className={`route-badge route-${r.outcome === 'HOLD' ? 'HOLD' : r.outcome === 'CLEAR' ? 'CLEAR' : 'HUMAN_REVIEW'}`} style={{ marginRight: 8 }}>{r.outcome}</span>
                    <span className="text-sm">{r.rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h3>7-Agent Investigation Trace</h3>
            <div className="trace-list" style={{ marginTop: 12 }}>
              {result.agent_trace?.map((step, i) => (
                <div className="trace-step" key={i}>
                  <div className="step-number">{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div className="step-name">{step.agent?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                    <div className="step-detail">{typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)?.slice(0, 300)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   INVESTIGATIONS PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function InvestigationsPage() {
  const { api } = useAuth();
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  const refresh = () => {
    api('/api/v1/investigations').then(setItems).catch(() => {});
    api('/api/v1/metrics').then(m => setTotalCount(m.claims_investigated)).catch(() => {});
  };

  useEffect(() => { 
    refresh();
    window.addEventListener('review-updated', refresh);
    return () => window.removeEventListener('review-updated', refresh);
  }, []);

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>Investigations</h1>
          <p>{totalCount} completed investigations</p>
        </div>
        <button className="btn btn-secondary" onClick={refresh} style={{ marginBottom: 4 }}>Refresh</button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Claim ID</th><th>Route</th><th>Confidence</th><th>Amount at Risk</th><th>Primary Payer</th><th></th></tr></thead>
          <tbody>
            {items.map(item => (
              <tr key={item.claim_id}>
                <td><Link to={`/claims/${item.claim_id}`} style={{ fontWeight: 600 }}>{item.claim_id}</Link></td>
                <td><span className={`route-badge route-${item.route}`}>{item.route?.replace('_', ' ')}</span></td>
                <td>{pct(item.confidence)}</td>
                <td style={{ color: 'var(--ca-danger)' }}>{money(item.financial_impact?.amount_at_risk)}</td>
                <td>{item.recommended_primary_payer || '—'}</td>
                <td><Link to={`/claims/${item.claim_id}`} className="btn btn-sm btn-secondary">Details</Link></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="empty-state"><div className="icon">🔍</div><p>No investigations yet</p></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   REVIEW QUEUE PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function ReviewQueuePage() {
  const { api, user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState('pending');
  const [reviewModal, setReviewModal] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = () => {
    api('/api/v1/review-queue').then(setQueue).catch(() => {});
    api('/api/v1/reviews/completed').then(setHistory).catch(() => {});
    api('/api/v1/metrics').then(m => setPendingCount(m.pending_reviews)).catch(() => {});
  };
  useEffect(() => { 
    refresh();
    window.addEventListener('review-updated', refresh);
    return () => window.removeEventListener('review-updated', refresh);
  }, []);

  const canReview = ['REVIEWER', 'ADMIN'].includes(user?.role);

  const submitReview = async (decision) => {
    if (!reviewModal) return;
    setSubmitting(true);
    try {
      await api(`/api/v1/investigations/${reviewModal.claim_id}/review`, {
        method: 'POST',
        body: JSON.stringify({ 
          action: decision === 'DENY' ? 'REJECT' : decision, 
          reason: notes || `${decision} by ${user?.display_name}`,
          reviewer: user?.username || 'unknown'
        }),
      });
      setNotice(`${reviewModal.claim_id} — ${decision}`);
      setReviewModal(null);
      setNotes('');
      refresh();
      window.dispatchEvent(new Event('review-updated'));
    } catch (err) { setNotice(''); }
    setSubmitting(false);
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>Review Queue</h1>
          <p>{tab === 'pending' ? `${pendingCount} claims awaiting human review` : `${history.length} completed reviews`}</p>
        </div>
        <div className="flex gap-2" style={{ marginBottom: 4 }}>
          <button className={`btn ${tab === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('pending')}>Pending ({pendingCount})</button>
          <button className={`btn ${tab === 'completed' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('completed')}>History</button>
        </div>
      </div>

      {notice && <div className="alert alert-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      <div className="table-container">
        {tab === 'pending' ? (
          <table>
            <thead><tr><th>Claim ID</th><th>Route</th><th>Confidence</th><th>Amount at Risk</th><th>Primary Payer</th><th></th></tr></thead>
            <tbody>
              {queue.map(item => (
                <tr key={item.claim_id}>
                  <td><Link to={`/claims/${item.claim_id}`} style={{ fontWeight: 600 }}>{item.claim_id}</Link></td>
                  <td><span className={`route-badge route-${item.route}`}>{item.route?.replace('_', ' ')}</span></td>
                  <td>{pct(item.confidence)}</td>
                  <td style={{ color: 'var(--ca-danger)' }}>{money(item.financial_impact?.amount_at_risk)}</td>
                  <td>{item.recommended_primary_payer || '—'}</td>
                  <td>
                    <div className="flex gap-2">
                      <Link to={`/claims/${item.claim_id}`} className="btn btn-xs btn-secondary">View</Link>
                      {canReview && <button className="btn btn-xs btn-primary" onClick={() => setReviewModal(item)}>Review</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {queue.length === 0 && <tr><td colSpan={6} className="empty-state"><div className="icon">✅</div><p>No claims pending review</p></td></tr>}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>Claim ID</th><th>Reviewer</th><th>Decision</th><th>Amount at Risk</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {history.map(item => {
                // Ensure we handle missing action gracefully
                const action = item.review.action || 'UNKNOWN';
                const badgeClass = action === 'APPROVE' ? 'route-AUTO_PAY' : (action === 'REJECT' ? 'route-HOLD' : 'route-HUMAN_REVIEW');
                return (
                  <tr key={item.review.claim_id}>
                    <td><Link to={`/claims/${item.review.claim_id}`} style={{ fontWeight: 600 }}>{item.review.claim_id}</Link></td>
                    <td>{item.review.reviewer}</td>
                    <td><span className={`route-badge ${badgeClass}`}>{action.replace('_', ' ')}</span></td>
                    <td style={{ color: 'var(--ca-danger)' }}>{money(item.investigation.financial_impact?.amount_at_risk)}</td>
                    <td style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.review.reason}</td>
                    <td>
                      <div className="flex gap-2">
                        <Link to={`/audit/${item.review.claim_id}`} className="btn btn-xs btn-secondary">Audit</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {history.length === 0 && <tr><td colSpan={6} className="empty-state"><div className="icon">📋</div><p>No review history</p></td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {reviewModal && (
        <Modal title={`Review ${reviewModal.claim_id}`} subtitle={`Route: ${reviewModal.route} · Confidence: ${pct(reviewModal.confidence)}`} onClose={() => setReviewModal(null)}>
          <div className="form-group">
            <label>Review Notes</label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add review notes…" />
          </div>
          <div className="flex gap-3">
            <button className="btn btn-success" onClick={() => submitReview('APPROVE')} disabled={submitting}>
              {submitting ? <span className="spinner" /> : '✓'} Approve
            </button>
            <button className="btn btn-danger" onClick={() => submitReview('DENY')} disabled={submitting}>✗ Deny</button>
            <button className="btn btn-warning" onClick={() => submitReview('ESCALATE')} disabled={submitting}>↑ Escalate</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   AUDIT PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function AuditPage() {
  const { api } = useAuth();
  const { claimId } = useParams();
  const [events, setEvents] = useState([]);
  const [verification, setVerification] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    api(`/api/v1/audit/${claimId}`).then(setEvents).catch(() => {});
    api(`/api/v1/audit/${claimId}/verify`).then(setVerification).catch(() => {});
  }, [claimId]);

  return (
    <>
      <div className="page-header">
        <h1>Audit Trail</h1>
        <p>{claimId} · SHA-256 hash-linked tamper-evident chain</p>
      </div>

      {verification && (
        <div className={`alert ${verification.valid ? 'alert-success' : 'alert-error'} mb-6`}>
          {verification.valid ? '✅' : '❌'} Chain integrity: {verification.valid ? 'VERIFIED' : 'BROKEN'} — {verification.events_checked} events checked
        </div>
      )}

      <div className="trace-list">
        {events.map((evt, i) => (
          <div className="trace-step" key={i} onClick={() => setSelectedEvent(evt)} style={{ cursor: 'pointer' }}>
            <div className="step-number">{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div className="step-name">{evt.event_type}</div>
              <div className="step-detail">{shortDate(evt.created_at)}</div>
              <div className="font-mono mt-2" style={{ fontSize: 10, color: 'var(--ca-text-muted)', wordBreak: 'break-all' }}>
                {evt.event_hash?.slice(0, 48)}…
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedEvent && (
        <Modal 
          title={selectedEvent.event_type} 
          subtitle={shortDate(selectedEvent.created_at)} 
          onClose={() => setSelectedEvent(null)}
        >
          <div className="code-block" style={{ maxHeight: 400, overflow: 'auto', marginTop: 16 }}>
            <pre><code>{JSON.stringify(selectedEvent.payload, null, 2)}</code></pre>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   POLICIES PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function PoliciesPage() {
  const { api } = useAuth();
  const [policies, setPolicies] = useState([]);

  useEffect(() => { api('/api/v1/policies').then(setPolicies).catch(() => {}); }, []);

  return (
    <>
      <div className="page-header">
        <h1>Policy Corpus</h1>
        <p>{policies.length} regulatory documents indexed</p>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Policy ID</th><th>Title</th><th>Section</th><th>Authority</th><th>Jurisdiction</th><th>Effective</th><th>Status</th></tr></thead>
          <tbody>
            {policies.map(p => (
              <tr key={`${p.policy_id}:${p.version}`}>
                <td style={{ fontWeight: 600 }}>{p.policy_id}</td>
                <td>{p.title}</td>
                <td className="text-sm" style={{ color: 'var(--ca-text-secondary)' }}>{p.section}</td>
                <td className="text-sm" style={{ color: 'var(--ca-text-secondary)' }}>{p.authority}</td>
                <td>{p.jurisdiction}</td>
                <td>{shortDate(p.effective_date)}</td>
                <td><span className={`status-badge ${p.status === 'ACTIVE' ? 'status-ready' : 'status-warning'}`}>{p.status || 'ACTIVE'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ANALYTICS PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function AnalyticsPage() {
  const { api } = useAuth();
  const [activeTab, setActiveTab] = useState('model');
  const [metrics, setMetrics] = useState(null);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [retrieval, setRetrieval] = useState(null);
  const [roi, setRoi] = useState(null);
  const [roiForm, setRoiForm] = useState({
    annual_claims: 100000, average_claim_amount: 2500, leakage_rate: 0.025,
    value_detection_rate: 0.837, review_rate: 0.25, review_cost: 35,
    false_positive_rate: 0.08, false_positive_cost: 75, annual_platform_cost: 750000,
  });

  useEffect(() => {
    api('/api/v1/metrics').then(setMetrics).catch(() => {});
    api('/api/v1/model/metrics').then(setModelMetrics).catch(() => {});
    api('/api/v1/retrieval/metrics').then(setRetrieval).catch(() => {});
    api('/api/v1/business/roi', { method: 'POST', body: JSON.stringify(roiForm) }).then(setRoi).catch(() => {});
  }, []);

  const recalcRoi = () => {
    api('/api/v1/business/roi', { method: 'POST', body: JSON.stringify(roiForm) }).then(setRoi).catch(() => {});
  };

  const tabs = [
    { id: 'model', label: 'Model Performance' },
    { id: 'retrieval', label: 'Retrieval Quality' },
    { id: 'roi', label: 'ROI Simulator' },
    { id: 'llm', label: 'LLM Usage' },
  ];

  return (
    <>
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Model performance, retrieval quality, and business impact</p>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'model' && (
        <>
          {modelMetrics && modelMetrics.status === 'READY' ? (
            <div className="stats-grid">
              <MetricCard title="Accuracy" value={pct(modelMetrics.accuracy)} delay={0.05} />
              <MetricCard title="Precision" value={pct(modelMetrics.precision)} delay={0.1} />
              <MetricCard title="Recall" value={pct(modelMetrics.recall)} delay={0.15} />
              <MetricCard title="F1 Score" value={pct(modelMetrics.f1)} delay={0.2} />
              <MetricCard title="PR-AUC" value={pct(modelMetrics.pr_auc)} delay={0.25} />
              <MetricCard title="ROC-AUC" value={pct(modelMetrics.roc_auc)} delay={0.3} />
            </div>
          ) : (
            <div className="card">
              <div className="empty-state">
                <div className="icon">🤖</div>
                <p>Model not trained yet</p>
                <p className="text-sm text-muted" style={{ marginTop: 8 }}>Run: <code className="font-mono">python -m app.ml.train --regenerate --rows 3000</code></p>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'retrieval' && (
        <>
          {retrieval ? (
            <>
              <div className="stats-grid">
                <MetricCard title="MRR" value={retrieval.mrr?.toFixed(3) || '—'} subtitle="Mean Reciprocal Rank" delay={0.05} />
                <MetricCard title="Recall@5" value={retrieval.recall_at_5?.toFixed(3) || '—'} subtitle="Top-5 Recall" delay={0.1} />
                <MetricCard title="Index Size" value={retrieval.index_size || '—'} subtitle="Policy documents indexed" delay={0.15} />
              </div>
              {retrieval.per_query && (
                <div className="card">
                  <h3>Per-Query Breakdown</h3>
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {retrieval.per_query.map((q, i) => (
                      <div key={i} className="status-row">
                        <span className="label text-sm">{q.query?.slice(0, 60)}…</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>RR: {q.reciprocal_rank?.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="skeleton" style={{ height: 200 }} />
          )}
        </>
      )}

      {activeTab === 'roi' && (
        <>
          <div className="grid-2 mb-6">
            <div className="card">
              <h3>Assumptions</h3>
              <div className="form-grid" style={{ marginTop: 12 }}>
                {Object.entries(roiForm).map(([key, val]) => (
                  <div className="form-group" key={key}>
                    <label>{key.replace(/_/g, ' ')}</label>
                    <input type="number" value={val} step={key.includes('rate') ? 0.01 : 1}
                      onChange={e => setRoiForm(f => ({ ...f, [key]: Number(e.target.value) }))} />
                  </div>
                ))}
              </div>
              <button className="btn btn-primary mt-4" onClick={recalcRoi}>Recalculate</button>
            </div>
            <div className="card">
              <h3>Results</h3>
              {roi ? (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="text-center">
                    <div className="text-muted text-sm">Prevented Leakage</div>
                    <div className="value" style={{ color: 'var(--ca-success)', fontSize: 28 }}>{money(roi.estimated_prevented_leakage)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted text-sm">Net Benefit</div>
                    <div className="value" style={{ color: 'var(--ca-primary-light)', fontSize: 28 }}>{money(roi.estimated_net_benefit)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted text-sm">ROI</div>
                    <div className="value" style={{ color: 'var(--ca-accent-light)', fontSize: 36 }}>{roi.estimated_roi_percent}%</div>
                  </div>
                  <div className="text-sm text-muted text-center">{roi.basis}</div>
                </div>
              ) : (
                <div className="skeleton" style={{ height: 200 }} />
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'llm' && (
        <>
          {metrics?.llm_usage ? (
            <div className="stats-grid">
              <MetricCard title="Total Calls" value={metrics.llm_usage.total_calls || 0} delay={0.05} />
              <MetricCard title="Input Tokens" value={(metrics.llm_usage.total_input_tokens || 0).toLocaleString()} delay={0.1} />
              <MetricCard title="Output Tokens" value={(metrics.llm_usage.total_output_tokens || 0).toLocaleString()} delay={0.15} />
              <MetricCard title="Estimated Cost" value={money(metrics.llm_usage.total_cost_usd)} color="var(--ca-warning)" delay={0.2} />
            </div>
          ) : (
            <div className="card">
              <div className="empty-state"><div className="icon">💬</div><p>No LLM usage recorded yet</p></div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function AdminPage() {
  const { api, user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [llmUsage, setLlmUsage] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refreshUsers = () => api('/api/v1/admin/users').then(setUsers).catch(() => {});

  useEffect(() => {
    refreshUsers();
    api('/api/v1/admin/llm-usage').then(setLlmUsage).catch(() => {});
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api('/api/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
          role: form.get('role'),
          display_name: form.get('display_name'),
          tenant_id: form.get('tenant_id') || 'default',
        }),
      });
      setNotice(`User ${form.get('username')} created`);
      setShowCreate(false);
      refreshUsers();
    } catch (err) { setError(err.message); }
  };

  const deactivateUser = async (username) => {
    if (!confirm(`Deactivate ${username}?`)) return;
    try {
      await api(`/api/v1/admin/users/${username}/deactivate`, { method: 'POST' });
      setNotice(`${username} deactivated`);
      refreshUsers();
    } catch (err) { setError(err.message); }
  };

  const tabs = [
    { id: 'users', label: 'User Management' },
    { id: 'llm', label: 'LLM Usage & Billing' },
  ];

  return (
    <>
      <div className="page-header">
        <h1>Admin</h1>
        <p>User management, billing, and system configuration</p>
      </div>

      {notice && <div className="alert alert-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {error && <div className="alert alert-error">{error}<button onClick={() => setError('')}>×</button></div>}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'users' && (
        <>
          <div className="flex gap-3 mb-6">
            <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>+ Create User</button>
          </div>

          {showCreate && (
            <div className="card mb-6">
              <h3>Create New User</h3>
              <form onSubmit={createUser} className="form-grid" style={{ marginTop: 12 }}>
                <div className="form-group"><label>Username</label><input name="username" required /></div>
                <div className="form-group"><label>Display Name</label><input name="display_name" required /></div>
                <div className="form-group"><label>Password</label><input name="password" type="password" required /></div>
                <div className="form-group"><label>Role</label>
                  <select name="role"><option>ANALYST</option><option>REVIEWER</option><option>AUDITOR</option><option>ADMIN</option></select>
                </div>
                <div className="form-group"><label>Tenant ID</label><input name="tenant_id" defaultValue="default" /></div>
                <div className="form-actions" style={{ gridColumn: '1/-1' }}>
                  <button className="btn btn-primary">Create</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="table-container">
            <table>
              <thead><tr><th>Username</th><th>Display Name</th><th>Role</th><th>Tenant</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.username}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td>{u.display_name}</td>
                    <td><span className="status-badge status-info">{u.role}</span></td>
                    <td style={{ color: 'var(--ca-text-secondary)' }}>{u.tenant_id}</td>
                    <td><span className={`status-badge ${u.active !== false ? 'status-ready' : 'status-error'}`}>{u.active !== false ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      {u.username !== user?.username && u.active !== false && (
                        <button className="btn btn-xs btn-danger" onClick={() => deactivateUser(u.username)}>Deactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'llm' && (
        <>
          {llmUsage ? (
            <div className="stats-grid">
              <MetricCard title="Total Calls" value={llmUsage.total_calls || 0} delay={0.05} />
              <MetricCard title="Input Tokens" value={(llmUsage.total_input_tokens || 0).toLocaleString()} delay={0.1} />
              <MetricCard title="Output Tokens" value={(llmUsage.total_output_tokens || 0).toLocaleString()} delay={0.15} />
              <MetricCard title="Estimated Cost" value={money(llmUsage.total_cost_usd)} color="var(--ca-warning)" delay={0.2} />
            </div>
          ) : (
            <div className="card">
              <div className="empty-state"><div className="icon">📊</div><p>No LLM usage data available</p></div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   OPS PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function OpsPage() {
  const { api } = useAuth();
  const [ops, setOps] = useState(null);

  useEffect(() => { api('/api/v1/ops').then(setOps).catch(() => {}); }, []);

  if (!ops) return <div className="skeleton" style={{ height: 300 }} />;

  return (
    <>
      <div className="page-header">
        <h1>Operations</h1>
        <p>System health, readiness, and diagnostics</p>
      </div>

      <div className="stats-grid mb-6">
        <MetricCard title="Status" value={<span className="status-badge status-ready">{ops.status}</span>} delay={0.05} />
        <MetricCard title="Version" value={ops.version || '—'} delay={0.1} />
        <MetricCard title="Environment" value={<span className="status-badge status-info">{ops.environment}</span>} delay={0.15} />
        <MetricCard title="Data Classification" value={<span className="status-badge status-warning">{ops.data_classification}</span>} delay={0.2} />
      </div>

      <div className="grid-2 mb-6">
        <div className="card">
          <h3>Service Health</h3>
          <div style={{ marginTop: 8 }}>
            {[
              ['Database', ops.storage?.backend, true],
              ['ML Model', ops.model_ready ? 'Ready' : 'Not trained', ops.model_ready],
              ['Evaluation Suite', ops.evaluation_ready ? 'Ready' : 'Not run', ops.evaluation_ready],
              ['Policy Index', `${ops.policy_records || 0} docs`, ops.policy_records > 0],
              ['LLM Mode', ops.llm_mode || 'none', true],
            ].map(([label, value, ok]) => (
              <div className="status-row" key={label}>
                <span className="label">{label}</span>
                <div className="indicator">
                  <span className={`status-dot ${ok ? 'green' : 'yellow'}`} />
                  <span style={{ fontSize: 13 }}>{value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Retrieval Quality</h3>
          {ops.retrieval ? (
            <div style={{ marginTop: 8 }}>
              {[
                ['MRR', ops.retrieval.mrr?.toFixed(3)],
                ['Recall@5', ops.retrieval.recall_at_5?.toFixed(3)],
                ['Index Size', ops.retrieval.index_size],
              ].map(([label, value]) => (
                <div className="status-row" key={label}>
                  <span className="label">{label}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{value || '—'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted text-sm" style={{ marginTop: 12 }}>Retrieval data unavailable</div>
          )}
        </div>
      </div>

      {ops.llm_usage && (
        <div className="card">
          <h3>LLM Usage Summary</h3>
          <div className="stats-grid" style={{ marginTop: 12 }}>
            <div className="text-center">
              <div className="text-muted text-sm">Total Calls</div>
              <div className="value" style={{ fontSize: 24 }}>{ops.llm_usage.total_calls || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-muted text-sm">Input Tokens</div>
              <div className="value" style={{ fontSize: 24 }}>{(ops.llm_usage.total_input_tokens || 0).toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className="text-muted text-sm">Estimated Cost</div>
              <div className="value" style={{ fontSize: 24 }}>{money(ops.llm_usage.total_cost_usd)}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SIDEBAR & LAYOUT
   ═══════════════════════════════════════════════════════════════════════ */
function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [reviewCount, setReviewCount] = useState(0);
  const { api } = useAuth();

  useEffect(() => {
    const fetchQueueCount = () => {
      api('/api/v1/metrics').then(m => setReviewCount(m.pending_reviews)).catch(() => {});
    };
    fetchQueueCount();
    window.addEventListener('review-updated', fetchQueueCount);
    return () => window.removeEventListener('review-updated', fetchQueueCount);
  }, [location.pathname, api]);

  const nav = [
    { path: '/', icon: '📊', label: 'Dashboard' },
    { path: '/claims', icon: '📋', label: 'Claims' },
    { path: '/investigations', icon: '🔍', label: 'Investigations' },
    { path: '/review', icon: '👁️', label: 'Review Queue', badge: reviewCount || null },
    { path: '/policies', icon: '📜', label: 'Policies' },
    { path: '/analytics', icon: '📈', label: 'Analytics' },
  ];

  const adminNav = [
    { path: '/ops', icon: '⚙️', label: 'Operations' },
    { path: '/admin', icon: '👤', label: 'Admin' },
  ];

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-brand">
          <span>🛡️</span>
          <span>ClaimArmor AI</span>
          <span className="topbar-badge">Synthetic</span>
        </div>
        <div className="topbar-right">
          <div className="topbar-user">
            <div className="avatar">{user?.display_name?.[0] || '?'}</div>
            <div className="topbar-user-info">
              <div className="name">{user?.display_name}</div>
              <div className="role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={logout}>Sign out</button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-section-title">Navigation</div>
          {nav.map(item => (
            <Link to={item.path} key={item.path}
              className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}>
              <span className="icon">{item.icon}</span>
              {item.label}
              {item.badge && <span className="badge">{item.badge}</span>}
            </Link>
          ))}
        </div>
        <div className="sidebar-divider" />
        {['AUDITOR', 'ADMIN'].includes(user?.role) && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">System</div>
            {adminNav.map(item => (
              <Link to={item.path} key={item.path}
                className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}>
                <span className="icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/claims" element={<ClaimsPage />} />
          <Route path="/claims/:claimId" element={<ClaimDetailPage />} />
          <Route path="/investigations" element={<InvestigationsPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/audit/:claimId" element={<AuditPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/ops" element={<OpsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ROOT APP
   ═══════════════════════════════════════════════════════════════════════ */
function App() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AppLayout /> : <LoginPage />;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
