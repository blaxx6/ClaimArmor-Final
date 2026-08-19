import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, money, pct } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';
import { Modal } from '../components/shared/SharedComponents';

export function ReviewQueuePage() {
  const { api, user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState('pending');
  const [reviewModal, setReviewModal] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const [queuePage, setQueuePage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const limit = 200;

  const refresh = useCallback(() => {
    api(API_ENDPOINTS.investigations.reviewQueue({ limit, offset: queuePage * limit })).then(setQueue).catch(() => { });
    api(API_ENDPOINTS.investigations.completedReviews({ limit, offset: historyPage * limit })).then(setHistory).catch(() => { });
    api(API_ENDPOINTS.analytics.metrics()).then(m => setPendingCount(m.pending_reviews)).catch(() => { });
  }, [api, queuePage, historyPage]);

  useEffect(() => {
    refresh();
    window.addEventListener('review-updated', refresh);
    return () => window.removeEventListener('review-updated', refresh);
  }, [refresh]);

  const canReview = ['REVIEWER', 'ADMIN'].includes(user?.role);

  const submitReview = async (decision) => {
    if (!reviewModal) return;
    setSubmitting(true);
    try {
      await api(API_ENDPOINTS.investigations.review(reviewModal.claim_id), {
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

      <div className="flex gap-2" style={{ marginTop: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
        <button 
          className="btn btn-secondary" 
          onClick={() => tab === 'pending' ? setQueuePage(p => Math.max(0, p - 1)) : setHistoryPage(p => Math.max(0, p - 1))} 
          disabled={(tab === 'pending' ? queuePage : historyPage) === 0}
        >
          ← Previous
        </button>
        <span style={{ fontSize: '14px', color: 'var(--ca-text-secondary)' }}>
          Page {(tab === 'pending' ? queuePage : historyPage) + 1} (Up to {limit} per page)
        </span>
        <button 
          className="btn btn-secondary" 
          onClick={() => tab === 'pending' ? setQueuePage(p => p + 1) : setHistoryPage(p => p + 1)} 
          disabled={(tab === 'pending' ? queue.length : history.length) < limit}
        >
          Next →
        </button>
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
