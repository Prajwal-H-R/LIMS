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
  FilePlus,
CheckCircle2,
  Calendar,
  Search,
  Package,
  FileText,
  User,
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
  id: number;
  file_name: string; 
  file_url: string;  
  created_at: string;
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

// --- UTILITY: VIEW OR DOWNLOAD (With Prefix Stripping) ---
const handleViewOrDownload = async (fileUrl: string, originalName: string) => {
    if (!fileUrl) return;
    const isExcel = /\.(xlsx|xls|csv)$/i.test(originalName);
    if (isExcel) {
        try {
            const response = await fetch(fileUrl);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = originalName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) { window.open(fileUrl, '_blank'); }
    } else {
        window.open(fileUrl, '_blank', 'noopener,noreferrer');
    }
};

const ManualCalibrationSkeleton: React.FC = () => (
    <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse"></div>
        ))}
    </div>
);

// --- DEVIATION MODAL COMPONENT ---
const DeviationModal: React.FC<{ isOpen: boolean; isEditMode: boolean; onClose: () => void; equipment: BasicEquipment; onSuccess: () => void; }> = ({ isOpen, isEditMode, onClose, equipment, onSuccess }) => {
    const [deviationId, setDeviationId] = useState<number | null>(null);
    const [deviationType, setDeviationType] = useState<'OOT' | 'NC'>('OOT');
    const [toolStatus, setToolStatus] = useState('');
    const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [steps, setSteps] = useState([{ step: '', value: '' }]);
    const [engineerRemarks, setEngineerRemarks] = useState('');
    const [customerDecision, setCustomerDecision] = useState('');
    const [attachments, setAttachments] = useState<DeviationAttachment[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        if (!isEditMode) {
            setDeviationId(null); setDeviationType('OOT'); setToolStatus(''); setEngineerRemarks(''); setCustomerDecision(''); setAttachments([]); setPendingFiles([]); setSteps([{ step: '', value: '' }]);
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

    const handleSubmit = async () => {
        setIsSubmitting(true);
        const payload = {
            inward_eqp_id: equipment.inward_eqp_id,
            deviation_type: deviationType,
            tool_status: toolStatus,
            report: reportDate,
            step_per_deviation: deviationType === 'OOT' ? steps.reduce((acc, curr) => { if(curr.step) acc[curr.step] = curr.value; return acc; }, {} as any) : {},
            engineer_remarks: engineerRemarks,
            customer_decision: customerDecision,
        };
        try {
            let currentId = deviationId;
            if (isEditMode && deviationId) { await api.patch(`/external-deviations/${deviationId}`, payload); } 
            else { const res = await api.post('/external-deviations/', payload); currentId = res.data.id; }
            
            if (pendingFiles.length > 0 && currentId) {
                for (const file of pendingFiles) {
                    const formData = new FormData();
                    formData.append("file", file);
                    await api.post(`/external-deviations/${currentId}/attachments`, formData);
                }
            }
            alert("Saved successfully!"); onSuccess(); onClose();
        } catch (err) { alert("Failed to save deviation"); } finally { setIsSubmitting(false); }
    };

    const getFileFullUrl = (url: string) => url.startsWith('http') ? url : `${api.defaults.baseURL?.split('/api')[0]}${url}`;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl"><AlertTriangle size={20}/></div>
                        <h3 className="text-xl font-bold text-gray-900">{isEditMode ? 'View/Edit' : 'Log'} Deviation</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {isLoadingData ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div> : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">NEPL ID</p><p className="font-medium text-blue-600 mt-1">{equipment.nepl_id}</p></div>
                                <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</p><p className="font-medium text-gray-900 mt-1 truncate">{equipment.material_description}</p></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Type</label>
                                    <select value={deviationType} onChange={(e) => setDeviationType(e.target.value as 'OOT' | 'NC')} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                                        <option value="OOT">OOT</option><option value="NC">NC</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tool Status</label>
                                    <input type="text" value={toolStatus} onChange={(e) => setToolStatus(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Report Date</label>
                                    <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" />
                                </div>
                            </div>

                            {deviationType === 'OOT' && (
                                <div className="space-y-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Step vs Deviation</label>
                                    {steps.map((s, i) => (
                                        <div key={i} className="flex gap-2">
                                            <input placeholder="Step %" value={s.step} onChange={e => {const n=[...steps]; n[i].step=e.target.value; setSteps(n)}} className="flex-1 p-2 border border-gray-300 rounded-lg text-sm" />
                                            <input placeholder="Value" value={s.value} onChange={e => {const n=[...steps]; n[i].value=e.target.value; setSteps(n)}} className="flex-1 p-2 border border-gray-300 rounded-lg text-sm" />
                                            <button onClick={() => setSteps(steps.filter((_, idx) => idx !== i))} className="text-red-500 p-2 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                                        </div>
                                    ))}
                                    <button onClick={() => setSteps([...steps, {step:'', value:''}])} className="text-xs font-bold text-blue-600 hover:underline">+ Add Row</button>
                                </div>
                            )}



                            <div className="space-y-3">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Evidence Attachments</label>
                                <div className="grid gap-2">
                                    {attachments.map(a => (
                                        <div key={a.id} className="flex justify-between items-center bg-gray-50 p-3 border border-gray-200 rounded-xl">
                                            <span className="text-xs font-medium text-gray-700 truncate w-3/4">{a.file_name}</span>
                                            <button onClick={() => handleViewOrDownload(getFileFullUrl(a.file_url), a.file_name)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"><Eye size={18}/></button>
                                        </div>
                                    ))}
                                    {pendingFiles.map((f, i) => (
                                        <div key={i} className="flex justify-between items-center bg-orange-50 p-3 border border-orange-100 rounded-xl text-xs text-orange-700 italic">
                                            <span>{f.name} (Pending)</span>
                                            <button onClick={() => setPendingFiles(pendingFiles.filter((_, idx) => idx !== i))}><X size={16}/></button>
                                        </div>
                                    ))}
                                </div>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={e => e.target.files && setPendingFiles([...pendingFiles, e.target.files[0]])} />
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 hover:border-blue-300 transition-all">+ Add File</button>
                            </div>
                        </div>
                    )}
                                                <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Engineer Remarks</label><textarea value={engineerRemarks} onChange={e => setEngineerRemarks(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl text-sm h-24 focus:ring-2 focus:ring-blue-500" /></div>
                                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Customer Decision</label><textarea value={customerDecision} onChange={e => setCustomerDecision(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl text-sm h-24 focus:ring-2 focus:ring-blue-500" /></div>
                            </div>
                </div>
                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:bg-blue-300 transition-all flex items-center gap-2">
                        {isSubmitting ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} Save Deviation
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- ACTION BUTTON GROUP ---
const ActionButtonGroup: React.FC<{ text: string; url: string | null; name: string | null; onUp: (f: File) => void; onDel: () => void; }> = ({ text, url, name, onUp, onDel }) => {
    const fRef = useRef<HTMLInputElement>(null);
    const [upLoading, setUpLoading] = useState(false);
    return (
        <div className="inline-flex rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden h-9">
            <div className="px-3 py-1.5 text-[10px] font-semibold bg-gray-50 text-gray-500 border-r border-gray-200 flex items-center uppercase tracking-wider">{text}</div>
            <input type="file" ref={fRef} className="hidden" onChange={async (e) => {if(e.target.files?.[0]){ setUpLoading(true); await onUp(e.target.files[0]); setUpLoading(false); }}} />
            <button onClick={() => fRef.current?.click()} className="p-2 hover:bg-blue-50 text-blue-600">{upLoading ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>}</button>
            {url && (
                <>
                    <button onClick={() => name && handleViewOrDownload(url, name)} className="p-2 border-l border-gray-100 hover:bg-blue-50 text-gray-600"><Eye size={16}/></button>
                    <button onClick={onDel} className="p-2 border-l border-gray-100 hover:bg-red-50 text-red-500"><Trash2 size={16}/></button>
                </>
            )}
        </div>
    );
};

// --- EQUIPMENT ITEM (TABLE ROW) ---
const EquipmentItem: React.FC<{ equipment: BasicEquipment }> = ({ equipment }) => {
    const [docs, setDocs] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [d, dv] = await Promise.all([
                api.get(`/manual-calibration/equipment/${equipment.inward_eqp_id}/documents`).catch(() => ({data:{}})),
                api.get(`/external-deviations/?inward_eqp_id=${equipment.inward_eqp_id}`)
            ]);
            setDocs({
                res: d.data.calibration_worksheet_file_url ? `${api.defaults.baseURL?.split('/api')[0]}${d.data.calibration_worksheet_file_url}` : null,
                resN: d.data.calibration_worksheet_file_name,
                cert: d.data.certificate_file_url ? `${api.defaults.baseURL?.split('/api')[0]}${d.data.certificate_file_url}` : null,
                certN: d.data.certificate_file_name,
                dev: dv.data?.length > 0
            });
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); }, [equipment.inward_eqp_id]);

    if (loading) return <tr><td colSpan={3} className="h-16 animate-pulse bg-white"></td></tr>;

    return (
        <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100">
            <td className="px-6 py-4 font-medium text-blue-600 text-sm">{equipment.nepl_id}</td>
            <td className="px-6 py-4 text-gray-900 text-sm">{equipment.material_description}</td>
            <td className="px-6 py-4">
                <div className="flex gap-3 items-center">
                    <ActionButtonGroup text="Worksheet" url={docs?.res} name={docs?.resN} onUp={(f) => {const fd=new FormData(); fd.append("file",f); fd.append("doc_type","result"); api.post(`/manual-calibration/equipment/${equipment.inward_eqp_id}/upload`,fd).then(fetchAll)}} onDel={() => api.delete(`/manual-calibration/equipment/${equipment.inward_eqp_id}/document/result`).then(fetchAll)} />
                    <button onClick={() => setModalOpen(true)} className={`h-9 px-3 text-[10px] font-semibold border rounded-lg flex items-center gap-1.5 uppercase transition-all tracking-tight ${docs?.dev ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}>
                        <AlertTriangle size={14}/> {docs?.dev ? 'View Deviation' : 'Log Deviation'}
                    </button>
                    <ActionButtonGroup text="Cert" url={docs?.cert} name={docs?.certN} onUp={(f) => {const fd=new FormData(); fd.append("file",f); fd.append("doc_type","certificate"); api.post(`/manual-calibration/equipment/${equipment.inward_eqp_id}/upload`,fd).then(fetchAll)}} onDel={() => api.delete(`/manual-calibration/equipment/${equipment.inward_eqp_id}/document/certificate`).then(fetchAll)} />
                </div>
            </td>
            <DeviationModal isOpen={modalOpen} isEditMode={docs?.dev} onClose={() => setModalOpen(false)} equipment={equipment} onSuccess={fetchAll} />
        </tr>
    );
};

// --- SUB-PAGE (DETAIL LIST) ---
const EquipmentDetailList: React.FC<{ group: SrfGroupSummary; onBack: () => void }> = ({ group, onBack }) => {
    const [list, setList] = useState<BasicEquipment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/flow-configs/manual-calibration-groups/${group.srf_no}/equipment`).then(r => setList(r.data)).finally(() => setLoading(false));
    }, [group.srf_no]);

    return (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
                <div><h1 className="text-2xl font-bold text-gray-900 tracking-tight">Job Details</h1><p className="text-gray-500 text-sm mt-1">SRF: <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700 border border-gray-200">{group.srf_no}</span></p></div>
                <button onClick={onBack} className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm focus:outline-none"><ArrowLeft size={16} /><span>Back to List</span></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-start gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><User size={20}/></div>
                    <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</p><p className="font-medium text-gray-900 mt-1">{group.customer_name}</p></div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-start gap-3">
                    <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl"><Calendar size={20}/></div>
                    <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inward Date</p><p className="font-medium text-gray-900 mt-1">{new Date(group.received_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-start gap-3">
                    <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Package size={20}/></div>
                    <div><p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Equipments</p><p className="font-medium text-gray-900 mt-1">{group.equipment_count} Items</p></div>
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200"><th className="px-6 py-4 font-semibold">NEPL ID</th><th className="px-6 py-4 font-semibold">Description</th><th className="px-6 py-4 font-semibold">Actions & Evidence</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">{loading ? <tr><td colSpan={3} className="text-center p-10"><Loader2 className="animate-spin inline text-blue-600"/></td></tr> : list.map(e => <EquipmentItem key={e.inward_eqp_id} equipment={e} />)}</tbody>
                </table>
            </div>
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
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-500">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100"><ClipboardEdit size={28}/></div>
                            <div><h2 className="text-2xl font-bold text-gray-900 tracking-tight">Manual Calibration</h2><p className="text-gray-500 text-sm mt-1">Manage OOT/NC and upload certificates</p></div>
                        </div>
                        <button onClick={() => navigate("/engineer")} className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-all shadow-sm"><ArrowLeft size={16}/><span>Back to Dashboard</span></button>
                    </div>
                )}

                {loading ? <ManualCalibrationSkeleton /> : selectedGroup ? (
                    <EquipmentDetailList group={selectedGroup} onBack={() => setSelectedGroup(null)} />
                ) : (
                    <div className="space-y-4">
                        <div className="bg-white p-5 border border-gray-200 rounded-2xl shadow-sm">
                            <div className="relative max-w-md w-full"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-4 w-4 text-gray-400" /></div><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by SRF or Customer..." className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" /></div>
                        </div>
                        <div className="space-y-3">
                            {filtered.map(g => (
                                <div key={g.srf_no} onClick={() => setSelectedGroup(g)} className="flex items-center justify-between p-5 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-xl transition-all duration-200 group shadow-sm hover:shadow-md cursor-pointer">
                                    <div className="flex items-start gap-4">
                                        <div className="mt-1 p-2.5 bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600 rounded-full transition-colors"><FileText size={20}/></div>
                                        <div>
                                            <p className="font-semibold text-lg text-gray-800">SRF No: {g.srf_no}</p>
                                            <p className="text-sm text-gray-600 mt-1">Customer: <span className="font-medium text-gray-900">{g.customer_name}</span> — Items: <span className="font-medium text-gray-700">{g.equipment_count}</span></p>
                                            <p className="text-xs text-gray-400 font-medium flex items-center gap-1 mt-1"><Calendar size={12}/> {new Date(g.received_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-all transform group-hover:translate-x-1" />
                                </div>
                            ))}
                            {filtered.length === 0 && <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400 font-medium">No results found</div>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ManualCalibrationPage;