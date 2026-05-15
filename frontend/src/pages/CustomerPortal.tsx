import React, { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Srf, DashboardProps } from "../types";
import {
  AlertCircle,
  Award,
  ClipboardList,
  Activity,
  ChevronLeft,
  FileText,
  AlertTriangle,
  Search,
  Download,
  ArrowRight,
  Clock,
  Bell,
  CheckCircle,
  Eye
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api, ENDPOINTS } from '../api/config';
import { CustomerRemarksPortal } from '../components/CustomerRemarksPortal';
import CustomerSrfDetailView from "../components/CustomerSrfDetailView"; 
import CustomerSrfListView from "../components/CustomerSrfListView";
import TrackStatusPage from "../components/TrackStatusPage";
import { CustomerCertificatesPage } from "../components/CustomerCertificatesPage";
import CustomerDeviationsPage from "../components/CustomerDeviationsPage";
import CustomerDeviationDetailPage from "../components/CustomerDeviationDetailPage";
import ProfilePage from "../components/ProfilePage";
import { CustomerFirListView } from "../components/CustomerFirListView";
import { CustomerFinalReportView } from "../components/CustomerFinalReportView";

// --- LOCAL TYPE DEFINITIONS ---
interface FirForReview {
  inward_id: number;
  srf_no: string;
  date?: string; 
  material_inward_date?: string;
  status: string;
}

interface FinalReport {
  inward_id: number;
  srf_no: string;
  report_sent_at?: string;
  status: string;
}

interface DashboardStats {
  totalSrfs: number;
  activeDeviations: number;
  readyCertificates: number;
  draftSrfs: number;
  firsForReview: number;
}

interface SrfApiResponse {
  pending: Srf[];
  approved: Srf[];
  rejected: Srf[];
}

// --- SKELETON LOADING COMPONENT ---
const DashboardSkeleton = () => {
  return (
    <div className="animate-pulse w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-slate-200 rounded-2xl"></div>
          <div className="space-y-3">
            <div className="h-8 w-64 bg-slate-200 rounded"></div>
            <div className="h-4 w-40 bg-slate-200 rounded"></div>
          </div>
        </div>
        <div className="h-12 w-12 bg-slate-200 rounded-full self-end md:self-auto"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 mt-6">
        {[1, 2, 3].map((item) => (
          <div key={item} className="bg-white rounded-xl p-6 shadow-md border border-gray-100 h-36"></div>
        ))}
      </div>
    </div>
  );
};

// --- DASHBOARD COMPONENTS ---

const NotificationCenter: React.FC<{ stats: DashboardStats }> = ({ stats }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const totalNotifications = stats.firsForReview + stats.draftSrfs + stats.activeDeviations + stats.readyCertificates;

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="p-3 bg-white rounded-full shadow-sm border border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all relative group"
            >
                <Bell className={`h-6 w-6 ${isOpen ? 'text-blue-600' : 'text-gray-600 group-hover:text-blue-600'}`} />
                {totalNotifications > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] shadow-sm border-2 border-white transform translate-x-1/4 -translate-y-1/4">
                        {totalNotifications}
                    </span>
                )}
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden ring-1 ring-black ring-opacity-5 animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800">Notifications</h3>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                        {totalNotifications === 0 ? (
                            <div className="p-8 text-center flex flex-col items-center text-gray-400">
                                <p className="text-sm">You're all caught up!</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {stats.firsForReview > 0 && (
                                <div
                                    onClick={() => { 
                                        setIsOpen(false); 
                                        navigate('/customer/view-firs'); 
                                    }}
                                    className="p-4 hover:bg-orange-50 cursor-pointer group flex items-start gap-3"
                                >
                                    <AlertTriangle className="h-5 w-5 text-orange-600" />

                                    <div className="flex-1">
                                        <p className="text-sm font-semibold">
                                            Action Required
                                        </p>

                                        <p className="text-xs text-gray-600">
                                            You have {stats.firsForReview} FIRs awaiting review.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {stats.draftSrfs > 0 && (
                                <div
                                    onClick={() => { 
                                        setIsOpen(false); 
                                        navigate('/customer/view-srf'); 
                                    }}
                                    className="p-4 hover:bg-blue-50 cursor-pointer group flex items-start gap-3"
                                >
                                    <AlertTriangle className="h-5 w-5 text-blue-600" />

                                    <div className="flex-1">
                                        <p className="text-sm font-semibold">
                                            Draft SRFs
                                        </p>

                                        <p className="text-xs text-gray-600">
                                            You have {stats.draftSrfs} draft SRFs.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {stats.activeDeviations > 0 && (
                                <div
                                    onClick={() => { 
                                        setIsOpen(false); 
                                        navigate('/customer/deviations'); 
                                    }}
                                    className="p-4 hover:bg-red-50 cursor-pointer group flex items-start gap-3"
                                >
                                    <AlertTriangle className="h-5 w-5 text-red-600" />

                                    <div className="flex-1">
                                        <p className="text-sm font-semibold">
                                            Active Deviations
                                        </p>

                                        <p className="text-xs text-gray-600">
                                            You have {stats.activeDeviations} active deviations.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {stats.readyCertificates > 0 && (
                                <div
                                    onClick={() => { 
                                        setIsOpen(false); 
                                        navigate('/customer/certificates'); 
                                    }}
                                    className="p-4 hover:bg-green-50 cursor-pointer group flex items-start gap-3"
                                >
                                    <AlertTriangle className="h-5 w-5 text-green-600" />

                                    <div className="flex-1">
                                        <p className="text-sm font-semibold">
                                            Ready Certificates
                                        </p>

                                        <p className="text-xs text-gray-600">
                                            {stats.readyCertificates} certificates are ready.
                                        </p>
                                    </div>
                                </div>
                            )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const ActionButton: React.FC<{
  label: string; description: string; icon: React.ReactNode;
  onClick: () => void; colorClasses: string; badge?: number;
}> = ({ label, description, icon, onClick, colorClasses, badge }) => (
  <button onClick={onClick} className="group relative p-6 rounded-2xl text-left transition-all border border-gray-100 bg-white hover:border-blue-500 hover:shadow-xl shadow-md">
    <div className="flex items-start">
      <div className={`p-3 rounded-xl text-white mr-4 shadow-lg ${colorClasses} relative`}>
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] rounded-full h-5 w-5 flex items-center justify-center font-bold border-2 border-white">
            {badge}
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

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; description: string; colorClass: string; }> = ({ icon, label, value, description, colorClass }) => ( 
    <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100 flex flex-col justify-between h-36 hover:shadow-lg transition-shadow"> 
        <div className="flex justify-between items-start"> 
            <div className={`p-3 rounded-xl text-white ${colorClass} shadow-md`}>{icon}</div> 
            <div className="text-4xl font-bold text-gray-800">{value}</div> 
        </div> 
        <div className="mt-2"> 
            <h3 className="text-md font-bold text-gray-900">{label}</h3> 
            <p className="text-gray-500 text-xs mt-0.5">{description}</p> 
        </div> 
    </div> 
);

const CustomerDashboardHome: React.FC<{ stats: DashboardStats }> = ({ stats }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    return ( 
        <div> 
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"> 
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-lg"><ClipboardList className="h-10 w-10 text-white" /></div> 
                    <div><h1 className="text-3xl font-bold text-gray-900">Customer Portal</h1><p className="mt-1 text-base text-gray-600">Welcome back, {user?.full_name || "Customer"}</p></div>
                </div>
                <div className="flex items-center gap-4 self-end md:self-auto"><NotificationCenter stats={stats} /></div>
            </div> 

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 mt-6"> 
                <StatCard icon={<Activity className="h-6 w-6" />} label="Total Requests" value={stats.totalSrfs} description="Submitted SRFs" colorClass="bg-gradient-to-r from-blue-500 to-blue-600" /> 
                <StatCard icon={<AlertCircle className="h-6 w-6" />} label="Active Deviations" value={stats.activeDeviations} description="Issues pending" colorClass="bg-gradient-to-r from-orange-500 to-red-500" /> 
                <StatCard icon={<Award className="h-6 w-6" />} label="Ready Certificates" value={stats.readyCertificates} description="Download available" colorClass="bg-gradient-to-r from-green-500 to-emerald-600" /> 
            </div> 

            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b pb-3">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ActionButton label="Track Status" description="Check status of equipment" icon={<Activity className="h-8 w-8" />} onClick={() => navigate("/customer/track-status")} colorClasses="bg-gradient-to-r from-blue-500 to-indigo-600" />
                    <ActionButton label="Review Reports" description="Approve FIRs & Final Reports" icon={<Search className="h-8 w-8" />} onClick={() => navigate("/customer/view-firs")} colorClasses="bg-gradient-to-r from-cyan-500 to-blue-600" badge={stats.firsForReview} />
                    <ActionButton label="View SRFs" description="Manage Request Forms" icon={<FileText className="h-8 w-8" />} onClick={() => navigate("/customer/view-srf")} colorClasses="bg-gradient-to-r from-green-500 to-emerald-600" badge={stats.draftSrfs} />
                    <ActionButton label="View Deviations" description="Access deviation reports" icon={<AlertTriangle className="h-8 w-8" />} badge={stats.activeDeviations} onClick={() => navigate("/customer/deviations")} colorClasses="bg-gradient-to-r from-orange-500 to-red-500" />
                    <ActionButton label="Certificates" description="Generate and manage certificates" icon={<Award className="h-8 w-8" />} badge={stats.readyCertificates} onClick={() => navigate("/customer/certificates")} colorClasses="bg-gradient-to-r from-purple-500 to-indigo-600" />
                </div>
            </div>
        </div> 
    );
};

// --- MAIN CUSTOMER PORTAL CONTAINER ---
const CustomerPortal: React.FC<DashboardProps> = ({ onLogout }) => {
    const { user } = useAuth();
    const [srfs, setSrfs] = useState<Srf[]>([]);
    const [firs, setFirs] = useState<FirForReview[]>([]);
    const [finals, setFinals] = useState<FinalReport[]>([]);
    const [certificateCount, setCertificateCount] = useState(0);
    const [deviationCount, setDeviationCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (!user?.user_id) return;
        try {
            const firsRes = await api.get<FirForReview[]>('/portal/firs-for-review');
            const reportsRes = await api.get<{firs: any, finals: FinalReport[]}>('/final-inspections/customer/dashboard-reports');
            const srfsRes = await api.get<SrfApiResponse>('/portal/srfs');
            const [certs, devs] = await Promise.all([
                api.get<unknown[]>(ENDPOINTS.PORTAL.CERTIFICATES),
                api.get<unknown[]>(ENDPOINTS.PORTAL.DEVIATIONS)
            ]);

            setFirs(firsRes.data || []);
            setFinals(reportsRes.data?.finals || []);
            setSrfs([...(srfsRes.data.pending || []), ...(srfsRes.data.approved || []), ...(srfsRes.data.rejected || [])]);
            setCertificateCount(Array.isArray(certs.data) ? certs.data.length : 0);
            setDeviationCount(Array.isArray(devs.data) ? devs.data.length : 0);
        } catch (err) { console.error("Portal Fetch Error:", err); }
    }, [user?.user_id]);

    useEffect(() => {
        const initialLoad = async () => {
            setLoading(true);
            await fetchData();
            setLoading(false);
        };
        initialLoad();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const dashboardStats: DashboardStats = {
        totalSrfs: srfs.length,
        activeDeviations: deviationCount,
        readyCertificates: certificateCount, 
        draftSrfs: srfs.filter(s => ["inward_completed", "pending"].includes(s.status.toLowerCase())).length,
        firsForReview: firs.length,
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <Header onLogout={onLogout} username={user?.full_name || "Customer"} role="Customer" profilePath="/customer/profile" />
            <main className="flex-1 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 w-full">
                {loading ? <DashboardSkeleton /> : (
                    <Routes>
                        <Route path="profile" element={<ProfilePage />} />
                        <Route path="/" element={<CustomerDashboardHome stats={dashboardStats} />} />
                        <Route path="track-status" element={<TrackStatusPage />} />
                        <Route path="view-srf" element={<CustomerSrfListView srfs={srfs as any[]} />} />
                        <Route path="srfs/:srfId" element={<CustomerSrfDetailView onStatusChange={(id, status) => setSrfs(prev => prev.map(s => s.srf_id === id ? {...s, status} as Srf : s))} />} />
                        <Route path="view-firs" element={<CustomerFirListView firs={firs} finals={finals} />} />
                        <Route path="fir-remarks/:inwardId" element={<CustomerRemarksPortal />} />
                        <Route path="deviations" element={<CustomerDeviationsPage />} />
                        <Route path="deviations/:deviationId" element={<CustomerDeviationDetailPage />} />
                        <Route path="certificates" element={<CustomerCertificatesPage />} />
                        <Route path="final-report/:inwardId" element={<CustomerFinalReportView />} />

                    </Routes>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default CustomerPortal;