import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth, shortDate } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';
import { Modal } from '../components/shared/SharedComponents';

export function AuditPage() {
  const { api } = useAuth();
  const { claimId } = useParams();
  const [events, setEvents] = useState([]);
  const [verification, setVerification] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    api(API_ENDPOINTS.audit.trail(claimId)).then(setEvents).catch(() => { });
    api(API_ENDPOINTS.audit.verify(claimId)).then(setVerification).catch(() => { });
  }, [claimId, api]);

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
