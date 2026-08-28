import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
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
  ScanLine,
  ArrowRight,
  Filter,
  X,
  Calendar,
  Building2,
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { User } from "../types";
import { api, ENDPOINTS } from "../api/config";
import { fetchLicenseStatus, LicenseStatus } from "../api/license";
import LicenseModal from "../components/LicenseModal";

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
import CalibrationBookingsPage from "../components/CalibrationBookingsPage";

// --- Split Components ---
import EngineerDashboard from "../components/EngineerDashboard";
import {
  DeviationPage,
  DeviationSRFEquipmentPage,
  DeviationDetailPage,
} from "../components/DeviationComponents";
import { BarcodeScanner } from "../components/BarcodeScanner";
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

const extractCompanyRawFromNotification = (
  notification?: EngineerNotificationItem | null
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

const canonicalCompanyName = (
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

const extractCompanyFromNotification = (
  notification?: EngineerNotificationItem | null
): string | null =>
  canonicalCompanyName(extractCompanyRawFromNotification(notification));

const notificationRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
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
  if (pathname.includes("/engineer/inward-management"))
    return "inward-management";
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
  if (pathname.includes("/engineer/scan"))
    return "barcode-scanner";
  if (pathname.includes("/engineer/certificates"))
    return "certificates";
  return "dashboard";
};

// ── Quick Action items (Sidebar) ──────────────────────────────────

interface QuickActionItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  route: string;
}

const quickActionItems: QuickActionItem[] = [
  {
    id: "barcode-scanner",
    label: "Scan Barcode",
    icon: <ScanLine size={18} />,
    route: "/engineer/scan",
  },
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
   {
    id: "calibration-bookings",
    label: "Calibration Bookings",
    icon: <Calendar size={18} />,
    route: "/engineer/calibration-bookings",
  },
];

// ── Inside View: Inward Management Hub ────────────────────────────

/**
 * Inside View Hub for Inward Management
 */
const InwardManagementHub: React.FC<{
  onNavigate: (route: string) => void;
}> = ({ onNavigate }) => {
  const modules = [
    {
      title: "Create Inward",
      desc: "Register new equipment and create new inward entries.",
      icon: <ClipboardList size={28} className="text-blue-600" />,
      route: "/engineer/create-inward",
      iconBg: "bg-blue-50",
    },
    {
      title: "View & Update",
      desc: "Search, view, and update existing equipment inward records.",
      icon: <Wrench size={28} className="text-amber-600" />,
      route: "/engineer/view-inward",
      iconBg: "bg-amber-50",
    },
    {
      title: "Export Inward",
      desc: "Download and export inward data for reporting.",
      icon: <Download size={28} className="text-emerald-600" />,
      route: "/engineer/export-inward",
      iconBg: "bg-emerald-50",
    },
  ];

  return (
    <div className="animate-fadeIn">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inward Management</h1>
          <p className="text-gray-500 mt-2">Manage equipment entry, updates, and reporting from one place.</p>
        </div>
        <button
          onClick={() => onNavigate("/engineer")}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
        >
          <ChevronLeft size={16} /> Back to Dashboard
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {modules.map((m) => (
          <button
            key={m.title}
            onClick={() => onNavigate(m.route)}
            className="group flex flex-col p-8 bg-white border border-gray-100 rounded-[2rem] shadow-sm hover:shadow-xl hover:border-blue-200 transition-all duration-300 text-left h-full w-full"
          >
            {/* Icon Section */}
            <div className={`w-14 h-14 ${m.iconBg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
              {m.icon}
            </div>

            {/* Content Section */}
            <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-700 transition-colors">
              {m.title}
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-8 flex-1">
              {m.desc}
            </p>

            {/* Visual Footer (Matches your second image) */}
            <div className="mt-auto flex items-center text-blue-600 font-semibold text-sm transition-all group-hover:gap-1">
              Open Section
              <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

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

  useEffect(() => {
    const isQuickAction = quickActionItems.some(
      (item) => item.id === activeSection
    );
    if (isQuickAction) {
      setQuickActionsExpanded(true);
    }
  }, [activeSection]);

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

  const handleMouseEnter = (
    e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>,
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
    route: string;
  }) => {
    const isActive = activeSection === item.id;
    const showBadge = item.id === "notifications" && notificationCount > 0;
    const badgeLabel = notificationCount > 99 ? "99+" : notificationCount;
// Around line 140: Update getActiveSectionFromPath
const getActiveSectionFromPath = (pathname: string): string => {
  // ... existing checks
  if (pathname.includes("/engineer/certificates")) return "certificates";
  
  // --- ADD THIS ---
  if (pathname.includes("/engineer/calibration-bookings")) return "calibration-bookings";
  
  return "dashboard";
};
    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.route)}
        onMouseEnter={(e) => handleMouseEnter(e, item.label)}
        onMouseLeave={() => setHoveredItem(null)}
        className={`w-full flex items-center px-3 py-3 my-1 rounded-xl transition-all duration-200 group relative
          ${isOpen ? "justify-start" : "justify-center"}
          ${isActive ? "bg-blue-600 text-white shadow-md shadow-blue-200/50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}
        `}
      >
        <div className={`flex-shrink-0 transition-colors duration-200 ${isActive ? "text-white" : "text-gray-400 group-hover:text-gray-600"}`}>
          {item.icon}
        </div>
        {showBadge && !isOpen && (
          <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] font-bold text-center">
            {badgeLabel}
          </span>
        )}
        <span className={`ml-3 text-sm font-medium whitespace-nowrap transition-all duration-300 origin-left flex-1 text-left ${isOpen ? "opacity-100 w-auto translate-x-0" : "opacity-0 w-0 -translate-x-4 overflow-hidden hidden"}`}>
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

  const renderQuickActionItem = (item: QuickActionItem) => {
    const isActive = activeSection === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.route)}
        onMouseEnter={(e) => handleMouseEnter(e, item.label)}
        onMouseLeave={() => setHoveredItem(null)}
        className={`w-full flex items-center py-2.5 my-0.5 rounded-lg transition-all duration-200 group relative
          ${isOpen ? "px-3 pl-5 justify-start" : "px-3 justify-center"}
          ${isActive ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}
        `}
      >
        {isActive && isOpen && <span className="absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 rounded-full" />}
        <div className={`flex-shrink-0 transition-colors duration-200 ${isActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-500"}`}>
          {item.icon}
        </div>
        <span className={`ml-3 text-sm whitespace-nowrap transition-all duration-300 origin-left flex-1 text-left ${isOpen ? "opacity-100 w-auto translate-x-0" : "opacity-0 w-0 -translate-x-4 overflow-hidden hidden"}`}>
          {item.label}
        </span>
      </button>
    );
  };

  const renderQuickActionsGroup = () => {
    const hasActiveChild = quickActionItems.some((item) => item.id === activeSection);
    if (isOpen) {
      return (
        <div className="mt-4">
          <button
            onClick={() => setQuickActionsExpanded(!quickActionsExpanded)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group ${hasActiveChild && !quickActionsExpanded ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}
          >
            <div className="flex items-center gap-3">
              <Zap size={20} className={hasActiveChild && !quickActionsExpanded ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"} />
              <span className="text-sm font-medium">Quick Actions</span>
            </div>
            {quickActionsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${quickActionsExpanded ? "max-h-[500px] opacity-100 mt-1" : "max-h-0 opacity-0"}`}>
            <div className="ml-2 border-l-2 border-gray-100 pl-1">{quickActionItems.map(renderQuickActionItem)}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div onClick={() => { setIsOpen(true); setQuickActionsExpanded(true); }} className={`w-full flex items-center justify-center px-3 py-3 rounded-xl transition-all cursor-pointer ${hasActiveChild ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-100"}`}>
          <Zap size={20} />
        </div>
        {quickActionItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button key={item.id} onClick={() => onNavigate(item.route)} className={`w-full flex items-center justify-center px-3 py-2.5 my-0.5 rounded-lg transition-all ${isActive ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:bg-gray-50"}`}>
              {item.icon}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <aside className={`relative bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 ${isOpen ? "w-64" : "w-[4.5rem]"}`}>
        <div className={`h-14 flex items-center px-4 flex-shrink-0 bg-white border-b border-gray-50 ${isOpen ? "justify-between" : "justify-center"}`}>
          {isOpen && <div className="font-extrabold text-gray-800 text-lg tracking-tight truncate">Engineer<span className="text-blue-600">Portal</span></div>}
          <button onClick={() => setIsOpen(!isOpen)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all">
            {isOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 overflow-y-auto overflow-x-hidden scrollbar-thin flex flex-col">
          <div className="space-y-1">{mainNavItems.map(renderNavButton)}</div>
          {renderQuickActionsGroup()}
          <div className="flex-1" />
          <div className="border-t border-gray-100 mt-4 pt-2 space-y-1">
            {renderNavButton({ id: "settings", label: "Settings", icon: <Settings size={20} />, route: "/engineer/settings" })}
            <button onClick={onLogout} className={`w-full flex items-center px-3 py-3 my-1 rounded-xl transition-all text-gray-500 hover:bg-red-50 hover:text-red-600 ${isOpen ? "justify-start" : "justify-center"}`}>
              <LogOut size={20} className="flex-shrink-0" />
              {isOpen && <span className="ml-3 text-sm font-medium">Logout</span>}
            </button>
          </div>
        </nav>
      </aside>
      {!isOpen && hoveredItem && (
        <div className="fixed z-[150] px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg shadow-xl pointer-events-none" style={{ left: "5.2rem", top: hoveredItem.top, transform: "translateY(-50%)" }}>
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
    <h2 className="text-2xl font-semibold text-gray-300">Settings Configuration</h2>
    <p className="text-gray-500 mt-2">Coming soon.</p>
  </div>
);

// ── Notifications Page ────────────────────────────────────────────

const EngineerNotificationsPage: React.FC<{
  notifications: EngineerNotificationItem[];
  loading: boolean;
  error: string | null;
}> = ({ notifications, loading, error }) => {
  const navigate = useNavigate();
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);

  const companyOptions = useMemo(() => {
    const names = new Set<string>();
    notifications.forEach((n) => {
      const co = extractCompanyFromNotification(n);
      if (co) names.add(co);
    });
    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [notifications]);

  const filtered = useMemo(() => {
    if (!companyFilter) return notifications;
    return notifications.filter(
      (n) => extractCompanyFromNotification(n) === companyFilter
    );
  }, [notifications, companyFilter]);

  if (loading && notifications.length === 0) {
    return <p className="py-4 text-sm text-gray-500">Loading notifications…</p>;
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
        {error}
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          <p className="mt-1 text-sm text-gray-500">
            Customer profile updates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50"
        >
          <ChevronLeft size={16} /> Back
        </button>
      </div>

      <div className="space-y-4">
        {/* Company Filter */}
        {notifications.length > 0 && (
          <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Filter className="w-4 h-4 text-gray-400" />
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
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filtered.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Bell size={40} className="mb-3 opacity-40" />
            <p className="font-medium">
              {companyFilter
                ? "No profile update notifications match this filter."
                : "You have no profile update notifications."}
            </p>
          </div>
        )}

        {/* Notification Cards */}
        {filtered.map((n) => {
          const companyName = extractCompanyFromNotification(n);
          return (
            <div
              key={n.id}
              className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {companyName && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mb-2 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-full">
                      <Building2 size={12} />
                      {companyName}
                    </div>
                  )}
                  <h3 className="text-lg font-bold text-gray-900 break-words">
                    {n.subject}
                  </h3>
                  {n.body_text && (
                    <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc pl-5">
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
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${n.status === 'Sent' || n.status === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : 'bg-gray-50 text-gray-600 border-gray-100'
                      }`}
                  >
                    {n.status}
                  </span>
                  <p className="mt-2 text-[10px] text-gray-400">
                    {notificationRelativeTime(n.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ── Engineer Portal (Main) ────────────────────────────────────────

const EngineerPortal: React.FC<EngineerPortalProps> = ({ user, onLogout }) => {
  const username = user?.full_name || user?.email || "Engineer";
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const activeSection = getActiveSectionFromPath(location.pathname);

  // ── License popup state (engineer only; customer/admin handled elsewhere) ──
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [licenseValidUntil, setLicenseValidUntil] = useState("");
  const [showLicensePopup, setShowLicensePopup] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  
  // Prevent auto-open from re-triggering after user-dismiss.
  const autoOpenDoneRef = React.useRef(false);
  const dismissedRef = React.useRef(false);

  const dismissLicensePopup = useCallback(
    (afterDismiss?: boolean) => {
      dismissedRef.current = true;
      setShowLicensePopup(false);

      if (afterDismiss && pendingRoute) {
        const route = pendingRoute;
        setPendingRoute(null);
        navigate(route);
      } else {
        setPendingRoute(null);
      }
    },
    [navigate, pendingRoute]
  );

  // ── Notification state ──
  const [profileUpdateNotifications, setProfileUpdateNotifications] = useState<EngineerNotificationItem[]>([]);
  const [profileUpdateLoading, setProfileUpdateLoading] = useState(false);
  const [profileUpdateError, setProfileUpdateError] = useState<string | null>(null);
  const [showProfileUpdatePopup, setShowProfileUpdatePopup] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const latestPopupCompany = extractCompanyFromNotification(profileUpdateNotifications[0]);

  const fetchProfileUpdateNotifications = useCallback(async () => {
    setProfileUpdateLoading(true);
    try {
      const res = await api.get<EngineerNotificationsResponse>(ENDPOINTS.NOTIFICATIONS);
      const notifications = res.data.notifications || [];
      setProfileUpdateNotifications(notifications);
      const newestId = notifications[0]?.id;
      const lastSeenId = Number(localStorage.getItem("engineer_profile_update_last_seen_id") || "0");
      if (newestId && newestId > lastSeenId) {
        setShowProfileUpdatePopup(true);
        localStorage.setItem("engineer_profile_update_last_seen_id", String(newestId));
      }
      setUnreadCount(activeSection !== "notifications" ? notifications.filter(n => n.id > lastSeenId).length : 0);
    } catch (e: unknown) {
      setProfileUpdateError("Failed to load notifications.");
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

  // Fetch license status only after auth and only for staff engineer
  useEffect(() => {
    const run = async () => {
      if (!user) return;

      const role = (user as any)?.role?.toString().toLowerCase();
      if (role !== "engineer") return;

      const res = await fetchLicenseStatus();

      //setBackendWantsPopup(!!res?.show_popup);
      setLicenseStatus((res?.status as LicenseStatus) ?? null);
      setLicenseValidUntil(res?.valid_until ?? "");

      // Auto-open exactly once after login (prevents reopen loops after dismiss).
      if (!autoOpenDoneRef.current) {
        autoOpenDoneRef.current = true;
        if (res?.show_popup) {
          dismissedRef.current = false;
          setShowLicensePopup(true);
        } else {
          setShowLicensePopup(false);
        }
      }
    };

    run().catch(() => {
      // keep UI unchanged if license call fails
    });
  }, [user]);

  const handleNavigateWithLicense = useCallback(
    (route: string) => {
      const role = (user as any)?.role?.toString().toLowerCase();

      if (
        role === "engineer" &&
        licenseStatus === "EXPIRED" &&
        (route === "/engineer/create-inward" ||
          route.startsWith("/engineer/create-inward"))
      ) {
        // Manual reopen only for Create Inward when EXPIRED.
        dismissedRef.current = false;
        setPendingRoute(route);
        setShowLicensePopup(true);
        return;
      }

      navigate(route);
    },
    [navigate, user, licenseStatus]
  );

  // If user lands directly on create-inward routes while license is expired,
  // open modal and redirect away from the form.
  useEffect(() => {
    const role = (user as any)?.role?.toString().toLowerCase();
    if (role !== "engineer" || licenseStatus !== "EXPIRED") return;

    const path = location.pathname;
    const isCreateInwardRoute =
      path === "/engineer/create-inward" ||
      path.startsWith("/engineer/create-inward");

    if (isCreateInwardRoute) {
      // Landing directly on create-inward while expired => manual reopen.
      dismissedRef.current = false;
      setPendingRoute(path + location.search);
      setShowLicensePopup(true);
      navigate("/engineer", { replace: true });
    }
  }, [location.pathname, location.search, navigate, user, licenseStatus]);

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fc] font-sans text-gray-900 overflow-hidden">
      <div className="flex-none w-full bg-white border-b border-gray-200 shadow-sm z-50">
        <Header username={username} role="Engineer" onLogout={onLogout} profilePath="/engineer/profile" notificationsPath="/engineer/notifications" />
      </div>

      <div className="flex flex-1 min-w-0 overflow-hidden relative">
        <div className="flex-none h-full bg-white border-r border-gray-200 z-40">
          <Sidebar isOpen={isSidebarOpen} setIsOpen={setSidebarOpen} activeSection={activeSection} onNavigate={handleNavigateWithLicense} notificationCount={unreadCount} onLogout={onLogout} />
        </div>
<main className="flex-1 min-w-0 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50 relative z-0">
          <div className="flex flex-col min-h-full">
            <div className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">              <Routes>
                <Route path="profile" element={<ProfilePage />} />
                <Route path="notifications" element={<EngineerNotificationsPage notifications={profileUpdateNotifications} loading={profileUpdateLoading} error={profileUpdateError} />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="/" element={<EngineerDashboard />} />

                {/* NEW HUB ROUTE */}
                <Route
                  path="inward-management"
                  element={<InwardManagementHub onNavigate={handleNavigateWithLicense} />}
                />

                {/* Sub Routes */}
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
                <Route path="manual-calibration" element={<ManualCalibrationPage />} />
                <Route path="calibration/:inwardId/:equipmentId" element={<CalibrationPage />} />
                <Route path="uncertainty-budget/:inwardId/:equipmentId" element={<UncertaintyBudgetPage />} />
                <Route path="certificates" element={<CertificatesPage />} />
                <Route path="deviations" element={<DeviationPage />} />
                <Route path="deviations/:deviationId" element={<DeviationDetailPage />} />
                <Route path="final-inspection/:inwardId" element={<FinalInspectionView />} />
                <Route path="calibration-reminders/:customerId" element={<CalibrationReminderDetailsPage />} />
                <Route path="scan" element={<BarcodeScanner />} />
                <Route path="deviations" element={<DeviationPage />} />
  <Route path="calibration-bookings" element={<CalibrationBookingsPage />} />

                {/* ✅ ADD THIS ROUTE */}
                <Route
                  path="deviations/srf/:srfNo"
                  element={<DeviationSRFEquipmentPage />}
                />

                {/* ⚠️ MUST stay BELOW the srf route */}
                <Route
                  path="deviations/:deviationId"
                  element={<DeviationDetailPage />}
                />
              </Routes>
            </div>
            <footer className="w-full bg-white border-t border-gray-200 mt-auto"><Footer /></footer>
          </div>
        </main>
      </div>

      <CalibrationReminderWidget onCustomerSelect={(id) => navigate(`/engineer/calibration-reminders/${id}`)} />

      {/* License Popup (Engineer only) */}
      {showLicensePopup &&
        (licenseStatus === "EXPIRED" || licenseStatus === "EXPIRING_SOON") &&
        licenseStatus && (
          <LicenseModal
            status={licenseStatus}
            validUntil={licenseValidUntil}
            onExtended={(newDate) => {
              // Extending activates license; close modal permanently.
              dismissedRef.current = true;
              setLicenseValidUntil(newDate);
              setLicenseStatus("ACTIVE");
              setShowLicensePopup(false);

              if (pendingRoute) {
                const route = pendingRoute;
                setPendingRoute(null);
                navigate(route);
              }
            }}
            onClose={() => {
              // Close/OK/X should keep it closed for this lifecycle until Create Inward re-opens (EXPIRED).
              dismissLicensePopup(false);
            }}
          />
        )}

      {/* Profile Update Popup */}
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
              <button type="button" onClick={() => setShowProfileUpdatePopup(false)} className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50">Dismiss</button>
              <button type="button" onClick={() => { setShowProfileUpdatePopup(false); navigate("/engineer/notifications"); }} className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700">View Notifications</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EngineerPortal;