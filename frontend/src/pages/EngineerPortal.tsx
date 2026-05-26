import React, {
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Wrench,
  FileText,
  Award,
  ClipboardList,
  Download,
  Briefcase,
  FileUp,
  Bell,
  UserCog,
  LogOut,
  Menu,
  LayoutDashboard,
  Settings,
  Zap,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { User } from "../types";
import { api, ENDPOINTS } from "../api/config";

// --- Page Components ---
import { CreateInwardPage } from "../components/CreateInwardPage";
import { ViewUpdateInward } from "../components/ViewUpdateInward";
import { ViewInward } from "../components/ViewInward";
import { PrintStickers } from "../components/PrintStickers";
import { InwardForm } from "../components/InwardForm";
import SrfDetailPage from "../components/SrfDetailPage";
import ExportInwardPage from "../components/ExportInwardPage";
import SrfListPage from "../components/SrfListPage";
import JobsManagementPage from "../components/JobsManagementPage";
import CalibrationPage from "../components/CalibrationPage";
import UncertaintyBudgetPage from "../components/UncertaintyBudgetPage";
import { CertificatesPage } from "../components/CertificatesPage";
import ProfilePage from "../components/ProfilePage";
import ManualCalibrationPage from "../components/ManualCalibrationPage";
import { FinalInspectionView } from "../components/FinalInspectionView";
import CalibrationReminderWidget from "../components/CalibrationReminder";
import CalibrationReminderDetailsPage from "../components/CalibrationReminderDetailsPage";

// --- Split Components ---
import EngineerDashboard from "../components/EngineerDashboard";
import {
  DeviationPage,
  SrfDeviationRecordsPage,
  DeviationDetailPage,
} from "../components/DeviationComponents";

// ── Interfaces ────────────────────────────────────────────────────

interface EngineerPortalProps {
  user: User | null;
  onLogout: () => void;
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

// ── Helpers ───────────────────────────────────────────────────────

const extractCompanyFromNotification = (
  notification?: EngineerNotificationItem | null
): string | null => {
  if (!notification) return null;
  const bodyMatch = notification.body_text?.match(
    /Company:\s*([^|]+)/i
  );
  if (bodyMatch?.[1]?.trim())
    return bodyMatch[1].trim();
  const subjectMatch = notification.subject?.match(
    /\(Company:\s*([^)]+)\)/i
  );
  if (subjectMatch?.[1]?.trim())
    return subjectMatch[1].trim();
  return null;
};

// ── Active section resolver ───────────────────────────────────────

const getActiveSectionFromPath = (
  pathname: string
): string => {
  if (
    pathname === "/engineer" ||
    pathname === "/engineer/"
  )
    return "dashboard";
  if (pathname.includes("/engineer/profile"))
    return "profile";
  if (pathname.includes("/engineer/notifications"))
    return "notifications";
  if (pathname.includes("/engineer/settings"))
    return "settings";
  if (pathname.includes("/engineer/create-inward"))
    return "create-inward";
  if (pathname.includes("/engineer/view-inward"))
    return "view-inward";
  if (pathname.includes("/engineer/export-inward"))
    return "export-inward";
  if (pathname.includes("/engineer/srfs"))
    return "srfs";
  if (pathname.includes("/engineer/jobs"))
    return "jobs";
  if (
    pathname.includes("/engineer/manual-calibration")
  )
    return "manual-calibration";
  if (pathname.includes("/engineer/deviations"))
    return "deviations";
  if (pathname.includes("/engineer/certificates"))
    return "certificates";
  return "dashboard";
};

// ── Quick Action items ────────────────────────────────────────────

interface QuickActionItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  route: string;
}

const quickActionItems: QuickActionItem[] = [
  {
    id: "create-inward",
    label: "Create Inward",
    icon: <ClipboardList size={18} />,
    route: "/engineer/create-inward",
  },
  {
    id: "view-inward",
    label: "View & Update",
    icon: <Wrench size={18} />,
    route: "/engineer/view-inward",
  },
  {
    id: "export-inward",
    label: "Export Inward",
    icon: <Download size={18} />,
    route: "/engineer/export-inward",
  },
  {
    id: "srfs",
    label: "SRF Management",
    icon: <FileText size={18} />,
    route: "/engineer/srfs",
  },
  {
    id: "jobs",
    label: "Jobs Management",
    icon: <Briefcase size={18} />,
    route: "/engineer/jobs",
  },
  {
    id: "manual-calibration",
    label: "Manual Calibration",
    icon: <FileUp size={18} />,
    route: "/engineer/manual-calibration",
  },
  {
    id: "deviations",
    label: "Deviations",
    icon: <AlertTriangle size={18} />,
    route: "/engineer/deviations",
  },
  {
    id: "certificates",
    label: "Certificates",
    icon: <Award size={18} />,
    route: "/engineer/certificates",
  },
];

// ── Sidebar ───────────────────────────────────────────────────────

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
  activeSection: string;
  onNavigate: (route: string) => void;
  notificationCount: number;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  setIsOpen,
  activeSection,
  onNavigate,
  notificationCount,
  onLogout,
}) => {
  const [hoveredItem, setHoveredItem] = useState<{
    label: string;
    top: number;
  } | null>(null);

  const [quickActionsExpanded, setQuickActionsExpanded] =
    useState(true);

  // Auto-expand Quick Actions if the active section is one of them
  useEffect(() => {
    const isQuickAction = quickActionItems.some(
      (item) => item.id === activeSection
    );
    if (isQuickAction) {
      setQuickActionsExpanded(true);
    }
  }, [activeSection]);

  // ── Nav definitions ───────────────────────────────────────────

  const mainNavItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={20} />,
      route: "/engineer",
    },
    {
      id: "profile",
      label: "My Profile",
      icon: <UserCog size={20} />,
      route: "/engineer/profile",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: <Bell size={20} />,
      route: "/engineer/notifications",
    },
  ];

  // ── Tooltip handlers ──────────────────────────────────────────

  const handleMouseEnter = (
    e: React.MouseEvent<
      HTMLButtonElement | HTMLDivElement
    >,
    label: string
  ) => {
    if (isOpen) return;
    const rect =
      e.currentTarget.getBoundingClientRect();
    setHoveredItem({
      label,
      top: rect.top + rect.height / 2,
    });
  };

  // ── Nav button renderer ───────────────────────────────────────

  const renderNavButton = (item: {
    id: string;
    label: string;
    icon: React.ReactNode;
    route: string;
  }) => {
    const isActive = activeSection === item.id;
    const showBadge =
      item.id === "notifications" &&
      notificationCount > 0;
    const badgeLabel =
      notificationCount > 99
        ? "99+"
        : notificationCount;

    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.route)}
        onMouseEnter={(e) =>
          handleMouseEnter(e, item.label)
        }
        onMouseLeave={() => setHoveredItem(null)}
        className={`
          w-full flex items-center px-3 py-3 my-1
          rounded-xl transition-all duration-200
          group relative
          ${isOpen ? "justify-start" : "justify-center"}
          ${
            isActive
              ? "bg-blue-600 text-white shadow-md shadow-blue-200/50"
              : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          }
        `}
      >
        <div
          className={`flex-shrink-0 transition-colors duration-200 ${
            isActive
              ? "text-white"
              : "text-gray-400 group-hover:text-gray-600"
          }`}
        >
          {item.icon}
        </div>

        {showBadge && !isOpen && (
          <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] font-bold text-center">
            {badgeLabel}
          </span>
        )}

        <span
          className={`
            ml-3 text-sm font-medium whitespace-nowrap
            transition-all duration-300 origin-left
            flex-1 text-left
            ${
              isOpen
                ? "opacity-100 w-auto translate-x-0"
                : "opacity-0 w-0 -translate-x-4 overflow-hidden hidden"
            }
          `}
        >
          {item.label}
        </span>

        {showBadge && isOpen && (
          <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] font-bold text-center">
            {badgeLabel}
          </span>
        )}
      </button>
    );
  };

  // ── Quick action sub-item renderer ────────────────────────────

  const renderQuickActionItem = (
    item: QuickActionItem
  ) => {
    const isActive = activeSection === item.id;

    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.route)}
        onMouseEnter={(e) =>
          handleMouseEnter(e, item.label)
        }
        onMouseLeave={() => setHoveredItem(null)}
        className={`
          w-full flex items-center py-2.5 my-0.5
          rounded-lg transition-all duration-200
          group relative
          ${
            isOpen
              ? "px-3 pl-5 justify-start"
              : "px-3 justify-center"
          }
          ${
            isActive
              ? "bg-blue-50 text-blue-700 font-semibold"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
          }
        `}
      >
        {isActive && isOpen && (
          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 rounded-full" />
        )}

        <div
          className={`flex-shrink-0 transition-colors duration-200 ${
            isActive
              ? "text-blue-600"
              : "text-gray-400 group-hover:text-gray-500"
          }`}
        >
          {item.icon}
        </div>

        <span
          className={`
            ml-3 text-sm whitespace-nowrap
            transition-all duration-300 origin-left
            flex-1 text-left
            ${
              isOpen
                ? "opacity-100 w-auto translate-x-0"
                : "opacity-0 w-0 -translate-x-4 overflow-hidden hidden"
            }
          `}
        >
          {item.label}
        </span>
      </button>
    );
  };

  // ── Quick Actions group header ────────────────────────────────

  const renderQuickActionsGroup = () => {
    const hasActiveChild = quickActionItems.some(
      (item) => item.id === activeSection
    );

    if (isOpen) {
      return (
        <div className="mt-4">
          <button
            onClick={() =>
              setQuickActionsExpanded(
                !quickActionsExpanded
              )
            }
            className={`
              w-full flex items-center justify-between
              px-3 py-2.5 rounded-xl transition-all duration-200
              group
              ${
                hasActiveChild && !quickActionsExpanded
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex-shrink-0 transition-colors duration-200 ${
                  hasActiveChild &&
                  !quickActionsExpanded
                    ? "text-blue-600"
                    : "text-gray-400 group-hover:text-gray-600"
                }`}
              >
                <Zap size={20} />
              </div>
              <span className="text-sm font-medium">
                Quick Actions
              </span>
            </div>
            <div
              className={`transition-colors duration-200 ${
                hasActiveChild &&
                !quickActionsExpanded
                  ? "text-blue-500"
                  : "text-gray-400"
              }`}
            >
              {quickActionsExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </div>
          </button>

          <div
            className={`
              overflow-hidden transition-all duration-300 ease-in-out
              ${
                quickActionsExpanded
                  ? "max-h-[500px] opacity-100 mt-1"
                  : "max-h-0 opacity-0"
              }
            `}
          >
            <div className="ml-2 border-l-2 border-gray-100 pl-1">
              {quickActionItems.map(
                renderQuickActionItem
              )}
            </div>
          </div>
        </div>
      );
    }

    // Collapsed view
    return (
      <div className="mt-4">
        <div className="border-t border-gray-100 mx-2 mb-3" />

        <div
          onMouseEnter={(e) =>
            handleMouseEnter(e, "Quick Actions")
          }
          onMouseLeave={() => setHoveredItem(null)}
          className={`
            w-full flex items-center justify-center
            px-3 py-3 my-1 rounded-xl
            transition-all duration-200 cursor-pointer
            ${
              hasActiveChild
                ? "bg-blue-600 text-white shadow-md shadow-blue-200/50"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            }
          `}
          onClick={() => {
            setIsOpen(true);
            setQuickActionsExpanded(true);
          }}
        >
          <Zap
            size={20}
            className={
              hasActiveChild
                ? "text-white"
                : "text-gray-400"
            }
          />
        </div>

        {quickActionItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.route)}
              onMouseEnter={(e) =>
                handleMouseEnter(e, item.label)
              }
              onMouseLeave={() =>
                setHoveredItem(null)
              }
              className={`
                w-full flex items-center justify-center
                px-3 py-2.5 my-0.5 rounded-lg
                transition-all duration-200 group
                ${
                  isActive
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                }
              `}
            >
              {item.icon}
            </button>
          );
        })}
      </div>
    );
  };

  // ── Settings button ───────────────────────────────────────────

  const renderSettingsButton = () => {
    const isActive = activeSection === "settings";

    return (
      <button
        onClick={() =>
          onNavigate("/engineer/settings")
        }
        onMouseEnter={(e) =>
          handleMouseEnter(e, "Settings")
        }
        onMouseLeave={() => setHoveredItem(null)}
        className={`
          w-full flex items-center px-3 py-3 my-1
          rounded-xl transition-all duration-200
          group relative
          ${isOpen ? "justify-start" : "justify-center"}
          ${
            isActive
              ? "bg-blue-600 text-white shadow-md shadow-blue-200/50"
              : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          }
        `}
      >
        <div
          className={`flex-shrink-0 transition-colors duration-200 ${
            isActive
              ? "text-white"
              : "text-gray-400 group-hover:text-gray-600"
          }`}
        >
          <Settings size={20} />
        </div>
        <span
          className={`
            ml-3 text-sm font-medium whitespace-nowrap
            transition-all duration-300 origin-left
            flex-1 text-left
            ${
              isOpen
                ? "opacity-100 w-auto translate-x-0"
                : "opacity-0 w-0 -translate-x-4 overflow-hidden hidden"
            }
          `}
        >
          Settings
        </span>
      </button>
    );
  };

  // ── Logout button ─────────────────────────────────────────────

  const renderLogout = () => (
    <button
      onClick={onLogout}
      onMouseEnter={(e) =>
        handleMouseEnter(e, "Logout")
      }
      onMouseLeave={() => setHoveredItem(null)}
      className={`
        w-full flex items-center px-3 py-3 my-1
        rounded-xl transition-all duration-200
        group relative
        text-gray-500 hover:bg-red-50 hover:text-red-600
        ${isOpen ? "justify-start" : "justify-center"}
      `}
    >
      <div className="flex-shrink-0 text-gray-400 group-hover:text-red-500 transition-colors duration-200">
        <LogOut size={20} />
      </div>
      <span
        className={`
          ml-3 text-sm font-medium whitespace-nowrap
          transition-all duration-300 origin-left
          flex-1 text-left
          ${
            isOpen
              ? "opacity-100 w-auto translate-x-0"
              : "opacity-0 w-0 -translate-x-4 overflow-hidden hidden"
          }
        `}
      >
        Logout
      </span>
    </button>
  );

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      <aside
        className={`
          relative bg-white border-r border-gray-200
          flex flex-col h-full
          transition-all duration-300 ease-in-out
          ${isOpen ? "w-64" : "w-[4.5rem]"}
        `}
      >
        {/* Brand / Toggle */}
        <div
          className={`
            h-14 flex items-center px-4 flex-shrink-0
            bg-white border-b border-gray-50
            ${
              isOpen
                ? "justify-between"
                : "justify-center"
            }
          `}
        >
          {isOpen && (
            <div className="font-extrabold text-gray-800 text-lg tracking-tight truncate">
              Engineer
              <span className="text-blue-600">
                Portal
              </span>
            </div>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all border border-transparent hover:border-gray-100"
            title={
              isOpen
                ? "Collapse Sidebar"
                : "Expand Sidebar"
            }
          >
            {isOpen ? (
              <ChevronLeft size={20} />
            ) : (
              <Menu size={20} />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 py-4 px-3 overflow-y-auto
          overflow-x-hidden scrollbar-thin
          scrollbar-thumb-gray-200 flex flex-col"
        >
          {/* Main nav items */}
          <div className="space-y-1">
            {mainNavItems.map(renderNavButton)}
          </div>

          {/* Quick Actions — expandable/collapsible */}
          {renderQuickActionsGroup()}

          {/* Spacer pushes bottom items down */}
          <div className="flex-1" />

          {/* Bottom section */}
          <div className="border-t border-gray-100 mt-4 pt-2 space-y-1">
            {renderSettingsButton()}
            {renderLogout()}
          </div>
        </nav>
      </aside>

      {/* Tooltip (collapsed mode only) */}
      {!isOpen && hoveredItem && (
        <div
          className="fixed z-[150] px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg shadow-xl whitespace-nowrap pointer-events-none"
          style={{
            left: "5.2rem",
            top: hoveredItem.top,
            transform: "translateY(-50%)",
          }}
        >
          {hoveredItem.label}
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </>
  );
};

// ── Settings Page (Placeholder) ───────────────────────────────────

const SettingsPage: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-[50vh] text-gray-400 animate-fadeIn">
    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
      <Settings size={40} className="text-gray-400" />
    </div>
    <h2 className="text-2xl font-semibold text-gray-300">
      Settings Configuration
    </h2>
    <p className="text-gray-500 mt-2">Coming soon.</p>
  </div>
);

// ── Notifications Page ────────────────────────────────────────────

interface EngineerNotificationsPageProps {
  notifications: EngineerNotificationItem[];
  loading: boolean;
  error: string | null;
}

const EngineerNotificationsPage: React.FC<
  EngineerNotificationsPageProps
> = ({ notifications, loading, error }) => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Notifications
          </h2>
          <p className="text-gray-500 mt-1 text-sm">
            Customer profile updates from customer
            portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ChevronLeft size={16} /> Back
        </button>
      </div>

      {loading && (
        <div className="text-gray-500">
          Loading notifications...
        </div>
      )}

      {!loading && error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          {error}
        </div>
      )}

      {!loading &&
        !error &&
        notifications.length === 0 && (
          <div className="p-4 bg-white border border-gray-200 rounded-xl text-gray-500">
            No notifications yet.
          </div>
        )}

      {!loading &&
        !error &&
        notifications.length > 0 && (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {n.subject}
                    </h3>
                    {n.body_text && (
                      <p className="text-sm text-gray-600 mt-1">
                        {n.body_text}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(
                      n.created_at
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

// ── Engineer Portal (Main) ────────────────────────────────────────

const EngineerPortal: React.FC<EngineerPortalProps> = ({
  user,
  onLogout,
}) => {
  const username =
    user?.full_name || user?.email || "Engineer";
  const navigate = useNavigate();
  const location = useLocation();

  const [isSidebarOpen, setSidebarOpen] = useState(true);

  const activeSection = getActiveSectionFromPath(
    location.pathname
  );

  // ── Notification state ────────────────────────────────────────

  const PROFILE_UPDATE_LAST_SEEN_KEY =
    "engineer_profile_update_last_seen_id";

  const [
    profileUpdateNotifications,
    setProfileUpdateNotifications,
  ] = useState<EngineerNotificationItem[]>([]);
  const [profileUpdateLoading, setProfileUpdateLoading] =
    useState(false);
  const [profileUpdateError, setProfileUpdateError] =
    useState<string | null>(null);
  const [
    showProfileUpdatePopup,
    setShowProfileUpdatePopup,
  ] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const latestPopupCompany =
    extractCompanyFromNotification(
      profileUpdateNotifications[0]
    );

  const fetchProfileUpdateNotifications =
    useCallback(async () => {
      setProfileUpdateLoading(true);
      setProfileUpdateError(null);
      try {
        const res =
          await api.get<EngineerNotificationsResponse>(
            ENDPOINTS.NOTIFICATIONS
          );
        const notifications =
          res.data.notifications || [];
        setProfileUpdateNotifications(notifications);

        const newestId = notifications[0]?.id;
        const lastSeenId = Number(
          localStorage.getItem(
            PROFILE_UPDATE_LAST_SEEN_KEY
          ) || "0"
        );

        if (newestId && newestId > lastSeenId) {
          setShowProfileUpdatePopup(true);
          localStorage.setItem(
            PROFILE_UPDATE_LAST_SEEN_KEY,
            String(newestId)
          );
        }

        if (activeSection !== "notifications") {
          setUnreadCount(
            notifications.filter(
              (n) => n.id > lastSeenId
            ).length
          );
        } else {
          setUnreadCount(0);
          if (newestId)
            localStorage.setItem(
              PROFILE_UPDATE_LAST_SEEN_KEY,
              String(newestId)
            );
        }
      } catch (e: unknown) {
        const maybeMsg =
          e &&
          typeof e === "object" &&
          "response" in e
            ? (
                e as {
                  response?: {
                    data?: { detail?: string };
                  };
                }
              ).response?.data?.detail
            : null;
        setProfileUpdateError(
          maybeMsg || "Failed to load notifications."
        );
      } finally {
        setProfileUpdateLoading(false);
      }
    }, [activeSection]);

  useEffect(() => {
    fetchProfileUpdateNotifications();
    const interval = setInterval(
      fetchProfileUpdateNotifications,
      30000
    );
    return () => clearInterval(interval);
  }, [fetchProfileUpdateNotifications]);

  useEffect(() => {
    if (activeSection === "notifications") {
      setShowProfileUpdatePopup(false);
      setUnreadCount(0);
    }
  }, [activeSection]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fc] font-sans text-gray-900 overflow-hidden">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex-none w-full bg-white border-b border-gray-200 shadow-sm z-50">
        <Header
          username={username}
          role="Engineer"
          onLogout={onLogout}
          profilePath="/engineer/profile"
          notificationsPath="/engineer/notifications"
        />
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Sidebar ───────────────────────────────────────── */}
        <div className="flex-none h-full bg-white border-r border-gray-200 z-40">
          <Sidebar
            isOpen={isSidebarOpen}
            setIsOpen={setSidebarOpen}
            activeSection={activeSection}
            onNavigate={(route) => navigate(route)}
            notificationCount={unreadCount}
            onLogout={onLogout}
          />
        </div>

        {/* ── Main content ──────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50 relative z-0">
          <div className="flex flex-col min-h-full">
            <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
              <Routes>
                <Route
                  path="profile"
                  element={
                    <div className="animate-fadeIn w-full max-w-3xl mx-auto">
                      <ProfilePage />
                    </div>
                  }
                />
                <Route
                  path="notifications"
                  element={
                    <div className="animate-fadeIn">
                      <EngineerNotificationsPage
                        notifications={
                          profileUpdateNotifications
                        }
                        loading={
                          profileUpdateLoading
                        }
                        error={profileUpdateError}
                      />
                    </div>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <div className="animate-fadeIn">
                      <SettingsPage />
                    </div>
                  }
                />
                <Route
                  path="/"
                  element={
                    <div className="animate-fadeIn">
                      <EngineerDashboard />
                    </div>
                  }
                />
                <Route
                  path="create-inward"
                  element={<CreateInwardPage />}
                />
                <Route
                  path="create-inward/form"
                  element={<InwardForm />}
                />
                <Route
                  path="view-inward"
                  element={<ViewUpdateInward />}
                />
                <Route
                  path="view-inward/:id"
                  element={<ViewInward />}
                />
                <Route
                  path="edit-inward/:id"
                  element={
                    <InwardForm
                      initialDraftId={null}
                    />
                  }
                />
                <Route
                  path="print-stickers/:id"
                  element={<PrintStickers />}
                />
                <Route
                  path="export-inward"
                  element={<ExportInwardPage />}
                />
                <Route
                  path="srfs"
                  element={<SrfListPage />}
                />
                <Route
                  path="srfs/:srfId"
                  element={<SrfDetailPage />}
                />
                <Route
                  path="jobs"
                  element={<JobsManagementPage />}
                />
                <Route
                  path="manual-calibration"
                  element={
                    <ManualCalibrationPage />
                  }
                />
                <Route
                  path="calibration/:inwardId/:equipmentId"
                  element={<CalibrationPage />}
                />
                <Route
                  path="uncertainty-budget/:inwardId/:equipmentId"
                  element={
                    <UncertaintyBudgetPage />
                  }
                />
                <Route
                  path="certificates"
                  element={<CertificatesPage />}
                />
                <Route
                  path="deviations"
                  element={<DeviationPage />}
                />
                <Route
                  path="deviations/srf/:section/:srfKey"
                  element={
                    <SrfDeviationRecordsPage />
                  }
                />
                <Route
                  path="deviations/:deviationId"
                  element={<DeviationDetailPage />}
                />
                <Route
                  path="final-inspection/:inwardId"
                  element={<FinalInspectionView />}
                />
                <Route
                  path="calibration-reminders/:customerId"
                  element={
                    <CalibrationReminderDetailsPage />
                  }
                />
              </Routes>
            </div>

            <footer className="w-full bg-white border-t border-gray-200 mt-auto">
              <Footer />
            </footer>
          </div>
        </main>
      </div>

      {/* ── Floating Widget ────────────────────────────────────── */}
      <CalibrationReminderWidget
        onCustomerSelect={(customerId) =>
          navigate(
            `/engineer/calibration-reminders/${customerId}`
          )
        }
      />

      {/* ── Profile Update Popup ───────────────────────────────── */}
      {showProfileUpdatePopup && (
        <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  New Customer Profile Update
                </h3>
                <p className="text-gray-600 mt-2 text-sm">
                  {latestPopupCompany ? (
                    <>
                      <span className="font-semibold text-gray-900">
                        {latestPopupCompany}
                      </span>{" "}
                      updated customer profile
                      details. Open Notifications to
                      review the changes.
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
                onClick={() =>
                  setShowProfileUpdatePopup(false)
                }
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProfileUpdatePopup(false);
                  navigate(
                    "/engineer/notifications"
                  );
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