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

function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('claimarmor_token') || '');
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('claimarmor_refresh') || '');
  const [user, setUser] = useState(null);

  const api = useCallback(async (path, options = {}) => {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
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
      <div className="card card-glass login-card">
        <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
        <h1>ClaimArmor AI</h1>
        <p>Enterprise pre-payment COB audit platform</p>
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
          <button className="btn btn-primary" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? '⟳ Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="text-sm text-muted" style={{ marginTop: 16 }}>
          Synthetic data environment • Demo credentials pre-filled
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
        <div className="card card-glass">
          <h3>Claims Ingested</h3>
          <div className="value">{metrics.claims_ingested?.toLocaleString()}</div>
          <div className="subtitle">Total synthetic claims</div>
        </div>
        <div className="card card-glass">
          <h3>Investigated</h3>
          <div className="value">{metrics.claims_investigated?.toLocaleString()}</div>
          <div className="subtitle">Completed investigations</div>
        </div>
        <div className="card card-glass">
          <h3>Amount at Risk</h3>
          <div className="value" style={{ color: 'var(--ca-danger)' }}>
            {money(metrics.estimated_amount_at_risk)}
          </div>
          <div className="subtitle">Flagged for review</div>
        </div>
        <div className="card card-glass">
          <h3>Pending Reviews</h3>
          <div className="value" style={{ color: 'var(--ca-warning)' }}>
            {metrics.pending_reviews || 0}
          </div>
          <div className="subtitle">Awaiting human reviewer</div>
        </div>
      </div>

      <div className="grid-2 mb-6">
        <div className="card">
          <h3>Route Distribution</h3>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            {Object.entries(routes).map(([route, count]) => (
              <div key={route} style={{ flex: 1, minWidth: 120, textAlign: 'center' }}>
                <span className={`route-badge route-${route}`}>{route.replace('_', ' ')}</span>
                <div className="value" style={{ marginTop: 8 }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>System Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <div className="flex" style={{ justifyContent: 'space-between' }}>
              <span className="text-muted">Environment</span>
              <span className="route-badge route-CLEAR">{health?.environment || 'dev'}</span>
            </div>
            <div className="flex" style={{ justifyContent: 'space-between' }}>
              <span className="text-muted">Database</span>
              <span>{metrics.storage?.backend || 'sqlite'}</span>
            </div>
            <div className="flex" style={{ justifyContent: 'space-between' }}>
              <span className="text-muted">Model</span>
              <span>{metrics.model_evaluation ? '✅ Ready' : '⚠️ Not trained'}</span>
            </div>
            <div className="flex" style={{ justifyContent: 'space-between' }}>
              <span className="text-muted">Coverage Rate</span>
              <span>{pct(metrics.coverage_rate)}</span>
            </div>
            {metrics.llm_usage && (
              <div className="flex" style={{ justifyContent: 'space-between' }}>
                <span className="text-muted">LLM Calls</span>
                <span>{metrics.llm_usage.total_calls || 0}</span>
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
        <p>Manage and investigate synthetic claims</p>
      </div>

      {error && <div className="alert alert-error">{error}<button onClick={() => setError('')}>×</button></div>}
      {notice && <div className="alert alert-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {canIngest && (
        <div className="flex gap-4 mb-4">
          <button className="btn btn-primary" onClick={() => setCreating(!creating)}>+ Add Claim</button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>📄 Upload CSV<input type="file" accept=".csv" onChange={e => uploadFile(e, 'csv')} hidden /></label>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>📋 Upload EDI<input type="file" accept=".txt,.edi" onChange={e => uploadFile(e, 'edi')} hidden /></label>
        </div>
      )}

      {creating && (
        <div className="card mb-6">
          <h3>Create Synthetic Claim</h3>
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
          <thead><tr><th>Claim ID</th><th>Member</th><th>Service Date</th><th>Amount</th><th>Payer</th><th>Type</th><th>Actions</th></tr></thead>
          <tbody>
            {claims.map(c => (
              <tr key={c.claim_id}>
                <td><Link to={`/claims/${c.claim_id}`} style={{ fontWeight: 600 }}>{c.claim_id}</Link></td>
                <td>{c.member_name}</td>
                <td>{c.service_date}</td>
                <td>{money(c.amount)}</td>
                <td>{c.submitted_payer}</td>
                <td>{c.claim_type}</td>
                <td><Link to={`/claims/${c.claim_id}`} className="btn btn-sm btn-secondary">View</Link></td>
              </tr>
            ))}
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
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/v1/claims/${claimId}`).then(d => {
      setDetail(d);
      if (d.investigation) setResult(d.investigation);
    }).catch(e => setError(e.message));
  }, [claimId]);

  const investigate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/api/v1/claims/${claimId}/investigate`, { method: 'POST' });
      setResult(res);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  if (!detail) return <div className="skeleton" style={{ height: 200 }} />;
  const claim = detail.claim;

  return (
    <>
      <div className="page-header">
        <h1>{claimId}</h1>
        <p>{claim.member_name} · {money(claim.amount)} · {claim.service_date}</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="flex gap-4 mb-6">
        <button className="btn btn-primary" onClick={investigate} disabled={loading}>
          {loading ? '⟳ Investigating…' : '🔍 Run Investigation'}
        </button>
        <Link to={`/audit/${claimId}`} className="btn btn-secondary">📋 Audit Trail</Link>
      </div>

      {result && (
        <>
          <div className="stats-grid">
            <div className="card card-glass">
              <h3>Route</h3>
              <span className={`route-badge route-${result.route}`} style={{ fontSize: 14 }}>{result.route?.replace('_', ' ')}</span>
            </div>
            <div className="card card-glass">
              <h3>Confidence</h3>
              <div className="value">{pct(result.confidence)}</div>
            </div>
            <div className="card card-glass">
              <h3>Amount at Risk</h3>
              <div className="value" style={{ color: 'var(--ca-danger)' }}>{money(result.financial_impact?.amount_at_risk)}</div>
            </div>
            <div className="card card-glass">
              <h3>Primary Payer</h3>
              <div className="value" style={{ fontSize: 16 }}>{result.recommended_primary_payer || '—'}</div>
            </div>
          </div>

          <div className="card mb-6">
            <h3>AI Explanation</h3>
            <p style={{ marginTop: 8, lineHeight: 1.7 }}>{result.explanation}</p>
            {result.limitations?.length > 0 && (
              <div className="alert alert-warning mt-4" style={{ marginBottom: 0 }}>
                <div>⚠️ {result.limitations.join(' • ')}</div>
              </div>
            )}
          </div>

          <div className="grid-2 mb-6">
            <div className="card">
              <h3>Identity Match</h3>
              <div style={{ marginTop: 8 }}>
                <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="text-muted">Matched</span>
                  <span>{result.member_match?.member_name || '—'}</span>
                </div>
                <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="text-muted">Method</span>
                  <span>{result.member_match?.method}</span>
                </div>
                <div className="flex" style={{ justifyContent: 'space-between' }}>
                  <span className="text-muted">Confidence</span>
                  <span style={{ fontWeight: 700 }}>{pct(result.member_match?.confidence)}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Coverage Timeline</h3>
              <div className="timeline" style={{ marginTop: 8 }}>
                {result.coverage_timeline?.map(c => (
                  <div className="timeline-item" key={c.coverage_id}>
                    <div className={`dot ${c.active_on_service_date ? 'active' : 'inactive'}`} />
                    <div>
                      <div className="payer">{c.payer}</div>
                      <div className="kind">{c.kind}</div>
                    </div>
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
                  <div key={e.policy_id} style={{ padding: '8px 12px', background: 'var(--ca-bg)', borderRadius: 'var(--ca-radius-sm)', border: '1px solid var(--ca-border)' }}>
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
                  <div key={i} style={{ padding: '8px 12px', background: 'var(--ca-bg)', borderRadius: 'var(--ca-radius-sm)', border: '1px solid var(--ca-border)' }}>
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
                    <div className="step-detail">{typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)?.slice(0, 200)}</div>
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
   REVIEW QUEUE PAGE
   ═══════════════════════════════════════════════════════════════════════ */
function ReviewQueuePage() {
  const { api, user } = useAuth();
  const [queue, setQueue] = useState([]);

  useEffect(() => { api('/api/v1/review-queue').then(setQueue).catch(() => {}); }, []);

  return (
    <>
      <div className="page-header">
        <h1>Review Queue</h1>
        <p>{queue.length} claims awaiting human review</p>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>Claim ID</th><th>Route</th><th>Confidence</th><th>Amount at Risk</th><th>Primary Payer</th><th>Action</th></tr></thead>
          <tbody>
            {queue.map(item => (
              <tr key={item.claim_id}>
                <td><Link to={`/claims/${item.claim_id}`} style={{ fontWeight: 600 }}>{item.claim_id}</Link></td>
                <td><span className={`route-badge route-${item.route}`}>{item.route?.replace('_', ' ')}</span></td>
                <td>{pct(item.confidence)}</td>
                <td style={{ color: 'var(--ca-danger)' }}>{money(item.financial_impact?.amount_at_risk)}</td>
                <td>{item.recommended_primary_payer || '—'}</td>
                <td><Link to={`/claims/${item.claim_id}`} className="btn btn-sm btn-primary">Review</Link></td>
              </tr>
            ))}
            {queue.length === 0 && <tr><td colSpan={6} className="text-center text-muted" style={{ padding: 40 }}>✅ No claims pending review</td></tr>}
          </tbody>
        </table>
      </div>
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

  useEffect(() => {
    api(`/api/v1/audit/${claimId}`).then(setEvents).catch(() => {});
    api(`/api/v1/audit/${claimId}/verify`).then(setVerification).catch(() => {});
  }, [claimId]);

  return (
    <>
      <div className="page-header">
        <h1>Audit Trail — {claimId}</h1>
        <p>SHA-256 hash-linked tamper-evident chain</p>
      </div>

      {verification && (
        <div className={`alert ${verification.valid ? 'alert-success' : 'alert-error'} mb-6`}>
          {verification.valid ? '✅' : '❌'} Chain integrity: {verification.valid ? 'VERIFIED' : 'BROKEN'} — {verification.events_checked} events checked
        </div>
      )}

      <div className="trace-list">
        {events.map((evt, i) => (
          <div className="trace-step" key={i}>
            <div className="step-number">{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div className="step-name">{evt.event_type}</div>
              <div className="step-detail">{evt.created_at}</div>
              <div className="font-mono mt-4" style={{ fontSize: 10, color: 'var(--ca-text-muted)', wordBreak: 'break-all' }}>
                Hash: {evt.event_hash?.slice(0, 32)}…
              </div>
            </div>
          </div>
        ))}
      </div>
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
                <td className="text-sm">{p.section}</td>
                <td className="text-sm">{p.authority}</td>
                <td>{p.jurisdiction}</td>
                <td>{p.effective_date}</td>
                <td><span className={`route-badge ${p.status === 'ACTIVE' ? 'route-CLEAR' : 'route-UNDETERMINED'}`}>{p.status || 'ACTIVE'}</span></td>
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
  const [metrics, setMetrics] = useState(null);
  const [roi, setRoi] = useState(null);

  useEffect(() => {
    api('/api/v1/metrics').then(setMetrics).catch(() => {});
    api('/api/v1/business/roi', {
      method: 'POST',
      body: JSON.stringify({
        annual_claims: 100000, average_claim_amount: 2500, leakage_rate: 0.025,
        value_detection_rate: 0.837, review_rate: 0.25, review_cost: 35,
        false_positive_rate: 0.08, false_positive_cost: 75, annual_platform_cost: 750000,
      }),
    }).then(setRoi).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Analytics & ROI</h1>
        <p>Business impact simulation</p>
      </div>

      {metrics?.model_evaluation && (
        <div className="stats-grid mb-6">
          <div className="card"><h3>Model Accuracy</h3><div className="value">{pct(metrics.model_evaluation.accuracy)}</div></div>
          <div className="card"><h3>Precision</h3><div className="value">{pct(metrics.model_evaluation.precision)}</div></div>
          <div className="card"><h3>Recall</h3><div className="value">{pct(metrics.model_evaluation.recall)}</div></div>
          <div className="card"><h3>PR-AUC</h3><div className="value">{pct(metrics.model_evaluation.pr_auc)}</div></div>
        </div>
      )}

      {roi && (
        <div className="card mb-6">
          <h3>ROI Simulation (100K Annual Claims)</h3>
          <div className="grid-3" style={{ marginTop: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div className="text-muted text-sm">Prevented Leakage</div>
              <div className="value" style={{ color: 'var(--ca-success)', fontSize: 22 }}>{money(roi.estimated_prevented_leakage)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="text-muted text-sm">Net Benefit</div>
              <div className="value" style={{ color: 'var(--ca-primary-light)', fontSize: 22 }}>{money(roi.estimated_net_benefit)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="text-muted text-sm">ROI</div>
              <div className="value" style={{ color: 'var(--ca-accent)', fontSize: 22 }}>{roi.estimated_roi_percent}%</div>
            </div>
          </div>
          <div className="text-sm text-muted" style={{ marginTop: 12 }}>{roi.basis}</div>
        </div>
      )}

      {metrics?.llm_usage && (
        <div className="card">
          <h3>LLM Usage</h3>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <div><div className="text-muted text-sm">Total Calls</div><div className="value" style={{ fontSize: 22 }}>{metrics.llm_usage.total_calls}</div></div>
            <div><div className="text-muted text-sm">Input Tokens</div><div className="value" style={{ fontSize: 22 }}>{(metrics.llm_usage.total_input_tokens || 0).toLocaleString()}</div></div>
            <div><div className="text-muted text-sm">Estimated Cost</div><div className="value" style={{ fontSize: 22 }}>{money(metrics.llm_usage.total_cost_usd)}</div></div>
          </div>
        </div>
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
      <div className="page-header"><h1>Operations</h1><p>System health and readiness</p></div>
      <div className="card"><pre>{JSON.stringify(ops, null, 2)}</pre></div>
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
    api('/api/v1/review-queue').then(q => setReviewCount(q.length)).catch(() => {});
  }, [location.pathname]);

  const nav = [
    { path: '/', icon: '📊', label: 'Dashboard' },
    { path: '/claims', icon: '📋', label: 'Claims' },
    { path: '/review', icon: '👁️', label: 'Review Queue', badge: reviewCount || null },
    { path: '/policies', icon: '📜', label: 'Policies' },
    { path: '/analytics', icon: '📈', label: 'Analytics' },
  ];

  const adminNav = [
    { path: '/ops', icon: '⚙️', label: 'Operations' },
  ];

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-brand">
          <span>🛡️</span>
          <span>ClaimArmor AI</span>
          <span className="topbar-badge">Synthetic Data</span>
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
        {['AUDITOR', 'ADMIN'].includes(user?.role) && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Admin</div>
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
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/audit/:claimId" element={<AuditPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/ops" element={<OpsPage />} />
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
