import React, { useState, useEffect } from 'react';
import { useAuth, pct, money } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';
import { MetricCard, Tabs } from '../components/shared/SharedComponents';

export function AnalyticsPage() {
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
    api(API_ENDPOINTS.analytics.metrics()).then(setMetrics).catch(() => { });
    api(API_ENDPOINTS.analytics.modelMetrics()).then(setModelMetrics).catch(() => { });
    api(API_ENDPOINTS.analytics.retrieval()).then(setRetrieval).catch(() => { });
    api(API_ENDPOINTS.analytics.roi(), { method: 'POST', body: JSON.stringify(roiForm) }).then(setRoi).catch(() => { });
  }, [api]); // Empty dep array for initial load only is fine, or adding `api` is safe

  const recalcRoi = () => {
    api(API_ENDPOINTS.analytics.roi(), { method: 'POST', body: JSON.stringify(roiForm) }).then(setRoi).catch(() => { });
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
