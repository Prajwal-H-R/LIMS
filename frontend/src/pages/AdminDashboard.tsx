// frontend/src/pages/AdminDashboard.tsx
 
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useLocation, useNavigate, Routes, Route } from 'react-router-dom';import { useAuth } from '../auth/AuthProvider';
import { api, ENDPOINTS } from '../api/config';
import { fetchLicenseStatus, LicenseStatus } from '../api/license';
import LicenseModal from '../components/LicenseModal';
 
import Header   from '../components/Header';
import Footer   from '../components/Footer';
import ProfilePage from '../components/ProfilePage';
import CalibrationReminderDetailsPage from '../components/CalibrationReminderDetailsPage';
 
import { MasterStandardModule }    from '../components/AdminComponents/MasterStandardModule';
import { CertificateApprovalModule } from '../components/AdminComponents/CertificateApprovalModule';
import { LabScopeModule }          from '../components/AdminComponents/LabScopeModule';
import { HTWEnvironmentManager }   from '../components/AdminComponents/HTWEnvironmentManager';
import { CertificateDetailsManager } from '../components/AdminComponents/CertificateDetailsManager';
import { AdminDelegatedApproval } from '../components/AdminComponents/AdminDelegatedApproval';
import ReportsAndAnalytics from '../components/AdminComponents/ReportsAndAnalytics';
import {
  AdminNotificationsPanel,
  extractCompanyFromNotification,
} from '../components/AdminComponents/AdminNotifications';
 
import { AdminDashboardHome }      from '../components/AdminDashboardHome';
import {
  UserManagementSystem,
  InviteUsersSection,
  User,
  Customer,
} from '../components/AdminComponents/AdminUserManagements';
 
import {
  AlertCircle, Settings, Info,
  Bell, Users, UserPlus, UserCog,
  Ruler, Building2, Award, Thermometer,
  ChevronLeft, ChevronRight, Menu,
  LayoutDashboard,
  FileText, KeyRound, ShieldCheck, RefreshCw, CalendarDays,Search,BarChart
} from 'lucide-react';
 
import type { AdminNotificationItem, UnlockNotificationItem } from
  '../components/AdminComponents/AdminNotifications';
 
// ====================================================================
// CONSTANTS
// ====================================================================
 
const UNLOCK_LAST_READ_KEY            = 'admin_unlock_last_read_at';
const PROFILE_UPDATE_LAST_POPUP_SEEN_KEY = 'admin_profile_update_last_popup_seen_id';
const PROFILE_UPDATE_LAST_READ_KEY    = 'admin_profile_update_last_read_id';
 
// ====================================================================
// RESPONSE TYPES
// ====================================================================
 
export interface UserStats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  admin_users: number;
}

interface UsersResponse { 
  total_count: number;
  users: User[]; 
}
interface AdminNotificationsResponse { notifications: AdminNotificationItem[]; }
interface ExpiryCheckResponse      { message: string; affected_tables: string[]; }
 
// ====================================================================
// SKELETON
// ====================================================================
 
const AdminSkeleton: React.FC<{ type: 'dashboard' | 'users' }> = ({ type }) => {
  if (type === 'dashboard') {
    return (
      <div className="animate-pulse space-y-8 w-full">
        <div className="space-y-3">
          <div className="h-10 w-64 bg-slate-200 rounded-lg" />
          <div className="h-5 w-96 bg-slate-200 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-2xl bg-white border border-gray-100 p-8 shadow-sm"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="h-14 w-14 rounded-xl bg-slate-200" />
                <div className="h-10 w-16 bg-slate-200 rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-6 w-32 bg-slate-200 rounded" />
                <div className="h-4 w-48 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="h-24 bg-slate-200/80" />
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 bg-slate-100 rounded-xl border border-slate-200"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
 
  return (
    <div className="animate-pulse h-full flex flex-col w-full">
      <div className="mb-6 space-y-2">
        <div className="h-10 w-64 bg-slate-200 rounded-lg" />
        <div className="h-4 w-96 bg-slate-200 rounded" />
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex-1">
        <div className="border-b border-gray-200 p-6 pb-0">
          <div className="h-8 w-48 bg-slate-200 rounded mb-4" />
          <div className="flex gap-4 mt-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 w-32 bg-slate-100 rounded-t-lg" />
            ))}
          </div>
        </div>
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex gap-4">
          <div className="h-10 w-64 bg-slate-200 rounded-lg" />
          <div className="h-10 w-48 bg-slate-200 rounded-lg hidden sm:block" />
        </div>
        <div className="p-0">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="border-b border-gray-100 px-6 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-slate-200 rounded" />
                  <div className="h-3 w-24 bg-slate-200 rounded" />
                </div>
              </div>
              <div className="h-6 w-24 bg-slate-200 rounded hidden md:block" />
              <div className="h-6 w-20 bg-slate-200 rounded hidden md:block" />
              <div className="h-8 w-24 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
 
// ====================================================================
// SIDEBAR
// ====================================================================
 
interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  activeSection: string;
  setActiveSection: (val: string) => void;
  unreadNotificationCount: number;
}
 
const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  setIsOpen,
  activeSection,
  setActiveSection,
  unreadNotificationCount,
}) => {
  const [hoveredItem, setHoveredItem] = useState<{
    label: string;
    top: number;
  } | null>(null);
 
  const mainNavItems = [
    { id: 'dashboard',     label: 'Dashboard',      icon: <LayoutDashboard size={20} /> },
    { id: 'profile',       label: 'My Profile',     icon: <UserCog size={20} /> },
    { id: 'notifications', label: 'Notifications',  icon: <Bell size={20} /> },
    { id: 'invite-users',  label: 'Invite User',    icon: <UserPlus size={20} /> },
    { id: 'users',         label: 'User Management',icon: <Users size={20} /> },
    { id: 'delegated-approval', label: 'Delegated Approval', icon: <ShieldCheck size={20} /> },
    { id: 'calibration-explorer', label: 'Calibration Explorer', icon: <Search size={20} /> },
    { id: 'reports-analytics', label: 'Reports and Analytics', icon: <BarChart size={20} /> },
     { id: 'certificate-approval', label: 'Certificate Approval', icon: <Award size={20} /> }, // <-- Add this line
  ];
 
  const adminToolItems = [
    { id: 'master-standard',      label: 'Master Standards',     icon: <Ruler size={20} /> },
    { id: 'laboratory-scope',     label: 'Laboratory Scope',     icon: <Building2 size={20} /> },
    { id: 'htw-environment',      label: 'Environment Ranges',   icon: <Thermometer size={20} /> },
    { id: 'settings',             label: 'Settings',             icon: <Settings size={20} /> },
  ];
 
  const handleMouseEnter = (
    e: React.MouseEvent<HTMLButtonElement>,
    label: string
  ) => {
    if (isOpen) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredItem({ label, top: rect.top + rect.height / 2 });
  };
 
  const renderNavButton = (item: {
    id: string;
    label: string;
    icon: React.ReactNode;
  }) => {
    const isActive   = activeSection === item.id;
    const showUnread =
      item.id === 'notifications' && unreadNotificationCount > 0;
    const badgeLabel =
      unreadNotificationCount > 99 ? '99+' : unreadNotificationCount;
 
    return (
      <button
        key={item.id}
        onClick={() => setActiveSection(item.id)}
        onMouseEnter={(e) => handleMouseEnter(e, item.label)}
        onMouseLeave={() => setHoveredItem(null)}
        className={`
          w-full flex items-center px-3 py-3 my-1 rounded-xl transition-all duration-200 group relative
          ${isOpen ? 'justify-start' : 'justify-center'}
          ${isActive
            ? 'bg-blue-600 text-white shadow-md shadow-blue-200/50'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
          }
        `}
      >
        <div
          className={`flex-shrink-0 transition-colors duration-200 ${
            isActive
              ? 'text-white'
              : 'text-gray-400 group-hover:text-gray-600'
          }`}
        >
          {item.icon}
        </div>
        {showUnread && !isOpen && (
          <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] font-bold text-center">
            {badgeLabel}
          </span>
        )}
        <span
          className={`
            ml-3 text-sm font-medium whitespace-nowrap transition-all duration-300 origin-left flex-1 text-left
            ${isOpen
              ? 'opacity-100 w-auto translate-x-0'
              : 'opacity-0 w-0 -translate-x-4 overflow-hidden hidden'
            }
          `}
        >
          {item.label}
        </span>
        {showUnread && isOpen && (
          <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] font-bold text-center">
            {badgeLabel}
          </span>
        )}
      </button>
    );
  };
 
  return (
    <>
      <aside
        className={`
          relative bg-white border-r border-gray-200 flex flex-col h-full
          transition-all duration-300 ease-in-out
          ${isOpen ? 'w-64' : 'w-[4.5rem]'}
        `}
      >
        <div
          className={`h-14 flex items-center px-4 flex-shrink-0 bg-white border-b border-gray-50 ${
            isOpen ? 'justify-between' : 'justify-center'
          }`}
        >
          {isOpen && (
            <div className="font-extrabold text-gray-800 text-lg tracking-tight animate-fadeIn truncate">
              Admin<span className="text-blue-600">Portal</span>
            </div>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all border border-transparent hover:border-gray-100"
            title={isOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          >
            {isOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-200 flex flex-col">
          <div className="space-y-1">{mainNavItems.map(renderNavButton)}</div>
          <div className="my-6">
            {isOpen ? (
              <div className="px-3 mb-2 animate-fadeIn">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  Configuration
                </span>
              </div>
            ) : (
              <div className="border-t border-gray-100 mx-2 mb-3" />
            )}
            <div className="space-y-1">
              {adminToolItems.map(renderNavButton)}
            </div>
          </div>
        </nav>
      </aside>
      {!isOpen && hoveredItem && (
        <div
          className="fixed z-[150] px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg shadow-xl whitespace-nowrap pointer-events-none animate-fadeIn"
          style={{
            left: '5.2rem',
            top: hoveredItem.top,
            transform: 'translateY(-50%)',
          }}
        >
          {hoveredItem.label}
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </>
  );
};
 
// ====================================================================
// PROFILE UPDATE POPUP
// ====================================================================
 
const ProfileUpdatePopup: React.FC<{
  latestCompany: string | null;
  onDismiss: () => void;
  onView: () => void;
}> = ({ latestCompany, onDismiss, onView }) => (
  <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-6 w-6 text-red-600 mt-1 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            New Customer Profile Update
          </h3>
          <p className="text-gray-600 mt-2 text-sm">
            {latestCompany ? (
              <>
                <span className="font-semibold text-gray-900">
                  {latestCompany}
                </span>{' '}
                updated customer profile details.
              </>
            ) : (
              'A customer updated their profile details. Open Notifications to review.'
            )}
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={onView}
          className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition"
        >
          View Notifications
        </button>
      </div>
    </div>
  </div>
);
 
// ====================================================================
// LICENSE & SUBSCRIPTION SETTINGS
// ====================================================================

interface LicenseSubscriptionManagerProps {
  status: LicenseStatus | null;
  validUntil: string;
  onRefresh: () => Promise<void>;
  onBack: () => void;
}

const formatLicenseDate = (value: string): string => {
  if (!value) return 'Not available';

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const LicenseSubscriptionManager: React.FC<LicenseSubscriptionManagerProps> = ({
  status,
  validUntil,
  onRefresh,
  onBack,
}) => {
  const [activationKey, setActivationKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const daysRemaining = (() => {
    if (!validUntil) return null;

    const expiryDate = new Date(`${validUntil.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(expiryDate.getTime())) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((expiryDate.getTime() - today.getTime()) / 86_400_000);
  })();

  const statusLabel =
    status === 'ACTIVE'
      ? 'Active'
      : status === 'EXPIRING_SOON'
        ? 'Expiring Soon'
        : status === 'EXPIRED'
          ? 'Expired'
          : 'Unavailable';

  const statusClasses =
    status === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'EXPIRING_SOON'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : status === 'EXPIRED'
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-slate-50 text-slate-600 border-slate-200';

  const handleRefresh = async () => {
    setRefreshing(true);
    setFeedback(null);
    try {
      await onRefresh();
    } catch {
      setFeedback({
        type: 'error',
        text: 'Unable to refresh license details. Please try again.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const key = activationKey.trim();
    if (!key) {
      setFeedback({ type: 'error', text: 'Please enter the license key.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await api.post<{
        message?: string;
        valid_until?: string;
      }>('/license/extend', {
        activation_key: key,
      });

      setActivationKey('');
      setFeedback({
        type: 'success',
        text: response.data?.message || 'License extended successfully.',
      });

      // The extension is already committed by the API. Refresh the displayed
      // database expiry separately so a refresh failure does not misreport it.
      try {
        await onRefresh();
      } catch {
        setFeedback({
          type: 'success',
          text: `${response.data?.message || 'License extended successfully.'} The displayed status could not be refreshed; use Refresh to load it again.`,
        });
      }
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      setFeedback({
        type: 'error',
        text:
          typeof detail === 'string'
            ? detail
            : 'License extension failed. Verify the key and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-blue-600"
          >
            <ChevronLeft size={16} />
            Back to Settings
          </button>
          <h2 className="text-2xl font-bold text-gray-900">License &amp; Subscription</h2>
          <p className="mt-1 text-sm text-gray-500">
            View the current license validity and extend it using a new activation key.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh status'}
        </button>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <ShieldCheck size={23} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Current license</h3>
            <p className="text-sm text-gray-500">View your current license information</p>
          </div>
          <span className={`ml-auto inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses}`}>
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <CalendarDays size={16} />
              License valid until
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900">
              {formatLicenseDate(validUntil)}
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="text-sm text-gray-500">Validity remaining</div>
            <div className="mt-2 text-xl font-bold text-gray-900">
              {daysRemaining === null
                ? '—'
                : daysRemaining < 0
                  ? `${Math.abs(daysRemaining)} day(s) overdue`
                  : `${daysRemaining} day(s)`}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <KeyRound size={22} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Extend license</h3>
            <p className="mt-1 text-sm text-gray-500">
              Enter the activation key provided for your next license period
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          For Uninterrupted LIMS usage, ensure that the license is extended before the current license expires
        </div>

        {feedback && (
          <div
            role="alert"
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="license-activation-key" className="mb-2 block text-sm font-medium text-gray-700">
              License activation key
            </label>
            <input
              id="license-activation-key"
              type="text"
              value={activationKey}
              onChange={(event) => setActivationKey(event.target.value)}
              placeholder="YatharthataLIMS|YYYY-MM-DD|..."
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* <p className="text-xs text-gray-500">
              Applying a key updates the license expiry and records the extension in the audit table.
            </p> */}
            <button
              type="submit"
              disabled={submitting || !activationKey.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <RefreshCw size={16} className="animate-spin" />}
              {submitting ? 'Applying key...' : 'Extend license'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

// ====================================================================
// MAIN DASHBOARD COMPONENT
// ====================================================================
 
const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Override active section if we are inside the path-based Calibration Explorer route
  const isCalibrationExplorer = location.pathname.includes('/calibration-reminders');
  const activeSection = isCalibrationExplorer ? 'calibration-explorer' : (searchParams.get('section') || 'dashboard');
 
  // ── License popup state (admin only; never blocks actions) ─────────
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [licenseValidUntil, setLicenseValidUntil] = useState('');
  const [showLicensePopup, setShowLicensePopup] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    'overview' | 'certificate-details' | 'license-subscription'
  >('overview');
 
  // ── Core state ────────────────────────────────────────────────────
  const [users,          setUsers]          = useState<User[]>([]);
  const [userStats,      setUserStats]      = useState<UserStats | null>(null);
  const [totalUserCount, setTotalUserCount] = useState<number>(0);
  const [customers,      setCustomers]      = useState<Customer[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [statusMessage,  setStatusMessage]  = useState<{
    type: 'success' | 'error'; text: string
  } | null>(null);
  const [isSidebarOpen,  setSidebarOpen]    = useState(true);
  const [expiredTables,  setExpiredTables]  = useState<string[]>([]);
  const expiryCheckedRef = useRef(false);
 
  // ── Profile notifications ─────────────────────────────────────────
  const [profileNotifications,    setProfileNotifications]    = useState<AdminNotificationItem[]>([]);
  const [profileNotifLoading,     setProfileNotifLoading]     = useState(false);
  const [profileNotifError,       setProfileNotifError]       = useState<string | null>(null);
  const [showProfileUpdatePopup,  setShowProfileUpdatePopup]  = useState(false);
  const [unreadProfileCount,      setUnreadProfileCount]      = useState(0);
 
  // ── Unlock notifications ──────────────────────────────────────────
  const [unlockRequests,   setUnlockRequests]   = useState<UnlockNotificationItem[]>([]);
  const [unlockLoading,    setUnlockLoading]    = useState(false);
  const [unlockError,      setUnlockError]      = useState<string | null>(null);
  const [unreadUnlockCount,setUnreadUnlockCount]= useState(0);
 
  const totalUnreadCount = unreadProfileCount + unreadUnlockCount;
 
  // ── Navigation ────────────────────────────────────────────────────
// ── Navigation ────────────────────────────────────────────────────
  const handleNavigate = (section: string) => {
    if (section === 'calibration-explorer') {
      navigate('/admin/calibration-reminders/0'); // Route to Explorer Mode
    } else if (isCalibrationExplorer) {
      navigate(`/admin?section=${section}`); // Escape the nested path back to normal admin views
    } else {
      setSearchParams({ section });
    }
  };
 
  const handleLogout = () => { if (logout) logout(); };

  // Return to the Settings card menu whenever the user leaves this section.
  useEffect(() => {
    if (activeSection !== 'settings') {
      setSettingsTab('overview');
    }
  }, [activeSection]);

  const refreshLicenseStatus = useCallback(async () => {
    const res = await fetchLicenseStatus();
    setLicenseStatus(res?.status ?? null);
    setLicenseValidUntil(res?.valid_until ?? '');
    setShowLicensePopup(Boolean(res?.show_popup));
  }, []);
 
  // ── Calibration expiry check ──────────────────────────────────────
  const checkCalibrationExpiry = useCallback(async () => {
    if (expiryCheckedRef.current) return;
    expiryCheckedRef.current = true;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await api.post<ExpiryCheckResponse>(
        '/calibration/check-expiry',
        { reference_date: todayStr }
      );
      if (res.data) {
        setExpiredTables(
          'affected_tables' in res.data && Array.isArray(res.data.affected_tables)
            ? res.data.affected_tables
            : []
        );
      }
    } catch (err) {
      console.error('Backend expiry check failed', err);
    }
  }, []);
 
  // ── Core data fetch ───────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, customersRes, statsRes] = await Promise.all([
        api.get<UsersResponse>(`${ENDPOINTS.USERS.ALL_USERS}?skip=0&limit=1000`),
        api.get<Customer[]>(ENDPOINTS.PORTAL.CUSTOMERS_DROPDOWN),
        api.get<UserStats>('/users/stats')
      ]);
      
      setUsers(usersRes.data.users || []);
      setTotalUserCount(usersRes.data.total_count || 0);
      setCustomers(customersRes.data);
      setUserStats(statsRes.data);
    } catch (e: unknown) {
      console.error('Error fetching admin data:', e);
      if (e && typeof e === 'object' && 'isAxiosError' in e) {
        const ax = e as any;
        if (ax.response?.status !== 401) {
          setError(ax.response?.data?.detail || 'Failed to fetch admin data.');
        }
      } else {
        setError('An unknown error occurred.');
      }
    } finally {
      setLoading(false);
    }
  }, []);
 
  // ── Profile notifications ────────────────────────────────────────
  // Load notifications once when the Admin Dashboard mounts. There is no
  // interval, focus listener, visibility listener, or section-change fetch.
  // The in-flight guard also prevents duplicate requests if React re-runs the
  // mount effect in development StrictMode.
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const profileNotifInFlightRef = useRef(false);

  const fetchProfileNotifications = useCallback(async () => {
    if (profileNotifInFlightRef.current) return;

    profileNotifInFlightRef.current = true;
    setProfileNotifLoading(true);
    setProfileNotifError(null);

    try {
      const res = await api.get<AdminNotificationsResponse>(
        ENDPOINTS.NOTIFICATIONS
      );

      const notifs = Array.isArray(res.data?.notifications)
        ? res.data.notifications
        : [];

      setProfileNotifications(notifs);

      const newestId = notifs[0]?.id;

      const lastPopupSeenId = Number(
        localStorage.getItem(PROFILE_UPDATE_LAST_POPUP_SEEN_KEY) || '0'
      );

      if (newestId && newestId > lastPopupSeenId) {
        setShowProfileUpdatePopup(true);

        localStorage.setItem(
          PROFILE_UPDATE_LAST_POPUP_SEEN_KEY,
          String(newestId)
        );
      }

      const lastReadId = Number(
        localStorage.getItem(PROFILE_UPDATE_LAST_READ_KEY) || '0'
      );

      if (activeSectionRef.current === 'notifications') {
        if (newestId) {
          localStorage.setItem(
            PROFILE_UPDATE_LAST_READ_KEY,
            String(newestId)
          );
        }

        setUnreadProfileCount(0);
      } else {
        setUnreadProfileCount(
          notifs.filter((n) => n.id > lastReadId).length
        );
      }
    } catch (err: unknown) {
      const maybeMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as {
              response?: { data?: { detail?: string } };
            }).response?.data?.detail
          : null;

      setProfileNotifError(
        maybeMsg || 'Failed to load notifications.'
      );
    } finally {
      profileNotifInFlightRef.current = false;
      setProfileNotifLoading(false);
    }
  }, []);

  // Exactly one initial profile-notifications fetch for this page mount.
  useEffect(() => {
    void fetchProfileNotifications();
  }, [fetchProfileNotifications]);

  // ── Unlock requests fetch ─────────────────────────────────────────
  const unlockRequestsInFlightRef = useRef(false);

  const fetchUnlockRequests = useCallback(async () => {
    if (unlockRequestsInFlightRef.current) return;

    unlockRequestsInFlightRef.current = true;
    setUnlockLoading(true);
    setUnlockError(null);
    try {
      const res = await api.get<UnlockNotificationItem[]>(
        '/manual-calibration/unlock-requests'
      );
      const items = res.data ?? [];
      setUnlockRequests(items);
      const lastRead = localStorage.getItem(UNLOCK_LAST_READ_KEY) ?? '0';
      setUnreadUnlockCount(
        items.filter(
          (r) =>
            r.unlock_request.status === 'PENDING' &&
            new Date(r.unlock_request.requested_at) > new Date(lastRead)
        ).length
      );
    } catch (e: any) {
      setUnlockError(
        e?.response?.data?.detail ?? 'Failed to load delete requests.'
      );
    } finally {
      unlockRequestsInFlightRef.current = false;
      setUnlockLoading(false);
    }
  }, []);
 
  // ── Effects ───────────────────────────────────────────────────────
  useEffect(() => { checkCalibrationExpiry(); }, [checkCalibrationExpiry]);
 
  // Fetch license status once authenticated. The same callback is used by
  // the Settings page and the existing expiry popup after an extension.
  useEffect(() => {
    if (!user) return;
    const role = (user as any)?.role?.toString().toLowerCase();
    if (role !== 'admin') return;

    void refreshLicenseStatus().catch(() => {
      // Keep the existing UI state unchanged if the status request fails.
    });
  }, [user, refreshLicenseStatus]);
 
  useEffect(() => {
    if (['dashboard', 'users', 'invite-users', 'notifications']
        .includes(activeSection)) {
      fetchData();
    }
  }, [fetchData, activeSection]);
 
  // Load unlock requests once when the Admin Dashboard mounts.
  // Keep the existing manual refresh after an unlock action.
  useEffect(() => {
    void fetchUnlockRequests();
  }, [fetchUnlockRequests]);
 
  useEffect(() => {
    if (activeSection === 'notifications') {
      setShowProfileUpdatePopup(false);
      const newestId = profileNotifications[0]?.id;
      if (newestId)
        localStorage.setItem(PROFILE_UPDATE_LAST_READ_KEY, String(newestId));
      setUnreadProfileCount(0);
    }
  }, [activeSection, profileNotifications]);
 
  // ── Toggle user status ────────────────────────────────────────────
  const handleToggleStatus = useCallback(
    async (userId: number, currentStatus: boolean) => {
      setStatusMessage(null);
      setUpdatingUserId(userId);
      try {
        const res = await api.patch<User>(
          ENDPOINTS.USERS.UPDATE_STATUS(userId),
          { is_active: !currentStatus }
        );
        const nextStatus = res.data.is_active ?? !currentStatus;
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === userId ? { ...u, is_active: nextStatus } : u
          )
        );
        setStatusMessage({
          type: 'success',
          text: `${res.data.full_name || 'User'} is now ${
            nextStatus ? 'Active' : 'Inactive'
          }.`,
        });
      } catch {
        setStatusMessage({ type: 'error', text: 'Failed to update user status.' });
      } finally {
        setUpdatingUserId(null);
      }
    },
    []
  );
 
  // ── Derived data ──────────────────────────────────────────────────
  const userName = user?.full_name || user?.username || 'User';
  const userRole = user?.role || 'Admin';
 
  // Latest company for popup
const latestPopupCompany =
  profileNotifications[0]
    ? extractCompanyFromNotification(profileNotifications[0])
    : null;
 
  // ====================================================================
  // RENDER
  // ====================================================================
 
  return (
    <div className="flex flex-col h-screen bg-[#f8f9fc] font-sans text-gray-900 overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="flex-none w-full bg-white border-b border-gray-200 shadow-sm z-50">
        <Header
          username={userName}
          role={userRole}
          onLogout={handleLogout}
          profilePath="/admin?section=profile"
          notificationsPath="/admin?section=notifications"
        />
      </div>
 
      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Sidebar ── */}
        <div className="flex-none h-full bg-white border-r border-gray-200 z-40">
          <Sidebar
            isOpen={isSidebarOpen}
            setIsOpen={setSidebarOpen}
            activeSection={activeSection}
            setActiveSection={handleNavigate}
            unreadNotificationCount={totalUnreadCount}
          />
        </div>
 
        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50 relative z-0">
          <div className="flex flex-col min-h-full">
            <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
 
              {/* Global error */}
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center text-red-700 animate-fadeIn">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  <span>{error}</span>
                </div>
              )}
 
              {/* ── DASHBOARD ── */}
              {activeSection === 'dashboard' && (
                loading ? (
                  <AdminSkeleton type="dashboard" />
                ) : (
                  <AdminDashboardHome
                    users={users}
                    userStats={userStats}
                    onNavigate={handleNavigate}
                    expiredTables={expiredTables}
                  />
                )
              )}
 
              {/* ── PROFILE ── */}
              {activeSection === 'profile' && (
                <div className="animate-fadeIn w-full max-w-3xl mx-auto">
                  <ProfilePage />
                </div>
              )}
 
              {/* ── NOTIFICATIONS ── */}
              {activeSection === 'notifications' && (
                <div className="animate-fadeIn">
                  <AdminNotificationsPanel
                    profileNotifications={profileNotifications}
                    profileLoading={profileNotifLoading}
                    profileError={profileNotifError}
                    unlockRequests={unlockRequests}
                    unlockLoading={unlockLoading}
                    unlockError={unlockError}
                    unreadProfileCount={unreadProfileCount}
                    unreadUnlockCount={unreadUnlockCount}
                    customers={customers}
                    onNavigateUsers={() => handleNavigate('users')}
                    onUnlockActioned={fetchUnlockRequests}
                    onMarkUnlockRead={() => {
                      localStorage.setItem(
                        UNLOCK_LAST_READ_KEY,
                        new Date().toISOString()
                      );
                      setUnreadUnlockCount(0);
                    }}
                  />
                </div>
              )}
 
              {/* ── INVITE USERS ── */}
              {activeSection === 'invite-users' && (
                <div className="animate-fadeIn">
                  <InviteUsersSection existingCustomers={customers} />
                </div>
              )}
 
              {/* ── DELEGATED APPROVAL ── */}
              {activeSection === 'delegated-approval' && (
                <div className="animate-fadeIn">
                  <AdminDelegatedApproval onBack={() => handleNavigate('dashboard')} />
                </div>
              )}

              {/* ── USER MANAGEMENT ── */}
              {activeSection === 'users' && (
                loading ? (
                  <AdminSkeleton type="users" />
                ) : (
                  <div className="animate-fadeIn h-full flex flex-col">
                    <div className="mb-6">
                      <h2 className="text-3xl font-bold text-gray-900">
                        User Management
                      </h2>
                      <p className="text-gray-500 mt-1">
                        View and manage all registered system users.
                      </p>
                    </div>
                    <div className="flex-1 min-h-0">
                      {statusMessage && (
                        <div
                          className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center shadow-sm ${
                            statusMessage.type === 'success'
                              ? 'bg-green-50 text-green-700 border border-green-100'
                              : 'bg-red-50 text-red-700 border border-red-100'
                          }`}
                        >
                          <Info size={16} className="mr-2" />
                          {statusMessage.text}
                        </div>
                      )}
                      <UserManagementSystem
                        users={users}
                        updatingUserId={updatingUserId}
                        onToggleStatus={handleToggleStatus}
                        onRefreshData={fetchData}
                      />
                    </div>
                  </div>
                )
              )}
  {/* ── CALIBRATION EXPLORER ── */}
                {activeSection === 'calibration-explorer' && (
                  <div className="animate-fadeIn h-full">
                    <Routes>
                      <Route path="calibration-reminders/:customerId" element={<CalibrationReminderDetailsPage />} />
                    </Routes>
                  </div>
                )}
                {/* ── REPORTS & ANALYTICS ── */}
              {activeSection === 'reports-analytics' && (
                <div className="animate-fadeIn h-full">
                  <ReportsAndAnalytics />
                </div>
              )}
              {/* ── TOOL SECTIONS ── */}
              {activeSection === 'certificate-approval' && (
                <div className="animate-slideUp">
                  <CertificateApprovalModule />
                </div>
              )}
              {activeSection === 'master-standard' && (
                <div className="animate-slideUp">
                  <MasterStandardModule />
                </div>
              )}
              {activeSection === 'htw-environment' && (
                <div className="animate-slideUp">
                  <HTWEnvironmentManager onBack={() => handleNavigate('dashboard')} />
                </div>
              )}
              {activeSection === 'laboratory-scope' && (
                <div className="animate-slideUp">
                  <LabScopeModule onBack={() => handleNavigate('dashboard')} />
                </div>
              )}
              {activeSection === 'settings' && (
                <div className="animate-slideUp space-y-7">
                  {settingsTab === 'overview' ? (
                    <>
                      <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                          Configuration Options
                        </h1>
                        <p className="mt-1.5 text-sm text-gray-500">
                          Choose a settings area to view or manage your LIMS configuration.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => setSettingsTab('certificate-details')}
                          className="group flex min-h-[108px] w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                            <FileText size={26} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold text-gray-900 transition-colors group-hover:text-blue-600 sm:text-lg">
                              Certificate Details
                            </span>
                            <span className="mt-1 block text-sm leading-5 text-gray-500">
                              Manage the details displayed on issued certificates.
                            </span>
                          </span>
                          <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 transition-colors group-hover:text-blue-600" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setSettingsTab('license-subscription')}
                          className="group flex min-h-[108px] w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                        >
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                            <KeyRound size={26} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold text-gray-900 transition-colors group-hover:text-violet-600 sm:text-lg">
                              License &amp; Subscription
                            </span>
                            <span className="mt-1 block text-sm leading-5 text-gray-500">
                              View license validity and manage your subscription.
                            </span>
                          </span>
                          <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 transition-colors group-hover:text-violet-600" />
                        </button>
                      </div>
                    </>
                  ) : settingsTab === 'certificate-details' ? (
                    <CertificateDetailsManager
                      onBack={() => setSettingsTab('overview')}
                    />
                  ) : (
                    <LicenseSubscriptionManager
                      status={licenseStatus}
                      validUntil={licenseValidUntil}
                      onRefresh={refreshLicenseStatus}
                      onBack={() => setSettingsTab('overview')}
                    />
                  )}
                </div>
              )}
            </div>
 
            <footer className="w-full bg-white border-t border-gray-200 mt-auto">
              <Footer />
            </footer>
          </div>
        </main>
      </div>
 
      {/* ── License Popup ── */}
      {showLicensePopup &&
        (licenseStatus === 'EXPIRED' || licenseStatus === 'EXPIRING_SOON') &&
        licenseStatus && (
          <LicenseModal
            status={licenseStatus}
            validUntil={licenseValidUntil}
            onExtended={async () => {
              // After successful extension, re-fetch to get the latest status.
              try {
                await refreshLicenseStatus();
              } catch {
                setShowLicensePopup(false);
              }
            }}
            onClose={() => setShowLicensePopup(false)}
          />
        )}
 
      {/* ── Profile Update Popup ── */}
      {showProfileUpdatePopup && (
        <ProfileUpdatePopup
          latestCompany={latestPopupCompany}
          onDismiss={() => setShowProfileUpdatePopup(false)}
          onView={() => {
            setShowProfileUpdatePopup(false);
            handleNavigate('notifications');
          }}
        />
      )}
    </div>
  );
};
 
export default AdminDashboard;