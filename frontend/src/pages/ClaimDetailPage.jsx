import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth, money, pct, shortDate } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';
import { MetricCard } from '../components/shared/SharedComponents';

export function ClaimDetailPage() {
  const { api, user } = useAuth();
  const { claimId } = useParams();
  const [detail, setDetail] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [asyncTaskId, setAsyncTaskId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadDetail = () => {
    api(API_ENDPOINTS.claims.detail(claimId)).then(d => {
      setDetail(d);
      if (d.investigation) setResult(d.investigation);
    }).catch(e => setError(e.message));
  };

  useEffect(() => { loadDetail(); }, [claimId, api]);

  /* Sync investigation */
  const investigate = async () => {
    setLoading(true); setError('');
    try {
      const res = await api(API_ENDPOINTS.claims.investigate(claimId), { method: 'POST' });
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
      const res = await api(API_ENDPOINTS.claims.investigateAsync(claimId), { method: 'POST' });
      setAsyncTaskId(res.task_id);
      setNotice('Investigation queued — polling for results…');
      pollTask(res.task_id);
    } catch (err) { setError(err.message); setLoading(false); }
  };

  const pollTask = async (taskId) => {
    const poll = async () => {
      try {
        const status = await api(API_ENDPOINTS.tasks.status(taskId));
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
      const res = await api(API_ENDPOINTS.claims.replay(claimId), { method: 'POST' });
      setResult(res.investigation || res);
      setNotice('Replay completed');
      window.dispatchEvent(new Event('review-updated'));
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  if (!detail) return <div className="skeleton" style={{ height: 200 }} />;
  const claim = detail.claim;
  const canInvestigate = ['ANALYST', 'REVIEWER', 'ADMIN'].includes(user?.role);

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
