// frontend/src/api/config.ts
import axios from "axios";

/**
 * Robust environment handling for API base URLs
 *
 * Rules:
 * - If VITE_API_BASE_URL is missing -> default to '/api'
 * - If it starts with '/'          -> treat as relative base (e.g. '/api') – do NOT append '/api'
 * - Otherwise (http://...)         -> treat as backend host and append '/api' (if not already present)
 *
 * FULL_API_HOST is an absolute URL used for raw axios calls (token refresh)
 * to avoid interceptor recursion.
 */

// ------------------------------------------------------------------ //
//  BASE URL RESOLUTION                                                 //
// ------------------------------------------------------------------ //

const RAW = import.meta.env.VITE_API_BASE_URL as string | undefined;
const rawValue = (RAW ?? "").trim();

const stripTrailing = (s: string): string =>
  s.endsWith("/") ? s.slice(0, -1) : s;

let API_BASE_URL: string;
let FULL_API_HOST: string;

if (!rawValue) {
  // No env – proxy-friendly relative path
  API_BASE_URL = "/api";
  FULL_API_HOST = `${window.location.origin}/api`;
} else if (rawValue.startsWith("/")) {
  // Relative path supplied
  API_BASE_URL = stripTrailing(rawValue);
  FULL_API_HOST = `${window.location.origin}${API_BASE_URL}`;
} else {
  // Absolute host supplied (http://... or https://...)
  const host = stripTrailing(rawValue);
  API_BASE_URL = host.endsWith("/api") ? host : `${host}/api`;
  FULL_API_HOST = API_BASE_URL;
}

// Named exports for other modules that need the resolved URLs
export const BACKEND_ROOT_URL    = rawValue;        // raw env value (may be empty)
export const API_BASE            = API_BASE_URL;    // resolved baseURL
export const API_BASE_URL_EXPORT = API_BASE_URL;    // alias for legacy imports
export const FULL_API_BASE       = FULL_API_HOST;   // absolute host + /api

// ------------------------------------------------------------------ //
//  AXIOS INSTANCE                                                      //
// ------------------------------------------------------------------ //

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ================================================================== //
//  ENDPOINTS                                                           //
// ================================================================== //

export const ENDPOINTS = {
  // ── Authentication ──────────────────────────────────────────────── //
  AUTH: {
    LOGIN:          `/users/login`,
    LOGOUT:         `/users/logout`,
    ME:             `/users/me`,
    ME_PROFILE:     `/users/me/profile`,
    REFRESH:        `/users/refresh`,
    FORGOT_PASSWORD:`/auth/forgot-password`,
    RESET_PASSWORD: `/auth/reset-password`,
    VERIFY_TOKEN:   (token: string) => `/auth/verify-reset-token/${token}`,
  },

  // ── User management ─────────────────────────────────────────────── //
  USERS: {
    ALL_USERS:     `/users`,
    UPDATE:        (id: number) => `/users/${id}`,
    UPDATE_STATUS: (id: number) => `/users/${id}/status`,
  },

  // ── Invitations ─────────────────────────────────────────────────── //
  INVITATIONS: {
    SEND:     `/invitations/send`,
    ACCEPT:   `/invitations/accept`,
    VALIDATE: `/invitations/validate`,
  },

  // ── Staff ───────────────────────────────────────────────────────── //
  STAFF: {
    SRFS:                        `/staff/srfs`,
    INWARDS:                     `/staff/inwards`,
    INWARDS_UPDATED:             `/staff/inwards/updated`,
    INWARDS_EXPORTABLE:          `/staff/inwards/exportable-list`,
    INWARD_EXPORT:               (id: number) => `/staff/inwards/${id}/export`,
    INWARD_EXPORT_BATCH:         `/staff/inwards/export-batch`,
    INWARD_EXPORT_BATCH_INWARD_ONLY: `/staff/inwards/export-batch-inward-only`,
    INWARD_SEND_REPORT:          (id: number) => `/staff/inwards/${id}/send-report`,
    DRAFTS:                      `/staff/inwards/drafts`,
    DRAFT:                       `/staff/inwards/draft`,
    SUBMIT:                      `/staff/inwards/submit`,
    DRAFT_DELETE:                (id: number) => `/staff/inwards/drafts/${id}`,
    INWARD_DETAILS:              (id: number) => `/staff/inwards/${id}`,
  },

  // ── Customer Portal ─────────────────────────────────────────────── //
  PORTAL: {
    // Account
    ACTIVATE:             `/portal/activate-account`,

    // FIR (First Inspection Report)
    FIRS_FOR_REVIEW:      `/portal/firs-for-review`,
    FIR_DETAIL:           (id: number) => `/portal/firs/${id}`,
    FIR_STATUS:           (id: number) => `/portal/firs/${id}/status`,
    FIR_REMARKS:          (id: number) => `/portal/firs/${id}/remarks`,

    // Direct (unauthenticated) FIR access
    DIRECT_FIR:           (id: number, token?: string) =>
                            `/portal/direct-fir/${id}${token ? `?token=${token}` : ""}`,

    // SRFs
    SRFS:                 `/portal/srfs`,
    SRF_STATUS:           (id: number) => `/portal/srfs/${id}/status`,

    // Deviations
    DEVIATIONS:           `/portal/deviations`,
    DEVIATION_DETAIL:     (id: number) => `/portal/deviations/${id}`,

    // Tracking  ← used by TrackStatusPage
    TRACK:                `/portal/track`,

    // Certificates
    CERTIFICATES:         `/portal/certificates`,
    CERTIFICATE_VIEW:     (id: number) => `/portal/certificates/${id}/view`,
    CERTIFICATE_DOWNLOAD_PDF: (id: number) =>
                            `/portal/certificates/${id}/download-pdf`,

    // Customers dropdown (used in inward creation forms)
    CUSTOMERS_DROPDOWN:   `/portal/customers/dropdown`,

    // Legacy aliases kept for backward-compat with existing pages
    /** @deprecated Use FIR_DETAIL instead */
    INWARD_DETAILS:       (id: number) => `/portal/firs/${id}`,
    /** @deprecated Use FIR_REMARKS instead */
    SUBMIT_REMARKS:       (id: number) => `/portal/firs/${id}/remarks`,
    /** @deprecated Use DIRECT_FIR instead */
    DIRECT_ACCESS:        (id: number, token?: string) =>
                            `/portal/direct-fir/${id}${token ? `?token=${token}` : ""}`,
  },

  // ── Staff Deviations ────────────────────────────────────────────── //
  STAFF_DEVIATIONS: {
    MANUAL:                  `/deviations/manual`,
    DETAIL:                  (id: number) => `/deviations/${id}`,
    UPDATE_ENGINEER_REMARKS: (id: number) => `/deviations/${id}/engineer-remarks`,
    CLOSE:                   (id: number) => `/deviations/${id}/close`,
    TERMINATE_JOB:           (id: number) => `/deviations/${id}/terminate-job`,
    ATTACHMENTS:             (id: number) => `/deviations/${id}/attachments`,
  },

  // ── Customers ───────────────────────────────────────────────────── //
  CUSTOMERS: `/customers`,

  // ── Jobs ────────────────────────────────────────────────────────── //
  JOBS: `/jobs`,

  // ── Notifications ───────────────────────────────────────────────── //
  NOTIFICATIONS: `/notifications`,

  // ── SRFs ────────────────────────────────────────────────────────── //
  SRFS:    `/srfs/`,
  GET_SRF: (id: number) => `/srfs/${id}`,

  SRF_DRAFTS: {
    SAVE:    (id: number) => `/srfs/draft/${id}`,
    CREATE:  `/srfs/draft`,
    RESTORE: (id: number) => `/srfs/draft/${id}/restore`,
    CLEAR:   (id: number) => `/srfs/draft/${id}`,
  },

  // ── HTW Environment Config ──────────────────────────────────────── //
  HTW_ENVIRONMENT_CONFIG: {
    LIST:   `/htw/environment-configs`,
    GET:    (id: number) => `/htw/environment-configs/${id}`,
    ACTIVE: `/htw/environment-configs/active`,
    CREATE: `/htw/environment-configs`,
    DELETE: (id: number) => `/htw/environment-configs/${id}`,
  },

  // ── HTW Master Standards ────────────────────────────────────────── //
  HTW_MASTER_STANDARDS: {
    LIST:          `/htw-master-standards/`,
    GET:           (id: number) => `/htw-master-standards/${id}`,
    CREATE:        `/htw-master-standards/`,
    UPDATE:        (id: number) => `/htw-master-standards/${id}`,
    UPDATE_STATUS: (id: number) => `/htw-master-standards/${id}/status`,
    DELETE:        (id: number) => `/htw-master-standards/${id}`,
    EXPORT:        `/htw-master-standards/export`,
    EXPORT_BATCH:  `/htw-master-standards/export-batch`,
  },

  // ── HTW Jobs ────────────────────────────────────────────────────── //
  HTW_JOBS: {
    LIST:            `/htw-jobs/`,
    CREATE:          `/htw-jobs/`,
    UPDATE:          (jobId: number) => `/htw-jobs/${jobId}`,
    FINISH:          (jobId: number) => `/htw-jobs/${jobId}/finish`,
    AUTO_SELECT_BASE:`/jobs`,
  },

  // ── HTW Environment (per-job) ───────────────────────────────────── //
  HTW_ENVIRONMENT: {
    BASE:        (jobId: number) => `/staff/jobs/${jobId}/environment`,
    PRE_STATUS:  (jobId: number) => `/staff/jobs/${jobId}/environment/pre-status`,
    POST_STATUS: (jobId: number) => `/staff/jobs/${jobId}/environment/post-status`,
  },

  // ── HTW Repeatability ───────────────────────────────────────────── //
  HTW_REPEATABILITY: {
    CALCULATE:  `/htw-calculations/repeatability/calculate`,
    GET:        (jobId: number) => `/htw-calculations/repeatability/${jobId}`,
    REFERENCES: `/htw-calculations/repeatability/references/list`,
  },

  // ── HTW Reproducibility ─────────────────────────────────────────── //
  HTW_REPRODUCIBILITY: {
    CALCULATE: `/htw-calculations/reproducibility/calculate`,
    GET:       (jobId: number) => `/htw-calculations/reproducibility/${jobId}`,
  },

  // ── HTW Calculations (output drive / drive interface / loading point) //
  HTW_CALCULATIONS: {
    OUTPUT_DRIVE:              `/htw-calculations/output-drive`,
    OUTPUT_DRIVE_CALCULATE:    `/htw-calculations/output-drive/calculate`,
    DRIVE_INTERFACE:           `/htw-calculations/drive-interface`,
    DRIVE_INTERFACE_CALCULATE: `/htw-calculations/drive-interface/calculate`,
    LOADING_POINT:             `/htw-calculations/loading-point`,
    LOADING_POINT_CALCULATE:   `/htw-calculations/loading-point/calculate`,
  },

  // ── HTW Manufacturer Specs ──────────────────────────────────────── //
  HTW_MANUFACTURER_SPECS: {
    LIST:          `/htw-manufacturer-specs/`,
    GET:           (id: number) => `/htw-manufacturer-specs/${id}`,
    CREATE:        `/htw-manufacturer-specs/`,
    UPDATE:        (id: number) => `/htw-manufacturer-specs/${id}`,
    UPDATE_STATUS: (id: number) => `/htw-manufacturer-specs/${id}/status`,
    DELETE:        (id: number) => `/htw-manufacturer-specs/${id}`,
  },

  // ── HTW Pressure Gauge Resolutions ─────────────────────────────── //
  HTW_PRESSURE_GAUGE_RESOLUTIONS: {
    LIST:  `/htw-pressure-gauge-resolutions/`,
    UNITS: `/htw-pressure-gauge-resolutions/units`,
  },

  // ── HTW Nomenclature Ranges ─────────────────────────────────────── //
  HTW_NOMENCLATURE_RANGES: {
    LIST:          `/htw-nomenclature-ranges/`,
    GET:           (id: number) => `/htw-nomenclature-ranges/${id}`,
    CREATE:        `/htw-nomenclature-ranges/`,
    UPDATE:        (id: number) => `/htw-nomenclature-ranges/${id}`,
    UPDATE_STATUS: (id: number) => `/htw-nomenclature-ranges/${id}/status`,
    DELETE:        (id: number) => `/htw-nomenclature-ranges/${id}`,
    MATCH:         `/htw-nomenclature-ranges/match`,
  },

  // ── Lab Scope ───────────────────────────────────────────────────── //
  LAB_SCOPE: {
    LIST:          `/lab-scope/`,
    GET:           (id: number) => `/lab-scope/${id}`,
    CREATE:        `/lab-scope/`,
    UPDATE:        (id: number) => `/lab-scope/${id}`,
    DOCUMENT:      (id: number) => `/lab-scope/${id}/document`,
    UPDATE_STATUS: (id: number) => `/lab-scope/${id}/status`,
    DELETE:        (id: number) => `/lab-scope/${id}`,
    ACTIVE:        `/lab-scope/active`,
  },

  // ── Equipment Flow Configs ──────────────────────────────────────── //
  EQUIPMENT_FLOW_CONFIGS: {
    LIST: `/flow-configs`,
  },

  // ── Certificates (staff-facing) ─────────────────────────────────── //
  CERTIFICATES: {
    LIST:              `/certificates/`,
    SRF_GROUPS:        `/certificates/srf-groups`,
    GET:               (id: number) => `/certificates/${id}`,
    GENERATE:          (jobId: number) => `/certificates/jobs/${jobId}/generate`,
    UPDATE:            (id: number) => `/certificates/${id}`,
    SUBMIT:            (id: number) => `/certificates/${id}/submit`,
    APPROVE:           (id: number) => `/certificates/${id}/approve`,
    REWORK:            (id: number) => `/certificates/${id}/rework`,
    RESUBMIT:          (id: number) => `/certificates/${id}/resubmit`,
    ISSUE:             (id: number) => `/certificates/${id}/issue`,
    PREVIEW:           (id: number) => `/certificates/${id}/preview`,
    DOWNLOAD_PDF:      (id: number) => `/certificates/${id}/download-pdf`,
    DOWNLOAD_BULK_PDF: `/certificates/download-bulk-pdf`,
    GENERATE_QR:       (id: number) => `/certificates/${id}/qr/generate`,
    GENERATE_QR_BULK:  `/certificates/qr/generate-bulk`,
    VIEW_BY_QR:        (token: string) => `/certificates/qr/${token}`,
    VIEW_BY_QR_CERT:   (id: number) => `/certificates/qr/certificate/${id}`,
    JOB_PREVIEW:       (jobId: number) => `/certificates/jobs/${jobId}/preview-data`,
  },
} as const;

// ================================================================== //
//  INTERCEPTORS                                                        //
// ================================================================== //

// ── Request: attach Bearer token ─────────────────────────────────── //
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Let the browser set Content-Type for FormData (boundary header)
    if (config.data instanceof FormData && config.headers) {
      delete (config.headers as Record<string, unknown>)["Content-Type"];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response: token refresh on 401 ──────────────────────────────── //
type FailedQueueItem = {
  resolve: (token: string | null) => void;
  reject:  (error: unknown)       => void;
};

let isRefreshing = false;
let failedQueue: FailedQueueItem[] = [];

const processQueue = (error: unknown, token: string | null = null): void => {
  failedQueue.forEach((prom) => {
    error ? prom.reject(error) : prom.resolve(token);
  });
  failedQueue = [];
};

const handleUnauthorized = (error: any): void => {
  const redirectRequired = error.response?.headers?.["x-redirect-required"];
  const inwardId         = error.response?.headers?.["x-inward-id"];

  if (redirectRequired && inwardId) {
    localStorage.setItem("postLoginRedirect", `/portal/inwards/${inwardId}`);
  }

  window.dispatchEvent(
    new CustomEvent("auth-logout", { detail: { reason: "token_expired" } })
  );

  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");

  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error.config as typeof error.config & {
      _retry?: boolean;
    };

    const isLoginOrRefresh =
      originalRequest?.url === ENDPOINTS.AUTH.LOGIN ||
      originalRequest?.url === ENDPOINTS.AUTH.REFRESH;

    // ── Attempt silent token refresh on first 401 ────────────────── //
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isLoginOrRefresh
    ) {
      const refreshToken = localStorage.getItem("refresh_token");

      if (!refreshToken) {
        handleUnauthorized(error);
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue the request while a refresh is already in flight
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string | null) => {
              if (!token) { reject(error); return; }
              if (!originalRequest.headers) originalRequest.headers = {};
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
        // Use raw axios + FULL_API_HOST to bypass our interceptors
        axios
          .post(
            `${FULL_API_HOST}${ENDPOINTS.AUTH.REFRESH}`,
            { refresh_token: refreshToken },
            { headers: { "Content-Type": "application/json" } }
          )
          .then(({ data }) => {
            const { access_token, refresh_token } = data;

            localStorage.setItem("token", access_token);
            localStorage.setItem("refresh_token", refresh_token);

            window.dispatchEvent(
              new CustomEvent("auth-token-refreshed", {
                detail: { accessToken: access_token, refreshToken: refresh_token },
              })
            );

            api.defaults.headers.common.Authorization = `Bearer ${access_token}`;
            processQueue(null, access_token);

            if (!originalRequest.headers) originalRequest.headers = {};
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

    // ── Non-recoverable 401 ──────────────────────────────────────── //
    if (error.response?.status === 401 && !isLoginOrRefresh) {
      handleUnauthorized(error);
    }

    return Promise.reject(error);
  }
);