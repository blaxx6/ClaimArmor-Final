import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const form = new FormData(e.currentTarget);
        try {
            await login(form.get('username'), form.get('password'));
            navigate('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div style={{ fontSize: 36, marginBottom: 16 }}>🛡️</div>
                <h1>ClaimArmor AI</h1>
                <p>Pre-payment COB audit platform</p>
                {error && <div className="alert alert-error mb-4">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Username</label>
                        <input name="username" defaultValue="analyst" autoFocus required />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input name="password" type="password" defaultValue="Analyst123!" required />
                    </div>
                    <button className="btn btn-primary" disabled={loading} style={{ marginTop: 12 }}>
                        {loading ? <><span className="spinner" /> Signing in…</> : 'Sign In'}
                    </button>
                </form>
                <p style={{ marginTop: 20, fontSize: 12, color: 'var(--ca-text-muted)' }}>
                    Synthetic data environment · Demo credentials pre-filled
                </p>
            </div>
        </div>
    );
}