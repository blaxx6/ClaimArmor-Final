import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, money, shortDate } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';

export function ClaimsPage() {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(0);
  const limit = 200;

  const refresh = () => api(API_ENDPOINTS.claims.list({ limit, offset: page * limit })).then(setClaims).catch(e => setError(e.message));
  
  useEffect(() => { 
    refresh(); 
  }, [api, page]);

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
      await api(API_ENDPOINTS.claims.create(), { method: 'POST', body: JSON.stringify(payload) });
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
      const res = await api(isCsv ? API_ENDPOINTS.claims.uploadCsv() : API_ENDPOINTS.claims.uploadEdi(), {
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
        <p>Manage and investigate insurance claims</p>
      </div>

      {error && <div className="alert alert-error">{error}<button onClick={() => setError('')}>×</button></div>}
      {notice && <div className="alert alert-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {canIngest && (
        <div className="flex gap-3 mb-6">
          <button className="btn btn-primary" onClick={() => setCreating(!creating)}>+ Add Claim</button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>📄 Upload CSV<input type="file" accept=".csv" onChange={e => uploadFile(e, 'csv')} hidden /></label>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>📋 Upload EDI<input type="file" accept=".txt,.edi" onChange={e => uploadFile(e, 'edi')} hidden /></label>
        </div>
      )}

      {creating && (
        <div className="card mb-6">
          <h3>Create Claim</h3>
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
          <thead><tr><th>Claim ID</th><th>Member</th><th>Service Date</th><th>Amount</th><th>Payer</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {claims.map(c => (
              <tr key={c.claim_id}>
                <td><Link to={`/claims/${c.claim_id}`} style={{ fontWeight: 600 }}>{c.claim_id}</Link></td>
                <td>{c.member_name}</td>
                <td>{shortDate(c.service_date)}</td>
                <td>{money(c.amount)}</td>
                <td style={{ color: 'var(--ca-text-secondary)' }}>{c.submitted_payer}</td>
                <td><span className="status-badge status-info">{c.claim_type}</span></td>
                <td><Link to={`/claims/${c.claim_id}`} className="btn btn-sm btn-secondary">View</Link></td>
              </tr>
            ))}
            {claims.length === 0 && <tr><td colSpan={7} className="empty-state"><div className="icon">📋</div><p>No claims yet</p></td></tr>}
          </tbody>
        </table>
      </div>
      
      <div className="flex gap-2" style={{ marginTop: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Previous</button>
        <span style={{ fontSize: '14px', color: 'var(--ca-text-secondary)' }}>Page {page + 1} (Up to {limit} per page)</span>
        <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={claims.length < limit}>Next →</button>
      </div>
    </>
  );
}
