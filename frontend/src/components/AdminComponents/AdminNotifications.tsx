// frontend/src/components/AdminComponents/AdminNotifications.tsx

import React, { useState, useMemo } from 'react';
import {
  Bell, Loader2, CheckCircle2, XCircle, Clock,
  Unlock, Building2, Users, Filter, X,
} from 'lucide-react';
import { api } from '../../api/config';

// ====================================================================
// TYPES
// ====================================================================

export interface AdminNotificationItem {
  id: number;
  subject: string;
  body_text?: string | null;
  created_at: string;
  status: string;
  error?: string | null;
}

export type UnlockNotifStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface UnlockRequestHistory {
  status: UnlockNotifStatus;
  engineer_reason: string;
  admin_comment: string | null;
  requested_at: string;
  actioned_at: string | null;
}

export interface UnlockNotificationItem {
  inward_eqp_id: number;
  nepl_id: string;
  material_description: string;
  doc_type: 'result' | 'certificate';
  unlock_request: {
    status: UnlockNotifStatus;
    engineer_reason: string;
    requested_by: number;
    requested_by_name?: string;
    requested_at: string;
    admin_comment: string | null;
    actioned_by: number | null;
    actioned_at: string | null;
    history: UnlockRequestHistory[];
  };
}

export type NotificationTab = 'profile' | 'unlock';

// ====================================================================
// HELPERS
// ====================================================================

const extractCompanyRawFromNotification = (
  notification?: AdminNotificationItem | null
): string | null => {
  if (!notification) return null;
  const subjectMatch = notification.subject?.match(/\(Company:\s*([^)]+)\)/i);
  if (subjectMatch?.[1]?.trim()) return subjectMatch[1].trim();
  const body = notification.body_text;
  if (body?.trim()) {
    const structured = body.match(
      /Company:\s*([\s\S]*?)\s*\|\s*Customer profile updated/i
    );
    if (structured?.[1]?.trim()) return structured[1].trim();
    const beforePipe = body.match(/Company:\s*([^|\n\r]+)/i);
    if (beforePipe?.[1]?.trim()) return beforePipe[1].trim();
  }
  return null;
};

export const canonicalCompanyName = (
  raw: string | null | undefined
): string | null => {
  if (!raw?.trim()) return null;
  let s =
    raw
      .trim()
      .split(/\r?\n/)
      .find((line) => line.trim()) ?? raw.trim();
  s = s.replace(/\s+/g, ' ');
  const junkIdx = s.search(/\.\s*Changed:/i);
  if (junkIdx > 0) s = s.slice(0, junkIdx).trim();
  const leakedPipe = s.match(/^(.+?)(?:\s*\|\s*Customer\b)/i);
  if (leakedPipe?.[1]?.trim()) s = leakedPipe[1].trim();
  return s || null;
};

export const extractCompanyFromNotification = (
  notification?: AdminNotificationItem | null
): string | null =>
  canonicalCompanyName(extractCompanyRawFromNotification(notification));

export const notificationRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  const now  = Date.now();
  const sec  = Math.round((now - then) / 1000);
  if (sec < 60)  return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60)  return `${min}m ago`;
  const hr  = Math.floor(min / 60);
  if (hr  < 24)  return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7)   return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
};

// ====================================================================
// UNLOCK REQUEST CARD
// ====================================================================

export const UnlockRequestCard: React.FC<{
  item: UnlockNotificationItem;
  onActioned: () => void;
}> = ({ item, onActioned }) => {
  const [comment,     setComment]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [actionError, setActionError] = useState('');
  const [localStatus, setLocalStatus] = useState<UnlockNotifStatus>(
    item.unlock_request.status
  );

  const label      = item.doc_type === 'result' ? 'Calibration Worksheet' : 'Certificate';
  const isPending  = localStatus === 'PENDING';
  const isApproved = localStatus === 'APPROVED';
  const isRejected = localStatus === 'REJECTED';

  const handleAction = async (action: 'APPROVED' | 'REJECTED') => {
    if (action === 'REJECTED' && !comment.trim()) {
      setActionError('A comment is required when rejecting.');
      return;
    }
    setSubmitting(true);
    setActionError('');
    try {
      await api.post(
        `/manual-calibration/equipment/${item.inward_eqp_id}/action-unlock`,
        { doc_type: item.doc_type, action, comment: comment.trim() }
      );
      setLocalStatus(action);
      setComment('');
      onActioned();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setActionError(
        typeof detail === 'string'
          ? detail
          : (detail?.message ?? 'Failed to process request.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`bg-white border rounded-2xl p-5 shadow-sm transition-all ${
        isPending
          ? 'border-amber-200 ring-1 ring-amber-100'
          : isApproved
          ? 'border-green-200'
          : 'border-gray-200'
      }`}
    >
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="space-y-1">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
              isPending
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : isApproved
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-600 border-red-200'
            }`}
          >
            {isPending  && <Clock size={10} className="animate-pulse" />}
            {isApproved && <CheckCircle2 size={10} />}
            {isRejected && <XCircle size={10} />}
            {localStatus}
          </span>
          <h3 className="font-bold text-gray-900 text-base flex flex-wrap items-center gap-2">
            <span className="font-mono text-blue-600">{item.nepl_id}</span>
            <span className="text-gray-400">·</span>
            <span>{label}</span>
          </h3>
          <p className="text-xs text-gray-500 truncate max-w-xs">
            {item.material_description}
          </p>
        </div>
        <p className="text-xs text-gray-400 shrink-0">
          {new Date(item.unlock_request.requested_at).toLocaleString('en-GB')}
        </p>
      </div>

      {/* ── Engineer Reason ── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">
          Engineer's Reason
        </p>
        <p className="text-sm text-gray-800 font-medium">
          "{item.unlock_request.engineer_reason}"
        </p>
        {item.unlock_request.requested_by_name && (
          <p className="text-[11px] text-gray-500 mt-1">
            Requested by{' '}
            <span className="font-semibold">
              {item.unlock_request.requested_by_name}
            </span>
          </p>
        )}
      </div>

      {/* ── History ── */}
      {(item.unlock_request.history?.length ?? 0) > 0 && (
        <details className="mb-4 bg-gray-50 border border-gray-100 rounded-xl p-3">
          <summary className="text-xs font-bold text-gray-400 uppercase cursor-pointer select-none">
            Previous Requests ({item.unlock_request.history.length})
          </summary>
          <div className="mt-3 space-y-2">
            {item.unlock_request.history.map((h, i) => (
              <div
                key={i}
                className="text-xs bg-white border border-gray-100 rounded-lg p-2.5 space-y-1"
              >
                <p className="text-gray-700">"{h.engineer_reason}"</p>
                <p
                  className={`font-bold text-[10px] ${
                    h.status === 'APPROVED' ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {h.status}
                  {h.admin_comment && ` — "${h.admin_comment}"`}
                </p>
                {h.actioned_at && (
                  <p className="text-[10px] text-gray-400">
                    {new Date(h.actioned_at).toLocaleString('en-GB')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Action Area ── */}
      {isPending && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Admin Comment{' '}
              <span className="text-gray-400 font-normal normal-case">
                (required for rejection)
              </span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setActionError('');
              }}
              placeholder="Add notes or rejection reason..."
              rows={2}
              className={`w-full p-3 border rounded-xl text-sm resize-none outline-none transition-colors ${
                actionError
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-300 focus:ring-2 focus:ring-amber-100 focus:border-amber-400'
              }`}
            />
            {actionError && (
              <p className="text-xs text-red-500 mt-1">{actionError}</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleAction('REJECTED')}
              disabled={submitting}
              className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <XCircle size={15} /> Reject
            </button>
            <button
              onClick={() => handleAction('APPROVED')}
              disabled={submitting}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <CheckCircle2 size={15} />
              )}
              Approve
            </button>
          </div>
        </div>
      )}

      {!isPending && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
            isApproved
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {isApproved ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {isApproved
            ? 'Approved — engineer may now re-upload or delete the file.'
            : `Rejected${
                item.unlock_request.admin_comment
                  ? ` — "${item.unlock_request.admin_comment}"`
                  : ''
              }`}
        </div>
      )}
    </div>
  );
};

// ====================================================================
// PROFILE NOTIFICATIONS TAB
// ====================================================================

interface ProfileNotificationsTabProps {
  notifications: AdminNotificationItem[];
  loading: boolean;
  error: string | null;
  customers: Array<{ customer_details: string }>;
  onNavigateUsers: () => void;
}

const ProfileNotificationsTab: React.FC<ProfileNotificationsTabProps> = ({
  notifications,
  loading,
  error,
  customers,
  onNavigateUsers,
}) => {
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);

  const companyOptions = useMemo(() => {
    const names = new Set<string>();
    customers.forEach((c) => {
      const canon = canonicalCompanyName(c.customer_details);
      if (canon) names.add(canon);
    });
    notifications.forEach((n) => {
      const co = extractCompanyFromNotification(n);
      if (co) names.add(co);
    });
    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [customers, notifications]);

  const filtered = useMemo(() => {
    if (!companyFilter) return notifications;
    return notifications.filter(
      (n) => extractCompanyFromNotification(n) === companyFilter
    );
  }, [notifications, companyFilter]);

  if (loading) {
    return <p className="text-gray-500 text-sm py-4">Loading…</p>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Company Filter */}
      {notifications.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Filter className="h-4 w-4 text-gray-400" />
              <span>Filter by Company</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <select
                value={companyFilter ?? ''}
                onChange={(e) =>
                  setCompanyFilter(e.target.value === '' ? null : e.target.value)
                }
                className="w-full min-w-[220px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 sm:w-auto"
              >
                <option value="">All Companies</option>
                {companyOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {companyFilter && (
                <button
                  type="button"
                  onClick={() => setCompanyFilter(null)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <X className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Bell size={40} className="mb-3 opacity-40" />
          <p className="font-medium">
            No profile update notifications matching filter.
          </p>
        </div>
      )}

      {/* Notification Cards */}
      {filtered.map((n) => {
        const companyName = extractCompanyFromNotification(n);
        return (
          <div
            key={n.id}
            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {companyName && (
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
                    <Building2 size={12} />
                    {companyName}
                  </div>
                )}
                <h3 className="text-lg font-bold text-gray-900 break-words">
                  {n.subject}
                </h3>
                {n.body_text && (
                  <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-gray-700">
                    {n.body_text
                      .replace(/^Customer profile updated:\s*/i, '')
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={onNavigateUsers}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
                >
                  <Users size={14} /> Go to User Management
                </button>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    n.status === 'Sent'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : 'bg-gray-50 text-gray-600 border-gray-100'
                  }`}
                >
                  {n.status}
                </span>
                <p className="text-[10px] text-gray-400 mt-2">
                  {notificationRelativeTime(n.created_at)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ====================================================================
// UNLOCK REQUESTS TAB
// ====================================================================

interface UnlockRequestsTabProps {
  requests: UnlockNotificationItem[];
  loading: boolean;
  error: string | null;
  onActioned: () => void;
}

const UnlockRequestsTab: React.FC<UnlockRequestsTabProps> = ({
  requests,
  loading,
  error,
  onActioned,
}) => {
  const sorted = [
    ...requests
      .filter((r) => r.unlock_request.status === 'PENDING')
      .sort(
        (a, b) =>
          new Date(b.unlock_request.requested_at).getTime() -
          new Date(a.unlock_request.requested_at).getTime()
      ),
    ...requests
      .filter((r) => r.unlock_request.status !== 'PENDING')
      .sort(
        (a, b) =>
          new Date(b.unlock_request.requested_at).getTime() -
          new Date(a.unlock_request.requested_at).getTime()
      ),
  ];

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-500 text-sm py-4">
        <Loader2 size={18} className="animate-spin text-blue-500" />
        Loading delete requests…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        {error}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Unlock size={40} className="mb-3 opacity-40" />
        <p className="font-medium">No delete requests yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sorted.map((item, idx) => (
        <UnlockRequestCard
          key={`${item.inward_eqp_id}-${item.doc_type}-${idx}`}
          item={item}
          onActioned={onActioned}
        />
      ))}
    </div>
  );
};

// ====================================================================
// ADMIN NOTIFICATIONS PANEL  (main export)
// ====================================================================

export interface AdminNotificationsPanelProps {
  profileNotifications: AdminNotificationItem[];
  profileLoading: boolean;
  profileError: string | null;
  unlockRequests: UnlockNotificationItem[];
  unlockLoading: boolean;
  unlockError: string | null;
  unreadProfileCount: number;
  unreadUnlockCount: number;
  customers: Array<{ customer_details: string }>;
  onNavigateUsers: () => void;
  onUnlockActioned: () => void;
  onMarkUnlockRead: () => void;
}

export const AdminNotificationsPanel: React.FC<AdminNotificationsPanelProps> = ({
  profileNotifications,
  profileLoading,
  profileError,
  unlockRequests,
  unlockLoading,
  unlockError,
  unreadProfileCount,
  unreadUnlockCount,
  customers,
  onNavigateUsers,
  onUnlockActioned,
  onMarkUnlockRead,
}) => {
  const [activeTab, setActiveTab] = useState<NotificationTab>('profile');

  const handleUnlockTabClick = () => {
    setActiveTab('unlock');
    onMarkUnlockRead();
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* ── Page Header ── */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Notifications</h2>
        <p className="text-gray-500 mt-1">
          Profile updates and document delete requests.
        </p>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('profile')}
          className={`relative flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'profile'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bell size={15} />
          Profile Updates
          {unreadProfileCount > 0 && (
            <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] font-bold text-center">
              {unreadProfileCount > 99 ? '99+' : unreadProfileCount}
            </span>
          )}
        </button>
        <button
          onClick={handleUnlockTabClick}
          className={`relative flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'unlock'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Unlock size={15} />
          Delete Requests
          {unreadUnlockCount > 0 && (
            <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] leading-[18px] font-bold text-center">
              {unreadUnlockCount > 99 ? '99+' : unreadUnlockCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'profile' && (
        <ProfileNotificationsTab
          notifications={profileNotifications}
          loading={profileLoading}
          error={profileError}
          customers={customers}
          onNavigateUsers={onNavigateUsers}
        />
      )}
      {activeTab === 'unlock' && (
        <UnlockRequestsTab
          requests={unlockRequests}
          loading={unlockLoading}
          error={unlockError}
          onActioned={onUnlockActioned}
        />
      )}
    </div>
  );
};