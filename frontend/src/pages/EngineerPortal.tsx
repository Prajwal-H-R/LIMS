import React, { useState, useEffect, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { 
  Wrench, FileText, Award, ClipboardList, AlertTriangle, 
  ArrowRight, Mail, Download, Briefcase, ChevronLeft, XCircle
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { User } from "../types";
import { api, ENDPOINTS } from "../api/config";

// --- Import page components ---
import { CreateInwardPage } from "../components/CreateInwardPage"; 
import { ViewUpdateInward } from "../components/ViewUpdateInward";
import { ViewInward } from "../components/ViewInward";
import { PrintStickers } from "../components/PrintStickers";
import { InwardForm } from "../components/InwardForm";
import SrfDetailPage  from "../components/SrfDetailPage"; 
import { DelayedEmailManager } from "../components/DelayedEmailManager";
import { FailedNotificationsManager } from "../components/FailedNotificationManager";
import ExportInwardPage from "../components/ExportInwardPage";
import SrfListPage from "../components/SrfListPage";
import JobsManagementPage from "../components/JobsManagementPage";
import CalibrationPage from "../components/CalibrationPage";
import UncertaintyBudgetPage from '../components/UncertaintyBudgetPage';
import { CertificatesPage } from "../components/CertificatesPage";
import ProfilePage from "../components/ProfilePage";

// --- Interfaces ---
interface EngineerPortalProps {
  user: User | null;
  onLogout: () => void;
}
interface DelayedTask { task_id: number; }
interface FailedNotification { id: number; }
interface AvailableDraft { inward_id: number; }
interface ReviewedFir { inward_id: number; }
interface FailedNotificationsResponse {
  failed_notifications: FailedNotification[];
}

interface EngineerNotificationItem {
  id: number;
  subject: string;
  body_text?: string | null;
  created_at: string;
  status: string;
  error?: string | null;
}

interface EngineerNotificationsResponse {
  notifications: EngineerNotificationItem[];
}

const extractCompanyFromNotification = (notification?: EngineerNotificationItem | null): string | null => {
  if (!notification) return null;
  const bodyMatch = notification.body_text?.match(/Company:\s*([^|]+)/i);
  if (bodyMatch?.[1]?.trim()) return bodyMatch[1].trim();
  const subjectMatch = notification.subject?.match(/\(Company:\s*([^)]+)\)/i);
  if (subjectMatch?.[1]?.trim()) return subjectMatch[1].trim();
  return null;
};

// Interface for Expiry Check
interface ExpiryCheckResponse {
    message: string;
    affected_tables: string[];
}

// --- HELPER FUNCTIONS ---
const formatTableName = (tableName: string) => {
    return tableName
      .replace('htw_', '')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
};

const DeviationPage = () => {
  const navigate = useNavigate();
  return (
    <div className="p-8 bg-white rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">View Deviations</h2>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900 font-medium text-sm transition-all shadow-sm"
        >
          <ChevronLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>
      <p className="text-gray-500">Deviation View Page Content</p>
    </div>
  );
};

// --- SKELETON LOADING COMPONENT ---
const DashboardSkeleton = () => {
  return (
    <div className="animate-pulse w-full">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-slate-200 rounded-2xl"></div>
          <div className="space-y-3">
            <div className="h-8 w-64 bg-slate-200 rounded"></div>
            <div className="h-4 w-96 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>

      {/* Alert Banner Skeleton (Optional placeholder) */}
      <div className="h-24 w-full bg-slate-100 rounded-xl mb-6 border border-slate-200"></div>

      {/* Quick Actions Grid Skeleton */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <div className="h-8 w-48 bg-slate-200 rounded mb-6 border-b pb-3"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6, 7].map((item) => (
            <div key={item} className="p-6 rounded-2xl border border-gray-100 bg-white flex items-center">
              <div className="h-14 w-14 bg-slate-200 rounded-xl mr-4 shadow-sm"></div>
              <div className="flex-1 space-y-3">
                <div className="h-6 w-32 bg-slate-200 rounded"></div>
                <div className="h-4 w-full bg-slate-200 rounded"></div>
              </div>
              <div className="ml-4 h-6 w-6 bg-slate-200 rounded-full"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ActionButton: React.FC<{
  label: string; 
  description: string; 
  icon: React.ReactNode; 
  onClick: () => void; 
  colorClasses: string; 
  badge?: number;
}> = ({ label, description, icon, onClick, colorClasses, badge }) => (
  <button 
    onClick={onClick} 
    className="group relative p-6 rounded-2xl text-left transition-all duration-300 transform hover:scale-[1.02] border border-gray-100 bg-white hover:border-blue-500 hover:shadow-xl shadow-md"
  >
    <div className="flex items-start">
      <div className={`p-3 rounded-xl text-white mr-4 shadow-lg ${colorClasses} group-hover:shadow-2xl transition-shadow duration-300 relative`}>
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold border-2 border-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <div className="flex-1">
        <h3 className="text-xl font-bold text-gray-900 mb-1">{label}</h3>
        <p className="text-gray-600 text-sm">{description}</p>
      </div>
      <ArrowRight className="ml-4 h-6 w-6 text-gray-400 group-hover:text-blue-600 transition-colors duration-300" />
    </div>
  </button>
);


const EngineerDashboard: React.FC = () => {
  const navigate = useNavigate();
  
  const [pendingEmailCount, setPendingEmailCount] = useState(0);
  const [failedNotificationCount, setFailedNotificationCount] = useState(0);
  const [showDelayedEmails, setShowDelayedEmails] = useState(false);
  const [showFailedNotifications, setShowFailedNotifications] = useState(false);
  const [availableDrafts, setAvailableDrafts] = useState<AvailableDraft[]>([]);
  const [reviewedFirCount, setReviewedFirCount] = useState(0);
  
  // State for expired standards (Kept for Notification Banner only)
  const [expiredStandards, setExpiredStandards] = useState<string[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setIsLoading(true);
    try {
      const timestamp = new Date().getTime();
      const todayStr = new Date().toISOString().split('T')[0];

      const [pendingEmailsRes, failedNotifsRes, draftsRes, reviewedFirsRes, expiryRes] = await Promise.allSettled([
        api.get<DelayedTask[]>(`${ENDPOINTS.STAFF.INWARDS}/delayed-emails/pending?_t=${timestamp}`),
        api.get<FailedNotificationsResponse>(`${ENDPOINTS.STAFF.INWARDS}/notifications/failed?_t=${timestamp}`),
        api.get<AvailableDraft[]>(`${ENDPOINTS.STAFF.INWARDS}/drafts?_t=${timestamp}`), 
        api.get<ReviewedFir[]>(`${ENDPOINTS.STAFF.INWARDS}/reviewed-firs?_t=${timestamp}`),
        // We still check expiry to show the alert banner, but we won't block the button
        api.post<ExpiryCheckResponse>('/calibration/check-expiry', { reference_date: todayStr })
      ]);

      if (pendingEmailsRes.status === 'fulfilled') setPendingEmailCount(pendingEmailsRes.value.data.length);
      if (failedNotifsRes.status === 'fulfilled') setFailedNotificationCount(failedNotifsRes.value.data.failed_notifications.length);
      if (draftsRes.status === 'fulfilled') setAvailableDrafts(draftsRes.value.data || []);
      if (reviewedFirsRes.status === 'fulfilled') setReviewedFirCount(reviewedFirsRes.value.data.length);
      
      // Handle Expiry Response for the Banner
      if (expiryRes.status === 'fulfilled' && expiryRes.value.data) {
        if ('affected_tables' in expiryRes.value.data && Array.isArray(expiryRes.value.data.affected_tables)) {
            setExpiredStandards(expiryRes.value.data.affected_tables);
        } else if (Array.isArray(expiryRes.value.data)) {
            setExpiredStandards(expiryRes.value.data as unknown as string[]);
        } else {
            setExpiredStandards([]);
        }
      }

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      if (isInitialLoad) {
        setTimeout(() => setIsLoading(false), 300);
      }
    }
  }, []);

  useEffect(() => {
    fetchDashboardData(true);
    const onFocus = () => fetchDashboardData(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchDashboardData]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const hasActiveTasks = pendingEmailCount > 0 || failedNotificationCount > 0;
    if (hasActiveTasks) {
      interval = setInterval(() => fetchDashboardData(false), 5000);
    } 
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pendingEmailCount, failedNotificationCount, fetchDashboardData]);

  const quickActions = [
    { 
        label: "Create Inward", 
        description: "Process incoming equipment and SRF items", 
        icon: <ClipboardList className="h-8 w-8" />, 
        route: "create-inward", 
        colorClasses: "bg-gradient-to-r from-blue-500 to-indigo-600", 
        badge: availableDrafts.length 
    },
    { 
        label: "View & Update Inward", 
        description: "Manage existing inward entries and SRFs", 
        icon: <Wrench className="h-8 w-8" />, 
        route: "view-inward", 
        colorClasses: "bg-gradient-to-r from-cyan-500 to-blue-600", 
        badge: reviewedFirCount 
    },
    { 
        label: "Export Inward", 
        description: "Filter and export updated inward records", 
        icon: <Download className="h-8 w-8" />, 
        route: "export-inward", 
        colorClasses: "bg-gradient-to-r from-indigo-500 to-purple-600" 
    },
    { 
        label: "SRF Management", 
        description: "View and manage Service Request Forms", 
        icon: <FileText className="h-8 w-8" />, 
        route: "srfs", 
        colorClasses: "bg-gradient-to-r from-green-500 to-emerald-600" 
    },
    { 
        label: "Jobs Management", 
        // Logic removed: Always active, standard description
        description: "Manage calibration jobs and job status", 
        icon: <Briefcase className="h-8 w-8" />, 
        route: "jobs", 
        colorClasses: "bg-gradient-to-r from-teal-500 to-cyan-600"
    },
    { 
        label: "View Deviations", 
        description: "Access deviation reports", 
        icon: <AlertTriangle className="h-8 w-8" />, 
        route: "deviations", 
        colorClasses: "bg-gradient-to-r from-orange-500 to-red-500" 
    },
    { 
        label: "Certificates", 
        description: "Generate and manage certificates", 
        icon: <Award className="h-8 w-8" />, 
        route: "certificates", 
        colorClasses: "bg-gradient-to-r from-purple-500 to-indigo-600" 
    },
  ];

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-lg">
            <Wrench className="h-10 w-10 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Engineer Portal</h1>
            <p className="mt-1 text-base text-gray-600">Manage calibration jobs, certificates, and equipment intake</p>
          </div>
        </div>
      </div>

      {/* --- EXPIRED STANDARDS ALERT (Informational Only) --- */}
      {expiredStandards.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 shadow-lg animate-fade-in relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <AlertTriangle className="w-32 h-32 text-red-600" />
           </div>
           <div className="relative z-10 flex items-start gap-4">
            <div className="p-3 bg-red-100 rounded-full flex-shrink-0">
               <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 mb-2">Attention: Master Standards Expired</h3>
              <p className="text-red-800 text-sm mb-3 font-medium">
                The following master standards have expired. Please be aware that creating new jobs may be restricted in the Jobs module until these are updated by an administrator.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                 {expiredStandards.map((table, idx) => (
                    <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-white border border-red-200 text-red-700 shadow-sm">
                        <XCircle size={12} className="mr-1.5" />
                        {formatTableName(table)}
                    </span>
                 ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingEmailCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6 shadow-lg animate-fade-in">
          <div className="flex items-start gap-4">
            <Mail className="h-6 w-6 text-orange-600 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-orange-900 mb-2">Scheduled Email Reminders ({pendingEmailCount})</h3>
              <p className="text-orange-800 text-sm mb-3">You have {pendingEmailCount} email(s) scheduled. Manage or send them immediately.</p>
              <button onClick={() => setShowDelayedEmails(true)} className="bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-700 transition-colors text-sm">Manage Scheduled Emails</button>
            </div>
          </div>
        </div>
      )}

      {failedNotificationCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 shadow-lg animate-fade-in">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-red-600 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-900 mb-2">Failed Email Notifications ({failedNotificationCount})</h3>
              <p className="text-red-800 text-sm mb-3">Some email notifications failed to send. Please review and retry them.</p>
              <button onClick={() => setShowFailedNotifications(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm">Review Failed Emails</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b pb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {quickActions.map((action) => (
            <ActionButton 
                key={action.label} 
                {...action} 
                onClick={() => navigate(action.route)} 
            />
          ))}
        </div>
      </div>

      {showDelayedEmails && <DelayedEmailManager onClose={() => { setShowDelayedEmails(false); fetchDashboardData(true); }} />}
      {showFailedNotifications && <FailedNotificationsManager onClose={() => { setShowFailedNotifications(false); fetchDashboardData(true); }} />}
    </div>
  );
};

// --- 2. MAIN LAYOUT COMPONENT ---
const EngineerPortal: React.FC<EngineerPortalProps> = ({ user, onLogout }) => {
  const username = user?.full_name || user?.email || "Engineer";
  const navigate = useNavigate();
  const location = useLocation();
  const [profileUpdateNotifications, setProfileUpdateNotifications] = useState<EngineerNotificationItem[]>([]);
  const [profileUpdateLoading, setProfileUpdateLoading] = useState(false);
  const [profileUpdateError, setProfileUpdateError] = useState<string | null>(null);
  const [showProfileUpdatePopup, setShowProfileUpdatePopup] = useState(false);
  const PROFILE_UPDATE_LAST_SEEN_KEY = "engineer_profile_update_last_seen_id";
  const latestPopupCompany = extractCompanyFromNotification(profileUpdateNotifications[0]);

  const fetchProfileUpdateNotifications = useCallback(async () => {
    setProfileUpdateLoading(true);
    setProfileUpdateError(null);
    try {
      const res = await api.get<EngineerNotificationsResponse>(ENDPOINTS.NOTIFICATIONS);
      const notifications = res.data.notifications || [];
      setProfileUpdateNotifications(notifications);
      const newestId = notifications[0]?.id;
      const lastSeenId = Number(localStorage.getItem(PROFILE_UPDATE_LAST_SEEN_KEY) || "0");
      if (newestId && newestId > lastSeenId) {
        setShowProfileUpdatePopup(true);
        localStorage.setItem(PROFILE_UPDATE_LAST_SEEN_KEY, String(newestId));
      }
    } catch (e: unknown) {
      const maybeMsg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setProfileUpdateError(maybeMsg || "Failed to load notifications.");
    } finally {
      setProfileUpdateLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileUpdateNotifications();
    const interval = setInterval(fetchProfileUpdateNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchProfileUpdateNotifications]);

  useEffect(() => {
    if (location.pathname.includes("/engineer/notifications")) {
      setShowProfileUpdatePopup(false);
    }
  }, [location.pathname]);

  const EngineerNotificationsPage: React.FC = () => (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          <p className="text-gray-500 mt-1 text-sm">Customer profile updates from customer portal.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ChevronLeft size={16} /> Back
        </button>
      </div>
      {profileUpdateLoading && <div className="text-gray-500">Loading notifications...</div>}
      {!profileUpdateLoading && profileUpdateError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">{profileUpdateError}</div>
      )}
      {!profileUpdateLoading && !profileUpdateError && profileUpdateNotifications.length === 0 && (
        <div className="p-4 bg-white border border-gray-200 rounded-xl text-gray-500">No notifications yet.</div>
      )}
      {!profileUpdateLoading && !profileUpdateError && profileUpdateNotifications.length > 0 && (
        <div className="space-y-3">
          {profileUpdateNotifications.map((n) => (
            <div key={n.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{n.subject}</h3>
                  {n.body_text && <p className="text-sm text-gray-600 mt-1">{n.body_text}</p>}
                </div>
                <span className="text-xs text-gray-500">{new Date(n.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header
        username={username}
        role="Engineer"
        onLogout={onLogout}
        profilePath="/engineer/profile"
        notificationsPath="/engineer/notifications"
      />
      <main className="flex-1 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 w-full">
        <Routes>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<EngineerNotificationsPage />} />
          <Route path="/" element={<EngineerDashboard />} />
          <Route path="create-inward" element={<CreateInwardPage />} />
          <Route path="create-inward/form" element={<InwardForm />} />
          <Route path="view-inward" element={<ViewUpdateInward />} />
          <Route path="view-inward/:id" element={<ViewInward />} />
          <Route path="edit-inward/:id" element={<InwardForm initialDraftId={null} />} />
          <Route path="print-stickers/:id" element={<PrintStickers />} />
          <Route path="export-inward" element={<ExportInwardPage />} />
          <Route path="srfs" element={<SrfListPage />} />
          <Route path="srfs/:srfId" element={<SrfDetailPage />} />
          <Route path="jobs" element={<JobsManagementPage />} />
          <Route path="calibration/:inwardId/:equipmentId" element={<CalibrationPage />} />
          <Route path="uncertainty-budget/:inwardId/:equipmentId" element={<UncertaintyBudgetPage />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="deviations" element={<DeviationPage />} />
        </Routes>
      </main>
      <Footer />
      {showProfileUpdatePopup && (
        <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-gray-900">New Customer Profile Update</h3>
                <p className="text-gray-600 mt-2 text-sm">
                  {latestPopupCompany ? (
                    <>
                      <span className="font-semibold text-gray-900">{latestPopupCompany}</span> updated customer profile details. Open Notifications to review the changes.
                    </>
                  ) : (
                    "A customer updated their profile details. Open Notifications to review the changes."
                  )}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowProfileUpdatePopup(false)}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProfileUpdatePopup(false);
                  navigate("/engineer/notifications");
                }}
                className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                View Notifications
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EngineerPortal;