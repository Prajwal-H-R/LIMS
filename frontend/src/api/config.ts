// frontend/src/api/config.ts
import axios from "axios";

/**
 * Robust environment handling for API base URLs
 *
 * Rules:
 * - If VITE_API_BASE_URL is missing -> default to '/api'
 * - If it starts with '/'        -> treat it as a relative base (e.g. '/api') and DO NOT append '/api'
 * - Otherwise (http://...)       -> treat as backend host and append '/api' (if not already included)
 *
 * FULL_API_HOST is an absolute URL used for raw axios calls (token refresh) to avoid interceptor recursion.
 */

// read the env value (may be undefined)
const RAW = import.meta.env.VITE_API_BASE_URL as string | undefined;

// safe trim
const rawValue = (RAW ?? "").trim();

// Helper: remove trailing slash
const stripTrailing = (s: string) => (s.endsWith("/") ? s.slice(0, -1) : s);

// Compute API_BASE_URL (string used as axios baseURL) and FULL_API_HOST (absolute)
let API_BASE_URL: string;
let FULL_API_HOST: string;

if (!rawValue) {
  // No env provided — proxy-friendly relative path
  API_BASE_URL = "/api";
  // fallback absolute host uses current origin
  FULL_API_HOST = `${window.location.origin}/api`;
} else if (rawValue.startsWith("/")) {
  // Relative path already provided
  API_BASE_URL = stripTrailing(rawValue);
  FULL_API_HOST = `${window.location.origin}${API_BASE_URL}`;
} else {
  // Absolute host provided (http://...)
  const host = stripTrailing(rawValue);
  if (host.endsWith("/api")) {
    API_BASE_URL = host; // already includes /api
    FULL_API_HOST = host;
  } else {
    API_BASE_URL = `${host}/api`;
    FULL_API_HOST = `${host}/api`;
  }
}

// Optional: expose these for debugging or other modules
export const BACKEND_ROOT_URL = rawValue || ""; // raw env value (could be empty)
export const API_BASE = API_BASE_URL;           // use this if you prefer a different name elsewhere
export const API_BASE_URL_EXPORT = API_BASE_URL; // preserving similar name semantics
export const FULL_API_BASE = FULL_API_HOST;     // absolute host + /api

// Create axios instance used throughout the app (interceptors attached)
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/* =========================
   ENDPOINTS (unchanged)
   ========================= */

export const ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: `/users/login`,
    LOGOUT: `/users/logout`,
    ME: `/users/me`,
    ME_PROFILE: `/users/me/profile`,
    REFRESH: `/users/refresh`,
    FORGOT_PASSWORD: `/auth/forgot-password`,
    RESET_PASSWORD: `/auth/reset-password`,
    VERIFY_TOKEN: (token: string) => `/auth/verify-reset-token/${token}`,
  },

  // User management
  USERS: {
    ALL_USERS: `/users`,
    UPDATE: (id: number) => `/users/${id}`,
    UPDATE_STATUS: (id: number) => `/users/${id}/status`,
  },

  // Invitations
  INVITATIONS: {
    SEND: '/invitations/send',
    ACCEPT: '/invitations/accept',
    VALIDATE: '/invitations/validate',
  },

  // Staff
  STAFF: {
    SRFS: `/staff/srfs`,
    INWARDS: `/staff/inwards`,
    INWARDS_UPDATED: `/staff/inwards/updated`,
    INWARDS_EXPORTABLE: `/staff/inwards/exportable-list`,
    INWARD_EXPORT: (id: number) => `/staff/inwards/${id}/export`,
    INWARD_EXPORT_BATCH: `/staff/inwards/export-batch`,
    INWARD_EXPORT_BATCH_INWARD_ONLY: `/staff/inwards/export-batch-inward-only`,
    INWARD_SEND_REPORT: (id: number) => `/staff/inwards/${id}/send-report`,
    DRAFTS: `/staff/inwards/drafts`,
    DRAFT: `/staff/inwards/draft`,
    SUBMIT: `/staff/inwards/submit`,
    DRAFT_DELETE: (id: number) => `/staff/inwards/drafts/${id}`,
    INWARD_DETAILS: (id: number) => `/staff/inwards/${id}`,
  },

  // Portal
  PORTAL: {
    ACTIVATE: `/portal/activate-account`,
    INWARDS: `/portal/inwards`,
    INWARD_DETAILS: (id: number) => `/portal/inwards/${id}`,
    SUBMIT_REMARKS: (id: number) => `/portal/inwards/${id}/remarks`,
    DIRECT_ACCESS: (id: number, token?: string) =>
      `/portal/direct-fir/${id}${token ? `?token=${token}` : ''}`,
    CUSTOMERS_DROPDOWN: `/portal/customers/dropdown`,
    TRACK: `/portal/track`,
    CERTIFICATES: `/portal/certificates`,
    CERTIFICATE_VIEW: (id: number) => `/portal/certificates/${id}/view`,
    CERTIFICATE_DOWNLOAD_PDF: (id: number) => `/portal/certificates/${id}/download-pdf`,
    DEVIATIONS: `/portal/deviations`,
    DEVIATION_DETAIL: (id: number) => `/portal/deviations/${id}`,
  },

  STAFF_DEVIATIONS: {
    MANUAL: `/deviations/manual`,
    DETAIL: (id: number) => `/deviations/${id}`,
    UPDATE_ENGINEER_REMARKS: (id: number) => `/deviations/${id}/engineer-remarks`,
    CLOSE: (id: number) => `/deviations/${id}/close`,
    TERMINATE_JOB: (id: number) => `/deviations/${id}/terminate-job`,
    ATTACHMENTS: (id: number) => `/deviations/${id}/attachments`,
  },

  // Common
  CUSTOMERS: `/customers`,
  JOBS: `/jobs`,
  NOTIFICATIONS: `/notifications`,
  SRFS: `/srfs/`,
  GET_SRF: (id: number) => `/srfs/${id}`,

  // SRF Drafts
  SRF_DRAFTS: {
    SAVE: (id: number) => `/srfs/draft/${id}`,
    CREATE: `/srfs/draft`,
    RESTORE: (id: number) => `/srfs/draft/${id}/restore`,
    CLEAR: (id: number) => `/srfs/draft/${id}`,
  },
    HTW_ENVIRONMENT_CONFIG: {
    LIST: `/htw/environment-configs`,         // Plural to match router
    GET: (id: number) => `/htw/environment-configs/${id}`,
    ACTIVE: `/htw/environment-configs/active`,
    CREATE: `/htw/environment-configs`,
    DELETE: (id: number) => `/htw/environment-configs/${id}`,
  },

  // HTW Masters
  HTW_MASTER_STANDARDS: {
    LIST: `/htw-master-standards/`,
    GET: (id: number) => `/htw-master-standards/${id}`,
    CREATE: `/htw-master-standards/`,
    UPDATE: (id: number) => `/htw-master-standards/${id}`,
    UPDATE_STATUS: (id: number) => `/htw-master-standards/${id}/status`,
    DELETE: (id: number) => `/htw-master-standards/${id}`,
    EXPORT: `/htw-master-standards/export`,
    EXPORT_BATCH: `/htw-master-standards/export-batch`,
  },

  // HTW Jobs
  HTW_JOBS: {
    CREATE: "/htw-jobs/",
    UPDATE: "/htw-jobs",
    AUTO_SELECT_BASE: "/jobs"
  },

  // HTW Environment
  HTW_ENVIRONMENT: {
    BASE: (jobId: number) => `/staff/jobs/${jobId}/environment`,
    PRE_STATUS: (jobId: number) => `/staff/jobs/${jobId}/environment/pre-status`,
    POST_STATUS: (jobId: number) => `/staff/jobs/${jobId}/environment/post-status`,
  },

  // HTW Calculations (examples)
  HTW_REPEATABILITY: {
    CALCULATE: "/htw-calculations/repeatability/calculate",
    GET: (jobId: number) => `/htw-calculations/repeatability/${jobId}`,
    REFERENCES: "/htw-calculations/repeatability/references/list",
  },

  HTW_REPRODUCIBILITY: {
    CALCULATE: "/htw-calculations/reproducibility/calculate",
    GET: (jobId: number) => `/htw-calculations/reproducibility/${jobId}`,
  },

  HTW_CALCULATIONS: {
    OUTPUT_DRIVE: `/htw-calculations/output-drive`,
    OUTPUT_DRIVE_CALCULATE: `/htw-calculations/output-drive/calculate`,
    DRIVE_INTERFACE: `/htw-calculations/drive-interface`,
    DRIVE_INTERFACE_CALCULATE: `/htw-calculations/drive-interface/calculate`,
    LOADING_POINT: `/htw-calculations/loading-point`,
    LOADING_POINT_CALCULATE: `/htw-calculations/loading-point/calculate`,
  },

  HTW_MANUFACTURER_SPECS: {
    LIST: `/htw-manufacturer-specs/`,
    GET: (id: number) => `/htw-manufacturer-specs/${id}`,
    CREATE: `/htw-manufacturer-specs/`,
    UPDATE: (id: number) => `/htw-manufacturer-specs/${id}`,
    UPDATE_STATUS: (id: number) => `/htw-manufacturer-specs/${id}/status`,
    DELETE: (id: number) => `/htw-manufacturer-specs/${id}`,
  },

  HTW_PRESSURE_GAUGE_RESOLUTIONS: {
    LIST: `/htw-pressure-gauge-resolutions/`,
    UNITS: `/htw-pressure-gauge-resolutions/units`,
  },

  HTW_NOMENCLATURE_RANGES: {
    LIST: `/htw-nomenclature-ranges/`,
    GET: (id: number) => `/htw-nomenclature-ranges/${id}`,
    CREATE: `/htw-nomenclature-ranges/`,
    UPDATE: (id: number) => `/htw-nomenclature-ranges/${id}`,
    UPDATE_STATUS: (id: number) => `/htw-nomenclature-ranges/${id}/status`,
    DELETE: (id: number) => `/htw-nomenclature-ranges/${id}`,
    MATCH: `/htw-nomenclature-ranges/match`,
  },

  LAB_SCOPE: {
    LIST: `/lab-scope/`,
    GET: (id: number) => `/lab-scope/${id}`,
    CREATE: `/lab-scope/`,
    UPDATE: (id: number) => `/lab-scope/${id}`,
    DOCUMENT: (id: number) => `/lab-scope/${id}/document`,
    UPDATE_STATUS: (id: number) => `/lab-scope/${id}/status`,
    DELETE: (id: number) => `/lab-scope/${id}`,
    ACTIVE: `/lab-scope/active`,
  },

  CERTIFICATES: {
    LIST: `/certificates/`,
    SRF_GROUPS: `/certificates/srf-groups`,
    GET: (id: number) => `/certificates/${id}`,
    GENERATE: (jobId: number) => `/certificates/jobs/${jobId}/generate`,
    UPDATE: (id: number) => `/certificates/${id}`,
    SUBMIT: (id: number) => `/certificates/${id}/submit`,
    APPROVE: (id: number) => `/certificates/${id}/approve`,
    REWORK: (id: number) => `/certificates/${id}/rework`,
    RESUBMIT: (id: number) => `/certificates/${id}/resubmit`,
    ISSUE: (id: number) => `/certificates/${id}/issue`,
    PREVIEW: (id: number) => `/certificates/${id}/preview`,
    DOWNLOAD_PDF: (id: number) => `/certificates/${id}/download-pdf`,
    DOWNLOAD_BULK_PDF: `/certificates/download-bulk-pdf`,
    GENERATE_QR: (id: number) => `/certificates/${id}/qr/generate`,
    GENERATE_QR_BULK: `/certificates/qr/generate-bulk`,
    VIEW_BY_QR: (token: string) => `/certificates/qr/${token}`,
    VIEW_BY_QR_CERT: (id: number) => `/certificates/qr/certificate/${id}`,
    JOB_PREVIEW: (jobId: number) => `/certificates/jobs/${jobId}/preview-data`,
  },
} as const;

/* =========================
   INTERCEPTORS / TOKEN REFRESH
   ========================= */

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data instanceof FormData && config.headers) {
      delete (config.headers as Record<string, unknown>)["Content-Type"];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

type FailedQueueItem = {
  resolve: (token: string | null) => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let failedQueue: FailedQueueItem[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const handleUnauthorized = (error: any) => {
  const redirectRequired = error.response?.headers?.['x-redirect-required'];
  const inwardId = error.response?.headers?.['x-inward-id'];

  if (redirectRequired && inwardId) {
    localStorage.setItem('postLoginRedirect', `/portal/inwards/${inwardId}`);
  }

  window.dispatchEvent(new CustomEvent('auth-logout', {
    detail: { reason: 'token_expired' }
  }));

  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');

  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error.config as (typeof error.config) & { _retry?: boolean };

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      originalRequest.url !== ENDPOINTS.AUTH.LOGIN &&
      originalRequest.url !== ENDPOINTS.AUTH.REFRESH
    ) {
      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        handleUnauthorized(error);
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string | null) => {
              if (!token) {
                reject(error);
                return;
              }
              if (!originalRequest.headers) {
                originalRequest.headers = {};
              }
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return new Promise((resolve, reject) => {
        // IMPORTANT: use FULL_API_HOST (absolute) for raw axios request to avoid interceptor recursion
        axios.post(
          `${FULL_API_HOST}${ENDPOINTS.AUTH.REFRESH}`,
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        )
          .then((response) => {
            const { access_token, refresh_token } = response.data;

            localStorage.setItem('token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
            window.dispatchEvent(
              new CustomEvent('auth-token-refreshed', {
                detail: { accessToken: access_token, refreshToken: refresh_token },
              })
            );

            api.defaults.headers.common.Authorization = `Bearer ${access_token}`;

            processQueue(null, access_token);

            if (!originalRequest.headers) {
              originalRequest.headers = {};
            }
            originalRequest.headers.Authorization = `Bearer ${access_token}`;

            resolve(api(originalRequest));
          })
          .catch((refreshError) => {
            processQueue(refreshError, null);
            handleUnauthorized(error);
            reject(refreshError);
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }

    if (
      error.response?.status === 401 &&
      originalRequest?.url !== ENDPOINTS.AUTH.LOGIN &&
      originalRequest?.url !== ENDPOINTS.AUTH.REFRESH
    ) {
      handleUnauthorized(error);
    }

    return Promise.reject(error);
  }
);