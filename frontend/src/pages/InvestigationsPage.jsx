import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, money, pct } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';

export function InvestigationsPage() {
  const { api } = useAuth();
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 200;

  const refresh = () => {
    api(API_ENDPOINTS.investigations.list({ limit, offset: page * limit })).then(setItems).catch(() => { });
    api(API_ENDPOINTS.analytics.metrics()).then(m => setTotalCount(m.claims_investigated)).catch(() => { });
  };

  useEffect(() => {
    refresh();
    window.addEventListener('review-updated', refresh);
    return () => window.removeEventListener('review-updated', refresh);
  }, [api, page]);

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
      
      <div className="flex gap-2" style={{ marginTop: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Previous</button>
        <span style={{ fontSize: '14px', color: 'var(--ca-text-secondary)' }}>Page {page + 1} (Up to {limit} per page)</span>
        <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={items.length < limit}>Next →</button>
      </div>
    </>
  );
}
