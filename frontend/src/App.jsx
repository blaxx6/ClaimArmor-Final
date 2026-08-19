import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { API_ENDPOINTS } from './api/endpoints';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClaimsPage } from './pages/ClaimsPage';
import { ClaimDetailPage } from './pages/ClaimDetailPage';
import { InvestigationsPage } from './pages/InvestigationsPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { AuditPage } from './pages/AuditPage';
import { PoliciesPage } from './pages/PoliciesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AdminPage } from './pages/AdminPage';
import { OpsPage } from './pages/OpsPage';

/* ═══════════════════════════════════════════════════════════════════════
   SIDEBAR & LAYOUT
   ═══════════════════════════════════════════════════════════════════════ */
function AppLayout() {
  const { user, logout, api } = useAuth();
  const location = useLocation();
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    const fetchQueueCount = () => {
      api(API_ENDPOINTS.analytics.metrics()).then(m => setReviewCount(m.pending_reviews)).catch(() => { });
    };
    fetchQueueCount();
    window.addEventListener('review-updated', fetchQueueCount);
    return () => window.removeEventListener('review-updated', fetchQueueCount);
  }, [location.pathname, api]);

  const nav = [
    { path: '/', icon: '📊', label: 'Dashboard' },
    { path: '/claims', icon: '📋', label: 'Claims' },
    { path: '/investigations', icon: '🔍', label: 'Investigations' },
    { path: '/review', icon: '👁️', label: 'Review Queue', badge: reviewCount || null },
    { path: '/policies', icon: '📜', label: 'Policies' },
    { path: '/analytics', icon: '📈', label: 'Analytics' },
  ];

  const adminNav = [
    { path: '/ops', icon: '⚙️', label: 'Operations' },
    { path: '/admin', icon: '👤', label: 'Admin' },
  ];

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-brand">
          <span>🛡️</span>
          <span>ClaimArmor AI</span>
          <span className="topbar-badge">Synthetic</span>
        </div>
        <div className="topbar-right">
          <div className="topbar-user">
            <div className="avatar">{user?.display_name?.[0] || '?'}</div>
            <div className="topbar-user-info">
              <div className="name">{user?.display_name}</div>
              <div className="role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={logout}>Sign out</button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-section-title">Navigation</div>
          {nav.map(item => (
            <Link to={item.path} key={item.path}
              className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}>
              <span className="icon">{item.icon}</span>
              {item.label}
              {item.badge && <span className="badge">{item.badge}</span>}
            </Link>
          ))}
        </div>
        <div className="sidebar-divider" />
        {['AUDITOR', 'ADMIN'].includes(user?.role) && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">System</div>
            {adminNav.map(item => (
              <Link to={item.path} key={item.path}
                className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}>
                <span className="icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/claims" element={<ClaimsPage />} />
          <Route path="/claims/:claimId" element={<ClaimDetailPage />} />
          <Route path="/investigations" element={<InvestigationsPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/audit/:claimId" element={<AuditPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/ops" element={<OpsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ERROR BOUNDARY
   ═══════════════════════════════════════════════════════════════════════ */
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ textAlign: 'center', padding: 48, maxWidth: 500, margin: '40px auto' }}>
          <h2 style={{ marginBottom: 16 }}>Something went wrong</h2>
          <p className="text-muted" style={{ marginBottom: 24 }}>{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   ROOT APP
   ═══════════════════════════════════════════════════════════════════════ */
export function App() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? (
    <ErrorBoundary>
      <AppLayout />
    </ErrorBoundary>
  ) : (
    <LoginPage />
  );
}
