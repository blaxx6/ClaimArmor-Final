import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

const AuthContext = createContext(null);

export function useAuth() { return useContext(AuthContext); }

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const pct = n => `${Math.round((n || 0) * 100)}%`;
const shortDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export { money, pct, shortDate };

export function AuthProvider({ children }) {
    const [token, setToken] = useState(localStorage.getItem('claimarmor_token') || '');
    const [refreshToken, setRefreshToken] = useState(localStorage.getItem('claimarmor_refresh') || '');
    const [user, setUser] = useState(null);
    const abortControllers = useRef(new Map());

    const api = useCallback(async (path, options = {}, key) => {
        // Cancel previous request with same key
        if (key && abortControllers.current.has(key)) {
            abortControllers.current.get(key).abort();
        }
        const controller = new AbortController();
        if (key) abortControllers.current.set(key, controller);

        const headers = { Authorization: `Bearer ${token}`, ...options.headers };
        if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

        try {
            const attemptRequest = async (currentToken) => {
                const headers = { Authorization: `Bearer ${currentToken}`, ...options.headers };
                if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
                const res = await fetch(path, {
                    cache: 'no-store',
                    ...options,
                    headers,
                    signal: controller.signal
                });
                return res;
            };

            let res = await attemptRequest(token);

            // If 401 and we have refresh token, try to refresh
            if (res.status === 401 && refreshToken) {
                try {
                    const refreshRes = await fetch('/api/v1/auth/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refresh_token: refreshToken }),
                    });
                    if (refreshRes.ok) {
                        const data = await refreshRes.json();
                        localStorage.setItem('claimarmor_token', data.access_token);
                        localStorage.setItem('claimarmor_refresh', data.refresh_token);
                        setToken(data.access_token);
                        setRefreshToken(data.refresh_token);

                        // Retry original request with new token
                        res = await attemptRequest(data.access_token);
                    } else {
                        logout();
                        throw new Error('Session expired');
                    }
                } catch {
                    logout();
                    throw new Error('Session expired');
                }
            }

            if (res.status === 204) return null;
            const body = await res.json();
            if (!res.ok) throw new Error(body.detail || 'Request failed');
            return body;
        } finally {
            if (key) abortControllers.current.delete(key);
        }
    }, [token, refreshToken]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortControllers.current.forEach(ctrl => ctrl.abort());
            abortControllers.current.clear();
        };
    }, []);

    const login = async (username, password) => {
        const res = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Login failed');
        localStorage.setItem('claimarmor_token', data.access_token);
        localStorage.setItem('claimarmor_refresh', data.refresh_token);
        setToken(data.access_token);
        setRefreshToken(data.refresh_token);
        setUser(data.user);
    };

    const logout = () => {
        localStorage.removeItem('claimarmor_token');
        localStorage.removeItem('claimarmor_refresh');
        setToken('');
        setRefreshToken('');
        setUser(null);
    };

    useEffect(() => {
        if (token && !user) {
            api('/api/v1/auth/me').then(setUser).catch(() => logout());
        }
    }, [token]);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, api, isAuthenticated: !!token && !!user }}>
            {children}
        </AuthContext.Provider>
    );
}