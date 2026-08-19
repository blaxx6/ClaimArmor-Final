import React, { useState, useEffect } from 'react';
import { useAuth, money, pct } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';
import { MetricCard, StatusDot } from '../components/shared/SharedComponents';

export function DashboardPage() {
  const { api } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    Promise.all([
      api(API_ENDPOINTS.analytics.metrics()).catch(() => null),
      api(API_ENDPOINTS.health()).catch(() => null),
    ]).then(([m, h]) => { setMetrics(m); setHealth(h); });
  }, [api]);

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
