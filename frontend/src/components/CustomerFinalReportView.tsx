import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Loader2, CheckCircle2, 
  FileText, ShieldCheck 
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config"; 
import toast from "react-hot-toast";

export const CustomerFinalReportView: React.FC = () => {
  const { inwardId } = useParams<{ inwardId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const res = await api.get(ENDPOINTS.FINAL_INSPECTIONS.CUSTOMER_VIEW(Number(inwardId)));
        setData(res.data);
      } catch (err: any) {
        toast.error(err.response?.data?.detail || "Access denied to this report.");
        // If error, redirect to dashboard as fallback
        navigate("/customer/view-firs");
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [inwardId, navigate]);

  // Handle Back Navigation Logic
  const handleBack = () => {
    // If the user arrived via a direct link (e.g. email), 
    // window.history.length might be 1 or 2. 
    // We explicitly route to the list page to ensure they don't get stuck.
    if (window.history.state && window.history.state.idx > 0) {
        navigate(-1);
    } else {
        navigate("/customer/view-firs");
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
      <p className="text-gray-500 font-medium">Loading Final Report View...</p>
    </div>
  );

  if (!data) return <div className="p-10 text-center">Report data not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between px-2">
            <button 
                onClick={handleBack} 
                className="flex items-center gap-2 text-gray-600 hover:text-indigo-600 font-bold transition-colors group"
            >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" /> 
                Back to Reports List
            </button>
        </div>

        {/* DOCUMENT PREVIEW SECTION */}
        <div className="bg-white shadow-xl rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-slate-800 text-white p-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <ShieldCheck size={24} className="text-emerald-400" />
                    <h2 className="text-xl font-bold tracking-tight">Final Inspection Report</h2>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">SRF Number</p>
                    <p className="text-lg font-mono font-bold text-blue-400">{data.srf_no}</p>
                </div>
            </div>

            <div className="p-6 sm:p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 pb-8 border-b border-gray-100">
                    <div className="space-y-3 text-sm">
                        <div className="flex border-b border-slate-50 pb-2">
                            <span className="font-bold text-slate-500 w-32">Report Date:</span> 
                            <span className="text-slate-900">
                                {data.report_sent_at ? new Date(data.report_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "N/A"}
                            </span>
                        </div>
                        <div className="flex border-b border-slate-50 pb-2">
                            <span className="font-bold text-slate-500 w-32">DC Number:</span> 
                            <span className="text-slate-900 font-mono">{data.customer_dc_no || 'N/A'}</span>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Customer Details</p>
                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed font-bold">
                            {data.customer_name}
                        </p>
                        <p className="text-xs text-slate-400 mt-2 font-mono">{data.customer_email}</p>
                    </div>
                </div>

                <div className="relative rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto overflow-y-hidden">
                        <table className="w-full text-sm border-collapse min-w-[1800px]">
                            <thead>
                                <tr className="bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider">
                                    <th className="border-b border-r border-slate-200 p-3 w-12 text-center sticky left-0 bg-slate-50 z-10">Sl</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left w-40">NEPL ID</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left w-64">Description</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left">Serial No</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-center w-16">Qty</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left">Make</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left">Model</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left">Range</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left">Visual Notes</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left">Accessories</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left">Eng Remarks</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-left">Cust Remarks</th>
                                    <th className="border-b border-r border-slate-200 p-3 text-center w-40">Calib. Status</th>
                                    <th className="border-b border-slate-200 p-3 text-left bg-indigo-50 text-indigo-700 w-80">Final Remarks</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {data.equipments?.map((eq: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                        <td className="border-r border-slate-200 p-3 text-center text-slate-400 bg-white sticky left-0 group-hover:bg-slate-50">{idx + 1}</td>
                                        <td className="border-r border-slate-200 p-3 font-mono font-bold text-blue-700">{eq.nepl_id}</td>
                                        <td className="border-r border-slate-200 p-3 text-slate-800 font-medium">{eq.material_description}</td>
                                        <td className="border-r border-slate-200 p-3 text-slate-600 font-mono text-xs">{eq.serial_no}</td>
                                        <td className="border-r border-slate-200 p-3 text-center font-bold">{eq.quantity || 1}</td>
                                        <td className="border-r border-slate-200 p-3">{eq.make}</td>
                                        <td className="border-r border-slate-200 p-3">{eq.model}</td>
                                        <td className="border-r border-slate-200 p-3 font-mono text-xs">{eq.range}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500 italic">{eq.visual_inspection_notes || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.accessories_included || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.engineer_remarks || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.customer_remarks || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-center">
                                            <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">
                                                {eq.job_status || "COMPLETED"}
                                            </span>
                                        </td>
                                        <td className="p-2 bg-indigo-50/20">
                                            <div className="w-full text-xs p-2 bg-white border border-indigo-100 rounded text-slate-700 min-h-[40px] whitespace-pre-wrap">
                                                {eq.final_remarks || ""}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        
        <div className="pb-12 text-center">
            <p className="text-slate-400 text-xs">End of Final Inspection Report</p>
        </div>
      </div>
    </div>
  );
};
