import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Loader2, Mail, CheckCircle2, 
  FileText, X, Send, Plus, Share2
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config"; 
import toast from "react-hot-toast";

export const FinalInspectionView: React.FC = () => {
  const { inwardId } = useParams<{ inwardId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [reportEmails, setReportEmails] = useState<string[]>(['']);
  const [isSending, setIsSending] = useState(false);
  const [showSuccessUI, setShowSuccessUI] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        // UPDATED: Pointing to the new FINAL_INSPECTIONS router path
        const res = await api.get(ENDPOINTS.FINAL_INSPECTIONS.GET_DETAILS(Number(inwardId)));
        setData(res.data);
        if (res.data.customer_email) {
            setReportEmails([res.data.customer_email]);
        }
      } catch (err: any) {
        toast.error("Failed to load inspection details.");
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [inwardId]);

  const addEmailField = () => setReportEmails(prev => [...prev, '']);
  const removeEmailField = (index: number) => setReportEmails(prev => prev.filter((_, i) => i !== index));

  const handleSendFir = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validEmails = reportEmails.filter(email => email.trim() && email.includes('@'));
    if (validEmails.length === 0) return toast.error("Please enter at least one valid email.");

    setIsSending(true);
    try {
      const payload = {
        inward_id: Number(inwardId),
        srf_no: data.srf_no,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_dc_no: data.customer_dc_no,
        receiver: data.receiver,
        equipments: data.equipments, 
        emails: validEmails
      };

      // UPDATED: Pointing to the new FINAL_INSPECTIONS router path
      await api.post(
        ENDPOINTS.FINAL_INSPECTIONS.SEND_REPORT(Number(inwardId)), 
        payload
      );

      toast.success("Final Inspection Report saved and sent!");
      setShowSuccessUI(true);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to process report.");
    } finally {
      setIsSending(false);
    }
  };

  const handleRemarkChange = (index: number, value: string) => {
    if (!data) return;
    const updatedEquipments = [...data.equipments];
    updatedEquipments[index].final_remarks = value;
    setData({ ...data, equipments: updatedEquipments });
  };

  // ... (Rest of your JSX remains exactly the same as before)

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
      <p className="text-gray-500 font-medium">Preparing Final Report Preview...</p>
    </div>
  );

  if (!data) return <div className="p-10 text-center">Inward data not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex items-center justify-between px-2">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back to List
            </button>
        </div>

        <div className="bg-white shadow-xl rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-slate-800 text-white p-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <FileText size={24} className="text-blue-400" />
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
                            <span className="font-bold text-slate-500 w-32">Inward Date:</span> 
                            <span className="text-slate-900">{data.created_at ? new Date(data.created_at).toLocaleDateString() : "N/A"}</span>
                        </div>
                        <div className="flex border-b border-slate-50 pb-2">
                            <span className="font-bold text-slate-500 w-32">DC Number:</span> 
                            <span className="text-slate-900 font-mono">{data.customer_dc_no}</span>
                        </div>
                        <div className="flex">
                            <span className="font-bold text-slate-500 w-32">Received By:</span> 
                            <span className="text-slate-900">{data.receiver}</span>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Customer Details</p>
                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed font-bold">
                            {data.customer_name}
                        </p>
                        <p className="text-xs text-slate-400 mt-2 font-mono">{data.customer_email}</p>
                    </div>
                </div>

                <div className="relative rounded-lg border border-slate-200 overflow-hidden">
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
                            <tbody className="divide-y divide-slate-100">
                                {data.equipments.map((eq: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                        <td className="border-r border-slate-200 p-3 text-center text-slate-400 bg-white sticky left-0 group-hover:bg-slate-50">{idx + 1}</td>
                                        <td className="border-r border-slate-200 p-3 font-mono font-bold text-blue-700">{eq.nepl_id}</td>
                                        <td className="border-r border-slate-200 p-3 text-slate-800 font-medium">{eq.material_description}</td>
                                        <td className="border-r border-slate-200 p-3 text-slate-600 font-mono text-xs">{eq.serial_no}</td>
                                        <td className="border-r border-slate-200 p-3 text-center font-bold">{eq.quantity}</td>
                                        <td className="border-r border-slate-200 p-3">{eq.make}</td>
                                        <td className="border-r border-slate-200 p-3">{eq.model}</td>
                                        <td className="border-r border-slate-200 p-3 font-mono text-xs">{eq.range}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500 italic">{eq.visual_inspection_notes || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.accessories_included || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.engineer_remarks || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.customer_remarks || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-center">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${eq.job_status === 'ISSUED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {eq.job_status || "PENDING"}
                                            </span>
                                        </td>
                                        <td className="p-2 bg-indigo-50/20">
                                            <textarea
                                                value={eq.final_remarks || ""}
                                                onChange={(e) => handleRemarkChange(idx, e.target.value)}
                                                placeholder="Type here..."
                                                rows={1}
                                                className="w-full text-xs p-2 bg-white border border-indigo-100 rounded focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all resize-none min-h-[40px]"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="mt-2 text-[10px] text-slate-400 text-right italic">
                    * Shift + Scroll to navigate horizontally
                </div>
            </div>
        </div>

        <div className="flex justify-end pt-4 pb-12">
            <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-3 bg-indigo-600 text-white px-10 py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-200 active:scale-95"
            >
                <Share2 size={20} />
                Dispatch Final Inspection Report
            </button>
        </div>

        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div 
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    onClick={() => !isSending && setIsModalOpen(false)}
                ></div>

                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Mail size={18} className="text-indigo-600" />
                            Email Final Report
                        </h3>
                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>

                    {!showSuccessUI ? (
                        <div className="p-6">
                            <p className="text-sm text-slate-500 mb-6">Enter the email addresses where the report and certificates should be sent.</p>
                            <form onSubmit={handleSendFir} className="space-y-4">
                                <div className="max-h-[250px] overflow-y-auto pr-2 space-y-3">
                                    {reportEmails.map((email, index) => (
                                        <div key={index} className="flex gap-2">
                                            <input 
                                                type="email" value={email} 
                                                onChange={(e) => {
                                                    const next = [...reportEmails];
                                                    next[index] = e.target.value;
                                                    setReportEmails(next);
                                                }} 
                                                required placeholder="recipient@email.com" 
                                                className="flex-grow px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                                            />
                                            {reportEmails.length > 1 && (
                                                <button type="button" onClick={() => removeEmailField(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><X size={18} /></button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-4 border-t border-slate-100 space-y-4">
                                    <button type="button" onClick={addEmailField} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                                        <Plus size={16} /> Add Recipient
                                    </button>
                                    <button 
                                        type="submit" disabled={isSending}
                                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                                        {isSending ? "Sending..." : "Confirm & Send Emails"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="p-10 text-center">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Successfully Sent!</h3>
                            <p className="text-sm text-slate-500 mb-6">The documents for SRF {data.srf_no} have been dispatched.</p>
                            <button 
                                onClick={() => { setIsModalOpen(false); setShowSuccessUI(false); navigate(-1); }} 
                                className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
                            >
                                Finish & Exit
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
