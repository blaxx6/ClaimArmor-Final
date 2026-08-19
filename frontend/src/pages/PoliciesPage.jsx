import React, { useState, useEffect } from 'react';
import { useAuth, shortDate } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';

export function PoliciesPage() {
  const { api } = useAuth();
  const [policies, setPolicies] = useState([]);

  useEffect(() => { 
    api(API_ENDPOINTS.policies.list()).then(setPolicies).catch(() => { }); 
  }, [api]);

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
