import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/config";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardEdit,
  UploadCloud,
  Eye,
  Trash2,
  Loader2,
  AlertTriangle,
  X,
  Plus,
  CheckCircle2,
  Calendar,
  Search,
  Package,
  FileText,
  User,
  Download,
  MinusCircle,
  Info,
} from "lucide-react";
 
// --- Interfaces ---
interface SrfGroupSummary {
  srf_no: string;
  customer_name: string;
  received_date: string;
  equipment_count: number;
}
 
interface BasicEquipment {
  inward_eqp_id: number;
  nepl_id: string;
  material_description: string;
  make?: string;
  model?: string;
  serial_no?: string;
  range?: string;
}
 
interface DeviationAttachment {
  id: number | string;
  file_name: string;
  file_url: string;  
  isLocal?: boolean;
  fileObject?: File;
}
 
interface ExternalDeviationData {
  id: number;
  inward_eqp_id: number;
  deviation_type: 'OOT' | 'NC';
  tool_status: string;
  step_per_deviation: Record<string, any>;
  engineer_remarks?: string;
  customer_decision?: string;
  report?: string;
  attachments?: DeviationAttachment[];
}
 
// --- UTILITY: PREFIX-STRIPPING DOWNLOAD LOGIC ---
const coreDownload = async (url: string, original_name: string) => {
    try {
        if (url.startsWith('blob:')) {
            const link = document.createElement('a');
            link.href = url;
            link.download = original_name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', original_name);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error("Download failed:", error);
        window.open(url, '_blank');
    }
};
 
const handleView = (url: string, fileName: string) => {
    const isExcel = fileName.match(/\.(xlsx|xls|csv)$/i);
    if (isExcel) {
        coreDownload(url, fileName);
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
};
 
const handleDownload = (url: string, fileName: string) => coreDownload(url, fileName);
 
// --- DEVIATION MODAL COMPONENT ---
const DeviationModal: React.FC<{
    isOpen: boolean;
    isEditMode: boolean;
    onClose: () => void;
    equipment: BasicEquipment;
    onSuccess: () => void;
}> = ({ isOpen, isEditMode, onClose, equipment, onSuccess }) => {
    const [deviationId, setDeviationId] = useState<number | null>(null);
    const [deviationType, setDeviationType] = useState<'OOT' | 'NC'>('OOT');
    const [toolStatus, setToolStatus] = useState('');
    const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [steps, setSteps] = useState<{ step: string; value: string }[]>([{ step: '', value: '' }]);
    const [engineerRemarks, setEngineerRemarks] = useState('');
    const [customerDecision, setCustomerDecision] = useState('');
    const [attachments, setAttachments] = useState<DeviationAttachment[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
 
    useEffect(() => {
        if (!isOpen) return;
        if (!isEditMode) {
            setDeviationId(null); setDeviationType('OOT'); setToolStatus(''); setEngineerRemarks('');
            setCustomerDecision(''); setAttachments([]); setSteps([{ step: '', value: '' }]);
            return;
        }
        setIsLoadingData(true);
        api.get<ExternalDeviationData[]>(`/external-deviations/?inward_eqp_id=${equipment.inward_eqp_id}`)
           .then(res => {
               if(res.data?.[0]) {
                   const d = res.data[0];
                   setDeviationId(d.id);
                   setDeviationType(d.deviation_type);
                   setToolStatus(d.tool_status || '');
                   setReportDate(d.report || new Date().toISOString().split('T')[0]);
                   setEngineerRemarks(d.engineer_remarks || '');
                   setCustomerDecision(d.customer_decision || '');
                   setAttachments(d.attachments || []);
                   const s = Object.entries(d.step_per_deviation || {}).map(([step, value]) => ({ step, value: String(value) }));
                   setSteps(s.length > 0 ? s : [{ step: '', value: '' }]);
               }
           }).finally(() => setIsLoadingData(false));
    }, [isOpen, isEditMode, equipment.inward_eqp_id]);
 
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const newAttachment: DeviationAttachment = {
                id: `local-${Date.now()}`,
                file_name: file.name,
                file_url: URL.createObjectURL(file),
                isLocal: true,
                fileObject: file
            };
            setAttachments(prev => [...prev, newAttachment]);
        }
    };
 
    const addStep = () => setSteps([...steps, { step: '', value: '' }]);
    const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx));
    const updateStep = (idx: number, field: 'step' | 'value', val: string) => {
        const updated = [...steps]; updated[idx][field] = val; setSteps(updated);
    };
 
    const handleSubmit = async () => {
        setIsSubmitting(true);
        const stepPerDevObj = deviationType === 'OOT' ? steps.reduce((acc, curr) => { if(curr.step) acc[curr.step] = curr.value; return acc; }, {} as any) : {};
        const payload = {
            inward_eqp_id: equipment.inward_eqp_id,
            deviation_type: deviationType,
            tool_status: toolStatus,
            report: reportDate,
            step_per_deviation: stepPerDevObj,
            engineer_remarks: engineerRemarks,
            customer_decision: customerDecision,
        };
 
        try {
            let currentId = deviationId;
            if (isEditMode && deviationId) { await api.patch(`/external-deviations/${deviationId}`, payload); }
            else { const res = await api.post('/external-deviations/', payload); currentId = res.data.id; }
            const localFiles = attachments.filter(a => a.isLocal && a.fileObject);
            if (deviationType !== 'OOT' && localFiles.length > 0 && currentId) {
                for (const att of localFiles) {
                    const formData = new FormData();
                    formData.append("file", att.fileObject!);
                    await api.post(`/external-deviations/${currentId}/attachments`, formData);
                }
            }
            alert("Saved successfully!");
            onSuccess(); // Triggers the refresh in parent
            onClose();
        } catch (err) { alert("Failed to save"); } finally { setIsSubmitting(false); }
    };
 
    const getFileFullUrl = (url: string) => url.startsWith('http') || url.startsWith('blob') ? url : `${api.defaults.baseURL?.split('/api')[0]}${url}`;
 
    if (!isOpen) return null;
 
    return (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b bg-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl"><AlertTriangle size={20}/></div>
                        <h3 className="text-xl font-bold text-gray-900">{isEditMode ? 'View/Edit' : 'Log'} Deviation</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                </div>
 
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* PROFESSIONAL 2-ROW EQUIPMENT INFO */}
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-5 text-gray-800">
                            <div className="p-1.5 bg-blue-600 text-white rounded-lg"><Info size={16} /></div>
                            <h4 className="font-bold text-xs uppercase tracking-widest">Equipment Specification</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-8">
                            <div className="col-span-2 md:col-span-3">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">Material Description</label>
                                <p className="text-sm font-semibold text-gray-900">{equipment.material_description || 'N/A'}</p>
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">NEPL ID</label>
                                <p className="text-sm font-mono font-bold text-blue-600">{equipment.nepl_id || 'N/A'}</p>
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">Make</label>
                                <p className="text-sm font-medium text-gray-700">{equipment.make || 'N/A'}</p>
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">Model</label>
                                <p className="text-sm font-medium text-gray-700">{equipment.model || 'N/A'}</p>
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">Serial No</label>
                                <p className="text-sm font-medium text-gray-700">{equipment.serial_no || 'N/A'}</p>
                            </div>
                            <div className="col-span-1">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">Range</label>
                                <p className="text-sm font-medium text-gray-700">{equipment.range || 'N/A'}</p>
                            </div>
                        </div>
                    </div>
 
                    {isLoadingData ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div> : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Type</label>
                                    <select value={deviationType} onChange={(e) => setDeviationType(e.target.value as 'OOT' | 'NC')} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm">
                                        <option value="OOT">OOT (Out of Tolerance)</option>
                                        <option value="NC">NC (Not Calibrated)</option>
                                    </select>
                                </div>
                                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tool Status</label>
                                    <input type="text" value={toolStatus} onChange={(e) => setToolStatus(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Date</label>
                                    <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                            </div>
                            {deviationType === 'OOT' && (
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">OOT Observations</label>
                                    </div>
                                    <div className="space-y-2 mb-3">
                                        {steps.map((s, idx) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <input placeholder="Step %" value={s.step} onChange={(e) => updateStep(idx, 'step', e.target.value)} className="flex-1 p-2 border border-gray-300 rounded-lg text-sm" />
                                                <input placeholder="Reading" value={s.value} onChange={(e) => updateStep(idx, 'value', e.target.value)} className="flex-1 p-2 border border-gray-300 rounded-lg text-sm" />
                                                <button onClick={() => removeStep(idx)} className="text-gray-400 hover:text-red-500 transition-colors"><MinusCircle size={18} /></button>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={addStep} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"><Plus size={14}/> Add Row</button>
                                </div>
                            )}
                            {deviationType !== 'OOT' && (
                                <div className="space-y-3">
                                    <label className="block text-xs font-semibold text-gray-500 uppercase">Attachments</label>
                                    <div className="grid gap-2">
                                        {attachments.map(a => (
                                            <div key={a.id} className="flex justify-between items-center bg-gray-50 p-3 border border-gray-200 rounded-xl">
                                                <span className="text-xs font-medium text-gray-700 truncate w-3/4">{a.file_name}</span>
                                                <div className="flex gap-1">
                                                    <button onClick={() => handleView(getFileFullUrl(a.file_url), a.file_name)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"><Eye size={16}/></button>
                                                    <button onClick={() => handleDownload(getFileFullUrl(a.file_url), a.file_name)} className="p-2 text-green-600 hover:bg-green-100 rounded-lg"><Download size={16}/></button>
                                                    <button onClick={() => setAttachments(attachments.filter(at => at.id !== a.id))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 hover:border-blue-300 transition-all">+ Add File</button>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Remarks</label><textarea value={engineerRemarks} onChange={e => setEngineerRemarks(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl text-sm h-24" /></div>
                                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Decision</label><textarea value={customerDecision} onChange={e => setCustomerDecision(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl text-sm h-24" /></div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-600">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-700 transition-all flex items-center gap-2">
                        {isSubmitting ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} Save Deviation
                    </button>
                </div>
            </div>
        </div>
    );
};
 
// --- EQUIPMENT ITEM ---
const EquipmentItem: React.FC<{
    equipment: BasicEquipment;
    refreshTrigger: number; // Added to force update
    onOpenDeviation: (eqp: BasicEquipment, isEdit: boolean) => void
}> = ({ equipment, onOpenDeviation, refreshTrigger }) => {
    const [docs, setDocs] = useState<any>(null);
    const [loading, setLoading] = useState(true);
 
    const fetchAll = async () => {
        setLoading(true);
        try {
            const [d, dv] = await Promise.all([
                api.get(`/manual-calibration/equipment/${equipment.inward_eqp_id}/documents`).catch(() => ({data:{}})),
                api.get(`/external-deviations/?inward_eqp_id=${equipment.inward_eqp_id}`)
            ]);
            setDocs({
                res: d.data.calibration_worksheet_file_url ? `${api.defaults.baseURL?.split('/api')[0]}${d.data.calibration_worksheet_file_url}` : null,
                resN: d.data.calibration_worksheet_file_name || null,
                cert: d.data.certificate_file_url ? `${api.defaults.baseURL?.split('/api')[0]}${d.data.certificate_file_url}` : null,
                certN: d.data.certificate_file_name || null,
                dev: dv.data?.length > 0
            });
        } finally { setLoading(false); }
    };
 
    // React to refreshTrigger changing
    useEffect(() => { fetchAll(); }, [equipment.inward_eqp_id, refreshTrigger]);
 
    const handleUp = async (type: string, file: File) => {
        const f = new FormData(); f.append("file", file); f.append("doc_type", type);
        await api.post(`/manual-calibration/equipment/${equipment.inward_eqp_id}/upload`, f);
        fetchAll();
    };
 
    if (loading) return <tr><td colSpan={3} className="h-16 animate-pulse bg-white"></td></tr>;
 
    return (
        <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100">
            <td className="px-6 py-4 font-medium text-blue-600 text-sm">{equipment.nepl_id}</td>
            <td className="px-6 py-4 text-gray-900 text-sm font-medium">{equipment.material_description}</td>
            <td className="px-6 py-4">
                <div className="flex gap-3 items-center">
                    <div className="inline-flex rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden h-10">
                        <div className="px-3 py-1.5 text-[10px] font-semibold bg-gray-50 text-gray-500 border-r border-gray-200 flex items-center uppercase tracking-wider">Calibration Worksheet</div>
                        <button onClick={() => {
                            const i = document.createElement('input'); i.type = 'file';
                            i.onchange = (e: any) => e.target.files[0] && handleUp("result", e.target.files[0]); i.click();
                        }} className="p-2.5 hover:bg-blue-50 text-blue-600"><UploadCloud size={16}/></button>
                        {docs?.res && (
                            <>
                                <button onClick={() => handleView(docs.res, docs.resN)} className="p-2.5 border-l border-gray-100 hover:bg-blue-50 text-gray-600"><Eye size={16}/></button>
                                <button onClick={() => handleDownload(docs.res, docs.resN)} className="p-2.5 border-l border-gray-100 hover:bg-green-50 text-green-600"><Download size={16}/></button>
                                <button onClick={() => api.delete(`/manual-calibration/equipment/${equipment.inward_eqp_id}/document/result`).then(fetchAll)} className="p-2.5 border-l border-gray-100 hover:bg-red-50 text-red-500"><Trash2 size={16}/></button>
                            </>
                        )}
                    </div>
                    <button onClick={() => onOpenDeviation(equipment, docs?.dev)} className={`h-10 px-3 text-[10px] font-semibold border rounded-lg flex items-center gap-1.5 uppercase transition-all ${docs?.dev ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}>
                        <AlertTriangle size={14}/> {docs?.dev ? 'View Deviation' : 'Log Deviation'}
                    </button>
                    <div className="inline-flex rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden h-10">
                        <div className="px-3 py-1.5 text-[10px] font-semibold bg-gray-50 text-gray-500 border-r border-gray-200 flex items-center uppercase tracking-wider">Certificates</div>
                        <button onClick={() => {
                            const i = document.createElement('input'); i.type = 'file';
                            i.onchange = (e: any) => e.target.files[0] && handleUp("certificate", e.target.files[0]); i.click();
                        }} className="p-2.5 hover:bg-blue-50 text-blue-600"><UploadCloud size={16}/></button>
                        {docs?.cert && (
                            <>
                                <button onClick={() => handleView(docs.cert, docs.certN)} className="p-2.5 border-l border-gray-100 hover:bg-blue-50 text-gray-600"><Eye size={16}/></button>
                                <button onClick={() => handleDownload(docs.cert, docs.certN)} className="p-2.5 border-l border-gray-100 hover:bg-green-50 text-green-600"><Download size={16}/></button>
                                <button onClick={() => api.delete(`/manual-calibration/equipment/${equipment.inward_eqp_id}/document/certificate`).then(fetchAll)} className="p-2.5 border-l border-gray-100 hover:bg-red-50 text-red-500"><Trash2 size={16}/></button>
                            </>
                        )}
                    </div>
                </div>
            </td>
        </tr>
    );
};
 
// --- SUB-PAGE ---
const EquipmentDetailList: React.FC<{ group: SrfGroupSummary; onBack: () => void }> = ({ group, onBack }) => {
    const [list, setList] = useState<BasicEquipment[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger to re-fetch document status
   
    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; isEdit: boolean; eqp: BasicEquipment | null }>({
        isOpen: false, isEdit: false, eqp: null
    });
 
    const fetchList = () => {
        api.get(`/flow-configs/manual-calibration-groups/${group.srf_no}/equipment`)
           .then(r => setList(r.data))
           .finally(() => setLoading(false));
    };
 
    useEffect(() => { fetchList(); }, [group.srf_no]);
 
    const handleSuccess = () => {
        setRefreshTrigger(prev => prev + 1); // This notifies children to update button labels
        fetchList();
    };
 
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
                <div><h1 className="text-2xl font-bold text-gray-900">Job Details</h1><p className="text-gray-500 text-sm mt-1">SRF: {group.srf_no}</p></div>
                <button onClick={onBack} className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"><ArrowLeft size={16} /><span>Back</span></button>
            </div>
           
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-200 flex items-start gap-3"><div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><User size={20}/></div><div><p className="text-xs font-semibold text-gray-500 uppercase">Customer</p><p className="font-medium text-gray-900">{group.customer_name}</p></div></div>
                <div className="bg-white p-5 rounded-2xl border border-gray-200 flex items-start gap-3"><div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl"><Calendar size={20}/></div><div><p className="text-xs font-semibold text-gray-500 uppercase">Received</p><p className="font-medium text-gray-900">{new Date(group.received_date).toLocaleDateString('en-GB')}</p></div></div>
                <div className="bg-white p-5 rounded-2xl border border-gray-200 flex items-start gap-3"><div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Package size={20}/></div><div><p className="text-xs font-semibold text-gray-500 uppercase">Items</p><p className="font-medium text-gray-900">{group.equipment_count} Equipments</p></div></div>
            </div>
 
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200"><th className="px-6 py-4 font-semibold">NEPL ID</th><th className="px-6 py-4 font-semibold">Description</th><th className="px-6 py-4 font-semibold text-center">Actions</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                        {!loading && list.map(e => (
                            <EquipmentItem
                                key={e.inward_eqp_id}
                                equipment={e}
                                refreshTrigger={refreshTrigger}
                                onOpenDeviation={(eqp, isEdit) => setModalConfig({ isOpen: true, isEdit, eqp })}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
 
            {modalConfig.isOpen && modalConfig.eqp && (
                <DeviationModal
                    isOpen={modalConfig.isOpen}
                    isEditMode={modalConfig.isEdit}
                    equipment={modalConfig.eqp}
                    onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                    onSuccess={handleSuccess}
                />
            )}
        </div>
    );
};
 
// --- MAIN PAGE ---
const ManualCalibrationPage: React.FC = () => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<SrfGroupSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedGroup, setSelectedGroup] = useState<SrfGroupSummary | null>(null);
 
    useEffect(() => {
        api.get('/flow-configs/manual-calibration-groups').then(r => setGroups(r.data)).finally(() => setLoading(false));
    }, []);
 
    const filtered = groups.filter(g => g.srf_no.toLowerCase().includes(searchTerm.toLowerCase()) || g.customer_name.toLowerCase().includes(searchTerm.toLowerCase()));
 
    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">
                {!selectedGroup && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100"><ClipboardEdit size={28}/></div>
                            <div><h2 className="text-2xl font-bold text-gray-900 tracking-tight">Manual Calibration</h2><p className="text-gray-500 text-sm mt-1">Manage OOT/NC and certificates</p></div>
                        </div>
                        <button onClick={() => navigate("/engineer")} className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-all shadow-sm"><ArrowLeft size={16}/><span>Back to Dashboard</span></button>
                    </div>
                )}
                {loading ? <div className="space-y-4">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse"></div>)}</div> : selectedGroup ? (
                    <EquipmentDetailList group={selectedGroup} onBack={() => setSelectedGroup(null)} />
                ) : (
                    <div className="space-y-4">
                        <div className="bg-white p-5 border border-gray-200 rounded-2xl shadow-sm">
                            <div className="relative max-w-md w-full"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-4 w-4 text-gray-400" /></div><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" /></div>
                        </div>
                        <div className="space-y-3">
                            {filtered.map(g => (
                                <div key={g.srf_no} onClick={() => setSelectedGroup(g)} className="flex items-center justify-between p-5 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-xl transition-all duration-200 group cursor-pointer shadow-sm hover:shadow-md">
                                    <div className="flex items-start gap-4">
                                        <div className="mt-1 p-2.5 bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600 rounded-full transition-colors"><FileText size={20}/></div>
                                        <div><p className="font-semibold text-lg text-gray-800">SRF No: {g.srf_no}</p><p className="text-sm text-gray-600 mt-1">Customer: {g.customer_name} — Items: {g.equipment_count}</p><p className="text-xs text-gray-400 font-medium mt-1 uppercase">Received: {new Date(g.received_date).toLocaleDateString('en-GB')}</p></div>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-all transform group-hover:translate-x-1" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
 
export default ManualCalibrationPage;