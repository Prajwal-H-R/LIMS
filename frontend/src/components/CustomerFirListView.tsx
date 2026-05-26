import React, { useState } from "react";
import { Link } from "react-router-dom";
import { 
  FileText, 
  ChevronLeft, 
  AlertTriangle, 
  CheckCircle, 
  Eye,
  ListFilter
} from "lucide-react";

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
}

const formatSafeDate = (dateStr?: string | null) => {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

interface CustomerFirListViewProps {
  firs: FirForReview[];
  finals: FinalReport[];
}

export const CustomerFirListView: React.FC<CustomerFirListViewProps> = ({ firs, finals }) => {
    // State to toggle between FIRs and Final Reports
    const [activeTab, setActiveTab] = useState<'fir' | 'final'>('fir');

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4">
            {/* TOP NAVIGATION & HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Inspection Reports</h1>
                    <p className="text-slate-500 text-sm">Manage and review your material inspection documents</p>
                </div>
                <Link to="/customer" className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-semibold text-sm transition-colors">
                    <ChevronLeft className="h-4 w-4" /> Back to Dashboard
                </Link>
            </div>

            {/* TAB SWITCHER */}
            <div className="flex p-1 bg-slate-200/60 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('fir')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                        activeTab === 'fir' 
                        ? "bg-white text-orange-600 shadow-sm" 
                        : "text-slate-600 hover:text-slate-800"
                    }`}
                >
                    <FileText className="h-4 w-4" />
                    First Inspection (FIR)
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'fir' ? 'bg-orange-100' : 'bg-slate-300 text-slate-700'}`}>
                        {firs.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('final')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                        activeTab === 'final' 
                        ? "bg-white text-green-600 shadow-sm" 
                        : "text-slate-600 hover:text-slate-800"
                    }`}
                >
                    <CheckCircle className="h-4 w-4" />
                    Final Reports
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'final' ? 'bg-green-100' : 'bg-slate-300 text-slate-700'}`}>
                        {finals.length}
                    </span>
                </button>
            </div>

            {/* CONTENT AREA */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                {activeTab === 'fir' ? (
                    <div className="animate-in fade-in duration-300">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800">Pending Reviews</h2>
                            {firs.length > 0 && (
                                <span className="text-xs font-medium text-orange-700 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                                    Action Required
                                </span>
                            )}
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-100 text-slate-600 text-sm">
                                    <tr>
                                        <th className="p-4 font-semibold border-b">SRF No.</th>
                                        <th className="p-4 font-semibold border-b">Status</th>
                                        <th className="p-4 font-semibold border-b">Inspection Date</th>
                                        <th className="p-4 font-semibold border-b">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {firs.length > 0 ? (firs.map((fir) => (
                                        <tr key={fir.inward_id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-medium text-slate-800">{fir.srf_no}</td>
                                            <td className="p-4">
                                                <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 w-fit">
                                                    <AlertTriangle className="h-3 w-3" /> Requires Review
                                                </span>
                                            </td>
                                            <td className="p-4 text-slate-600">
                                                {formatSafeDate(fir.material_inward_date || fir.date)}
                                            </td>
                                            <td className="p-4">
                                                <Link to={`/customer/fir-remarks/${fir.inward_id}`} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 text-sm transition-colors shadow-sm">
                                                    <FileText className="h-4 w-4" /> Review
                                                </Link>
                                            </td>
                                        </tr>
                                    ))) : (
                                        <tr>
                                            <td colSpan={4} className="p-20 text-slate-500 text-center">
                                                <ListFilter className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                                <p>No First Inspection Reports found.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="animate-in fade-in duration-300">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800">Completed Reports</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-100 text-slate-600 text-sm">
                                    <tr>
                                        <th className="p-4 font-semibold border-b">SRF No.</th>
                                        <th className="p-4 font-semibold border-b">Report Sent Date</th>
                                        <th className="p-4 font-semibold border-b">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {finals.length > 0 ? (finals.map((report) => (
                                        <tr key={report.inward_id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-medium text-slate-800">{report.srf_no}</td>
                                            <td className="p-4 text-slate-600">
                                                {formatSafeDate(report.report_sent_at)}
                                            </td>
                                            <td className="p-4">
                                                <Link to={`/customer/final-report/${report.inward_id}`} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 text-sm transition-colors shadow-sm">
                                                    <Eye className="h-4 w-4" /> View
                                                </Link>
                                            </td>
                                        </tr>
                                    ))) : (
                                        <tr>
                                            <td colSpan={4} className="p-20 text-slate-500 text-center">
                                                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                                <p>No final inspection reports available.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
