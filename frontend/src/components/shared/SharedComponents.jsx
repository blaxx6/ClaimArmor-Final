import React from 'react';
import { money, pct, shortDate } from '../../context/AuthContext';

/* ═══════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

export function MetricCard({ title, value, subtitle, color, delay = 0 }) {
    return (
        <div className="card card-glass" style={{ animationDelay: `${delay}s` }}>
            <h3>{title}</h3>
            <div className="value" style={color ? { color } : {}}>{value}</div>
            {subtitle && <div className="subtitle">{subtitle}</div>}
        </div>
    );
}

export function Modal({ title, subtitle, children, onClose }) {
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

export function Tabs({ tabs, active, onChange }) {
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

export function StatusDot({ ok, label }) {
    return (
        <span className="indicator">
            <span className={`status-dot ${ok ? 'green' : 'red'}`} />
            <span style={{ color: ok ? 'var(--ca-success)' : 'var(--ca-danger)' }}>{label || (ok ? 'Online' : 'Offline')}</span>
        </span>
    );
}

export function Skeleton({ height = 200 }) {
    return (
        <div className="skeleton" style={{ height }} />
    );
}

export function Spinner({ size = 18 }) {
    return (
        <span className="spinner" style={{ width: size, height: size }} />
    );
}

export function EmptyState({ icon, message }) {
    return (
        <div className="empty-state">
            <div className="icon">{icon}</div>
            <p>{message}</p>
        </div>
    );
}

export function RouteBadge({ route }) {
    return (
        <span className={`route-badge route-${route}`}>{route?.replace('_', ' ')}</span>
    );
}

export function StatusBadge({ status, label }) {
    const className = `status-badge ${status === 'ACTIVE' || status === 'READY' ? 'status-ready' :
        status === 'WARNING' ? 'status-warning' :
            status === 'ERROR' ? 'status-error' : 'status-info'}`;
    return (
        <span className={className}>{label || status}</span>
    );
}

export function CodeBlock({ children, maxHeight = 400 }) {
    return (
        <div className="code-block" style={{ maxHeight, overflow: 'auto', marginTop: 16 }}>
            <pre><code>{children}</code></pre>
        </div>
    );
}

export function PageHeader({ title, subtitle, action }) {
    return (
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flexEnd' }}>
            <div>
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
            </div>
            {action}
        </div>
    );
}

export function Alert({ type = 'info', children, onClose }) {
    const className = `alert alert-${type}`;
    return (
        <div className={className}>
            {children}
            {onClose && <button onClick={onClose}>×</button>}
        </div>
    );
}

export function FormGroup({ label, children, error }) {
    return (
        <div className="form-group">
            <label>{label}</label>
            {children}
            {error && <div className="form-error">{error}</div>}
        </div>
    );
}

export function FormActions({ children }) {
    return (
        <div className="form-actions" style={{ gridColumn: '1/-1' }}>
            {children}
        </div>
    );
}

export function TraceList({ steps }) {
    return (
        <div className="trace-list" style={{ marginTop: 12 }}>
            {steps?.map((step, i) => (
                <div className="trace-step" key={i}>
                    <div className="step-number">{i + 1}</div>
                    <div style={{ flex: 1 }}>
                        <div className="step-name">{step.agent?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                        <div className="step-detail">{typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)?.slice(0, 300)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function CoverageTimeline({ timeline }) {
    return (
        <div className="timeline" style={{ marginTop: 8 }}>
            {timeline?.map(c => (
                <div className="timeline-item" key={c.coverage_id}>
                    <div className={`dot ${c.active_on_service_date ? 'active' : 'inactive'}`} />
                    <div><div className="payer">{c.payer}</div><div className="kind">{c.kind}</div></div>
                    <div className="dates">{c.start} → {c.end || 'open'}</div>
                </div>
            ))}
        </div>
    );
}

export function EvidenceList({ evidence }) {
    return (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {evidence?.map(e => (
                <div key={e.policy_id} style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--ca-radius-sm)', border: '0.5px solid var(--ca-glass-border)' }}>
                    <a href={e.source_url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: 13 }}>{e.policy_id}</a>
                    <div className="text-sm text-muted">{e.section}</div>
                </div>
            ))}
        </div>
    );
}

export function RulesList({ rules }) {
    return (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules?.map((r, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--ca-radius-sm)', border: '0.5px solid var(--ca-glass-border)' }}>
                    <span className={`route-badge route-${r.outcome === 'HOLD' ? 'HOLD' : r.outcome === 'CLEAR' ? 'CLEAR' : 'HUMAN_REVIEW'}`} style={{ marginRight: 8 }}>{r.outcome}</span>
                    <span className="text-sm">{r.rule}</span>
                </div>
            ))}
        </div>
    );
}