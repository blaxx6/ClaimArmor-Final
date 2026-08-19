import React, { useState, useEffect } from 'react';
import { useAuth, money } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';
import { MetricCard } from '../components/shared/SharedComponents';

export function OpsPage() {
  const { api } = useAuth();
  const [ops, setOps] = useState(null);

  useEffect(() => { 
    api(API_ENDPOINTS.ops.status()).then(setOps).catch(() => { }); 
  }, [api]);

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
