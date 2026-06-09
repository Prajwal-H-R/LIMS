import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wrench, FileText, Award, ClipboardList, AlertTriangle,
  ArrowRight, Mail, Download, Briefcase, XCircle,
  Loader2, FileUp, PackageSearch
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";
import { DelayedEmailManager } from "./DelayedEmailManager";
import { FailedNotificationsManager } from "./FailedNotificationManager";

// --- INTERFACES ---
interface DelayedTask {
  task_id: number;
}
interface FailedNotification {
  id: number;
}
interface AvailableDraft {
  inward_id: number;
}
interface ReviewedFir {
  inward_id: number;
}
interface FailedNotificationsResponse {
  failed_notifications: FailedNotification[];
}
interface ExpiryCheckResponse {
  message: string;
  affected_tables: string[];
}

// --- HELPERS ---
const formatTableName = (tableName: string) => {
  return tableName
    .replace("htw_", "")
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
};

// --- SKELETON ---
const DashboardSkeleton: React.FC = () => (
  <div className="animate-pulse w-full">
    <div className="flex items-center justify-between mb-10">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 bg-slate-200 rounded-2xl" />
        <div className="space-y-3">
          <div className="h-8 w-64 bg-slate-200 rounded" />
          <div className="h-4 w-96 bg-slate-200 rounded" />
        </div>
      </div>
    </div>
    <div className="h-24 w-full bg-slate-100 rounded-xl mb-6 border border-slate-200" />
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
      <div className="h-8 w-48 bg-slate-200 rounded mb-6 border-b pb-3" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3, 4, 5].map((item) => (
          <div
            key={item}
            className="p-6 rounded-2xl border border-gray-100 bg-white flex items-center"
          >
            <div className="h-14 w-14 bg-slate-200 rounded-xl mr-4 shadow-sm" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-32 bg-slate-200 rounded" />
              <div className="h-4 w-full bg-slate-200 rounded" />
            </div>
            <div className="ml-4 h-6 w-6 bg-slate-200 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

// --- ACTION BUTTON ---
const ActionButton: React.FC<{
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  colorClasses: string;
  badge?: number;
}> = ({
  label,
  description,
  icon,
  onClick,
  colorClasses,
  badge,
}) => (
  <button
    onClick={onClick}
    className="group relative p-6 rounded-2xl text-left transition-all duration-300 transform hover:scale-[1.02] border border-gray-100 bg-white hover:border-blue-500 hover:shadow-xl shadow-md"
  >
    <div className="flex items-start">
      <div
        className={`p-3 rounded-xl text-white mr-4 shadow-lg ${colorClasses} group-hover:shadow-2xl transition-shadow duration-300 relative`}
      >
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold border-2 border-white animate-pulse">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <div className="flex-1">
        <h3 className="text-xl font-bold text-gray-900 mb-1">
          {label}
        </h3>
        <p className="text-gray-600 text-sm">
          {description}
        </p>
      </div>
      <ArrowRight className="ml-4 h-6 w-6 text-gray-400 group-hover:text-blue-600 transition-colors duration-300" />
    </div>
  </button>
);

// ============================================================
// ENGINEER DASHBOARD
// ============================================================
const EngineerDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [pendingEmailCount, setPendingEmailCount] = useState(0);
  const [failedNotificationCount, setFailedNotificationCount] = useState(0);
  const [showDelayedEmails, setShowDelayedEmails] = useState(false);
  const [showFailedNotifications, setShowFailedNotifications] = useState(false);
  const [availableDrafts, setAvailableDrafts] = useState<AvailableDraft[]>([]);
  const [reviewedFirCount, setReviewedFirCount] = useState(0);
  const [expiredStandards, setExpiredStandards] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = useCallback(
    async (isInitialLoad = false) => {
      if (isInitialLoad) setIsLoading(true);
      try {
        const timestamp = new Date().getTime();
        const todayStr = new Date().toISOString().split("T")[0];

        const [
          pendingEmailsRes,
          failedNotifsRes,
          draftsRes,
          reviewedFirsRes,
          expiryRes,
        ] = await Promise.allSettled([
          api.get<DelayedTask[]>(`${ENDPOINTS.STAFF.INWARDS}/delayed-emails/pending?_t=${timestamp}`),
          api.get<FailedNotificationsResponse>(`${ENDPOINTS.STAFF.INWARDS}/notifications/failed?_t=${timestamp}`),
          api.get<AvailableDraft[]>(`${ENDPOINTS.STAFF.INWARDS}/drafts?_t=${timestamp}`),
          api.get<ReviewedFir[]>(`${ENDPOINTS.STAFF.INWARDS}/reviewed-firs?_t=${timestamp}`),
          api.post<ExpiryCheckResponse>("/calibration/check-expiry", { reference_date: todayStr }),
        ]);

        if (pendingEmailsRes.status === "fulfilled") setPendingEmailCount(pendingEmailsRes.value.data.length);
        if (failedNotifsRes.status === "fulfilled") setFailedNotificationCount(failedNotifsRes.value.data.failed_notifications.length);
        if (draftsRes.status === "fulfilled") setAvailableDrafts(draftsRes.value.data || []);
        if (reviewedFirsRes.status === "fulfilled") setReviewedFirCount(reviewedFirsRes.value.data.length);

        if (expiryRes.status === "fulfilled" && expiryRes.value.data) {
          const data = expiryRes.value.data;
          setExpiredStandards(Array.isArray(data.affected_tables) ? data.affected_tables : (Array.isArray(data) ? data : []));
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        if (isInitialLoad) {
          setTimeout(() => setIsLoading(false), 300);
        }
      }
    },
    []
  );

  useEffect(() => {
    fetchDashboardData(true);
    const onFocus = () => fetchDashboardData(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchDashboardData]);

  const quickActions = [
    {
      label: "Inward Management",
      description: "Manage equipment entry, updates, and reporting from one place",
      icon: <PackageSearch className="h-8 w-8" />,
      route: "inward-management",
      colorClasses: "bg-gradient-to-r from-blue-600 to-indigo-700",
      // Combine badges for drafts and reviewed FIRs
      badge: (availableDrafts.length || 0) + (reviewedFirCount || 0),
    },
    {
      label: "SRF Management",
      description: "View and manage Service Request Forms",
      icon: <FileText className="h-8 w-8" />,
      route: "srfs",
      colorClasses: "bg-gradient-to-r from-green-500 to-emerald-600",
    },
    {
      label: "Jobs Management",
      description: "Manage calibration jobs and job status",
      icon: <Briefcase className="h-8 w-8" />,
      route: "jobs",
      colorClasses: "bg-gradient-to-r from-teal-500 to-cyan-600",
    },
    {
      label: "Manual Calibration",
      description: "Process manual equipment calibration entries",
      icon: <FileUp className="h-8 w-8" />,
      route: "manual-calibration",
      colorClasses: "bg-gradient-to-r from-slate-500 to-slate-700",
    },
    {
      label: "View Deviations",
      description: "Access and manage deviation reports",
      icon: <AlertTriangle className="h-8 w-8" />,
      route: "deviations",
      colorClasses: "bg-gradient-to-r from-orange-500 to-red-500",
    },
    {
      label: "Certificates",
      description: "Generate and manage equipment certificates",
      icon: <Award className="h-8 w-8" />,
      route: "certificates",
      colorClasses: "bg-gradient-to-r from-purple-500 to-indigo-600",
    },
  ];

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-lg">
            <Wrench className="h-10 w-10 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Engineer Portal
            </h1>
            <p className="mt-1 text-base text-gray-600">
              Manage calibration jobs, certificates, and equipment intake
            </p>
          </div>
        </div>
      </div>

      {/* Expired Standards Warning */}
      {expiredStandards.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 shadow-lg relative overflow-hidden">
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
                The following master standards have expired. Creating new jobs may be restricted.
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

      {/* Notifications Banners (Delayed Emails & Failed Notifs) */}
      <div className="space-y-4 mb-6">
        {pendingEmailCount > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 shadow-md flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Mail className="h-6 w-6 text-orange-600" />
              <div>
                <p className="font-semibold text-orange-900">Scheduled Emails: {pendingEmailCount}</p>
                <p className="text-sm text-orange-800">You have emails waiting to be sent.</p>
              </div>
            </div>
            <button onClick={() => setShowDelayedEmails(true)} className="bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-700 text-sm transition-colors">
              Manage
            </button>
          </div>
        )}

        {failedNotificationCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 shadow-md flex items-center justify-between">
            <div className="flex items-center gap-4">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <div>
                <p className="font-semibold text-red-900">Failed Notifications: {failedNotificationCount}</p>
                <p className="text-sm text-red-800">Review failed email notifications.</p>
              </div>
            </div>
            <button onClick={() => setShowFailedNotifications(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 text-sm transition-colors">
              Review
            </button>
          </div>
        )}
      </div>

      {/* Quick Actions Grid */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b pb-3">
          Quick Actions
        </h2>
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

      {/* Modals */}
      {showDelayedEmails && (
        <DelayedEmailManager onClose={() => { setShowDelayedEmails(false); fetchDashboardData(true); }} />
      )}
      {showFailedNotifications && (
        <FailedNotificationsManager onClose={() => { setShowFailedNotifications(false); fetchDashboardData(true); }} />
      )}
    </div>
  );
};

export default EngineerDashboard;