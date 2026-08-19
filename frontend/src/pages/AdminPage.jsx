import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, money } from '../context/AuthContext';
import { API_ENDPOINTS } from '../api/endpoints';
import { MetricCard, Tabs } from '../components/shared/SharedComponents';

export function AdminPage() {
  const { api, user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [llmUsage, setLlmUsage] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refreshUsers = useCallback(() => {
    api(API_ENDPOINTS.admin.users()).then(setUsers).catch(() => { });
  }, [api]);

  useEffect(() => {
    refreshUsers();
    api(API_ENDPOINTS.admin.llmUsage()).then(setLlmUsage).catch(() => { });
  }, [api, refreshUsers]);

  const createUser = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api(API_ENDPOINTS.admin.users(), {
        method: 'POST',
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
          role: form.get('role'),
          display_name: form.get('display_name'),
          tenant_id: form.get('tenant_id') || 'default',
        }),
      });
      setNotice(`User ${form.get('username')} created`);
      setShowCreate(false);
      refreshUsers();
    } catch (err) { setError(err.message); }
  };

  const deactivateUser = async (username) => {
    if (!window.confirm(`Deactivate ${username}?`)) return;
    try {
      await api(API_ENDPOINTS.admin.userDeactivate(username), { method: 'POST' });
      setNotice(`${username} deactivated`);
      refreshUsers();
    } catch (err) { setError(err.message); }
  };

  const tabs = [
    { id: 'users', label: 'User Management' },
    { id: 'llm', label: 'LLM Usage & Billing' },
  ];

  return (
    <>
      <div className="page-header">
        <h1>Admin</h1>
        <p>User management, billing, and system configuration</p>
      </div>

      {notice && <div className="alert alert-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {error && <div className="alert alert-error">{error}<button onClick={() => setError('')}>×</button></div>}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'users' && (
        <>
          <div className="flex gap-3 mb-6">
            <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>+ Create User</button>
          </div>

          {showCreate && (
            <div className="card mb-6">
              <h3>Create New User</h3>
              <form onSubmit={createUser} className="form-grid" style={{ marginTop: 12 }}>
                <div className="form-group"><label>Username</label><input name="username" required /></div>
                <div className="form-group"><label>Display Name</label><input name="display_name" required /></div>
                <div className="form-group"><label>Password</label><input name="password" type="password" required /></div>
                <div className="form-group"><label>Role</label>
                  <select name="role"><option>ANALYST</option><option>REVIEWER</option><option>AUDITOR</option><option>ADMIN</option></select>
                </div>
                <div className="form-group"><label>Tenant ID</label><input name="tenant_id" defaultValue="default" /></div>
                <div className="form-actions" style={{ gridColumn: '1/-1' }}>
                  <button className="btn btn-primary">Create</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="table-container">
            <table>
              <thead><tr><th>Username</th><th>Display Name</th><th>Role</th><th>Tenant</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.username}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td>{u.display_name}</td>
                    <td><span className="status-badge status-info">{u.role}</span></td>
                    <td style={{ color: 'var(--ca-text-secondary)' }}>{u.tenant_id}</td>
                    <td><span className={`status-badge ${u.active !== false ? 'status-ready' : 'status-error'}`}>{u.active !== false ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      {u.username !== user?.username && u.active !== false && (
                        <button className="btn btn-xs btn-danger" onClick={() => deactivateUser(u.username)}>Deactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'llm' && (
        <>
          {llmUsage ? (
            <div className="stats-grid">
              <MetricCard title="Total Calls" value={llmUsage.total_calls || 0} delay={0.05} />
              <MetricCard title="Input Tokens" value={(llmUsage.total_input_tokens || 0).toLocaleString()} delay={0.1} />
              <MetricCard title="Output Tokens" value={(llmUsage.total_output_tokens || 0).toLocaleString()} delay={0.15} />
              <MetricCard title="Estimated Cost" value={money(llmUsage.total_cost_usd)} color="var(--ca-warning)" delay={0.2} />
            </div>
          ) : (
            <div className="card">
              <div className="empty-state"><div className="icon">📊</div><p>No LLM usage data available</p></div>
            </div>
          )}
        </>
      )}
    </>
  );
}
