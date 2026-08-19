/**
 * Centralized API Endpoint Registry
 * Single source of truth for all backend API paths
 */

export const API_ENDPOINTS = {
    auth: {
        login: () => '/api/v1/auth/login',
        me: () => '/api/v1/auth/me',
        refresh: () => '/api/v1/auth/refresh',
    },
    claims: {
        list: (params = {}) => {
            const searchParams = new URLSearchParams();
            if (params.limit) searchParams.set('limit', params.limit);
            if (params.offset) searchParams.set('offset', params.offset);
            const query = searchParams.toString();
            return `/api/v1/claims${query ? `?${query}` : ''}`;
        },
        create: () => '/api/v1/claims',
        detail: (id) => `/api/v1/claims/${id}`,
        investigate: (id) => `/api/v1/claims/${id}/investigate`,
        investigateAsync: (id) => `/api/v1/claims/${id}/investigate-async`,
        investigateStream: (id) => `/api/v1/claims/${id}/investigate-stream`,
        replay: (id) => `/api/v1/claims/${id}/replay`,
        uploadCsv: () => '/api/v1/claims/upload-csv',
        uploadEdi: () => '/api/v1/claims/upload-edi',
    },
    investigations: {
        list: (params = {}) => {
            const searchParams = new URLSearchParams();
            if (params.limit) searchParams.set('limit', params.limit);
            if (params.offset) searchParams.set('offset', params.offset);
            const query = searchParams.toString();
            return `/api/v1/investigations${query ? `?${query}` : ''}`;
        },
        reviewQueue: (params = {}) => {
            const searchParams = new URLSearchParams();
            if (params.limit) searchParams.set('limit', params.limit);
            if (params.offset) searchParams.set('offset', params.offset);
            const query = searchParams.toString();
            return `/api/v1/review-queue${query ? `?${query}` : ''}`;
        },
        completedReviews: (params = {}) => {
            const searchParams = new URLSearchParams();
            if (params.limit) searchParams.set('limit', params.limit);
            if (params.offset) searchParams.set('offset', params.offset);
            const query = searchParams.toString();
            return `/api/v1/reviews/completed${query ? `?${query}` : ''}`;
        },
        review: (id) => `/api/v1/investigations/${id}/review`,
    },
    tasks: {
        status: (id) => `/api/v1/tasks/${id}`,
    },
    audit: {
        trail: (id) => `/api/v1/audit/${id}`,
        verify: (id) => `/api/v1/audit/${id}/verify`,
    },
    policies: {
        list: () => '/api/v1/policies',
    },
    analytics: {
        metrics: () => '/api/metrics',           // NOTE: no /v1 prefix
        modelMetrics: () => '/api/v1/model/metrics',
        evaluation: () => '/api/v1/evaluation',
        retrieval: () => '/api/v1/retrieval/metrics',
        roi: () => '/api/v1/business/roi',
    },
    ops: {
        status: () => '/api/v1/ops',
    },
    admin: {
        users: () => '/api/v1/admin/users',
        userDeactivate: (username) => `/api/v1/admin/users/${username}/deactivate`,
        llmUsage: () => '/api/v1/admin/llm-usage',
    },
    health: () => '/api/health',               // NOTE: no /v1 prefix
};

// Helper to build query strings
export function buildQuery(params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            searchParams.set(key, String(value));
        }
    });
    return searchParams.toString();
}