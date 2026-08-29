import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Loader2, CheckCircle2, 
  ShieldCheck, XCircle, AlertCircle, Check, X, ChevronLeft 
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config"; 
import toast from "react-hot-toast";

export const CustomerFinalReportView: React.FC = () => {
  const { inwardId } = useParams<{ inwardId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState<any | null>(null);
  
  // Rejection Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionRemarks, setRejectionRemarks] = useState("");

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await api.get(ENDPOINTS.FINAL_INSPECTIONS.CUSTOMER_VIEW(Number(inwardId)));
      setData(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Access denied to this report.");
      navigate("/customer/view-firs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [inwardId]);

  const handleSubmitDecision = async (decision: "APPROVED" | "REJECTED") => {
    if (decision === "REJECTED" && !rejectionRemarks.trim()) {
      toast.error("Please provide a reason for rejection.");
      return;
    }

    try {
      setIsSubmitting(true);
      await api.post(
  ENDPOINTS.FINAL_INSPECTIONS.SUBMIT_DECISION(Number(inwardId)),
  {
    decision,
    remarks:
      decision === "REJECTED"
        ? rejectionRemarks
        : "Approved by customer",
  }
);

      toast.success(`Report ${decision.toLowerCase()} successfully!`);
      setShowRejectModal(false);
      setRejectionRemarks("");
      fetchReport(); 
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to submit decision.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
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

  const hasDecision = !!data.customer_decision;

  // Status Styling Logic (Matching your SRF view)
  const statusInfo = {
    APPROVED: { label: "Approved", color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-4 w-4" /> },
    REJECTED: { label: "Rejected", color: "bg-red-100 text-red-800", icon: <XCircle className="h-4 w-4" /> },
    PENDING: { label: "Pending Review", color: "bg-yellow-100 text-yellow-800", icon: <AlertCircle className="h-4 w-4" /> }
  }[data.customer_decision as string || "PENDING"];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between px-2">
            <button 
                onClick={handleBack} 
                className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-semibold transition-colors"
            >
                <ChevronLeft className="h-4 w-4" /> Back to Reports List
            </button>

            <div className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-full ${statusInfo?.color}`}>
              {statusInfo?.icon}
              {statusInfo?.label}
            </div>
        </div>

        {/* MAIN REPORT CARD */}
        <div className="bg-white shadow-lg rounded-2xl border border-slate-200 overflow-hidden relative">
            
            {/* Decision Banner (Internal Top Banner like SRF) */}
            {hasDecision && (
    <div className={`${data.customer_decision === 'APPROVED' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border-b px-6 py-3 flex items-center gap-3`}>
        <div className={`p-1.5 rounded-full ${data.customer_decision === 'APPROVED' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {data.customer_decision === 'APPROVED' ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
        </div>
        <div>
            <h3 className={`text-sm font-bold uppercase tracking-wide ${data.customer_decision === 'APPROVED' ? 'text-green-800' : 'text-red-800'}`}>
                Report {data.customer_decision}
            </h3>
            
            {/* Only show remarks if the report is REJECTED */}
            {data.customer_decision === 'REJECTED' && data.customer_remarks && (
                <p className="text-xs text-red-700 mt-0.5">
                   <span className="font-bold">Reason:</span> {data.customer_remarks}
                </p>
            )}
        </div>
    </div>
)}

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

                <div className="relative rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
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
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="border-r border-slate-200 p-3 text-center text-slate-400 bg-white sticky left-0">{idx + 1}</td>
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

            {/* ACTION FOOTER (Matching SRF Style) */}
            {!hasDecision && (
                <footer className="flex justify-end items-center gap-4 p-6 bg-slate-50 border-t border-slate-200">
                    <button 
                        className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition-all disabled:opacity-60" 
                        onClick={() => setShowRejectModal(true)} 
                        disabled={isSubmitting}
                    >
                        <X className="h-5 w-5" /> Reject
                    </button>
                    <button 
                        className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-all disabled:opacity-60" 
                        onClick={() => handleSubmitDecision("APPROVED")} 
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Approve
                    </button>
                </footer>
            )}
        </div>
        
        <div className="pb-12 text-center">
            <p className="text-slate-400 text-xs italic tracking-widest uppercase">End of Final Inspection Report</p>
        </div>
      </div>

      {/* REJECTION MODAL (Exact match to SRF view structure) */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-red-100 rounded-full">
                            <XCircle className="h-6 w-6 text-red-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900">Confirm Rejection</h3>
                    </div>
                    
                    <p className="text-slate-600 mb-4 text-sm">
                        Please provide a clear reason for rejecting this final report. Our team will review your comments and make the necessary corrections.
                    </p>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Reason for Rejection <span className="text-red-500">*</span>
                        </label>
                        <textarea 
                            autoFocus
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none" 
                            rows={4} 
                            placeholder="e.g., 'The model number for NEPL/24/001 is incorrect...'" 
                            value={rejectionRemarks} 
                            onChange={(e) => setRejectionRemarks(e.target.value)} 
                            maxLength={500} 
                        />
                        <div className="flex justify-between mt-1">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Required field</p>
                            <p className="text-xs text-slate-500 font-mono">{rejectionRemarks.length}/500 characters</p>
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end mt-6">
                        <button 
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors" 
                            onClick={() => { setShowRejectModal(false); setRejectionRemarks(""); }} 
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button 
                            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50" 
                            onClick={() => handleSubmitDecision("REJECTED")} 
                            disabled={isSubmitting || !rejectionRemarks.trim()}
                        >
                            {isSubmitting ? "Submitting..." : "Confirm Rejection"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
