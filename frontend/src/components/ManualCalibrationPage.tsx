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
  Paperclip,
  FileText,
} from "lucide-react";

// --- TypeScript Interfaces ---
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
  attachments?: DeviationAttachment[];
}

type DocType = "result" | "certificate";

// --- Props Interfaces ---
interface DocumentButtonGroupProps {
  buttonText: string;
  docType: DocType;
  documentUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  onDelete: () => Promise<void>;
}

interface EquipmentDetailListProps { srfNo: string; }
interface EquipmentItemProps { equipment: BasicEquipment }

interface DeviationModalProps {
  isOpen: boolean;
  isEditMode: boolean;
  onClose: () => void;
  equipment: BasicEquipment;
  onSuccess: () => void;
}

const ManualCalibrationSkeleton: React.FC = () => (
    <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center justify-between p-5 bg-white border border-gray-200 rounded-xl">
                <div className="w-full">
                    <div className="h-7 w-32 bg-gray-300 rounded mb-2"></div>
                    <div className="h-4 w-48 bg-gray-200 rounded"></div>
                </div>
                <div className="h-6 w-6 bg-gray-200 rounded-full"></div>
            </div>
        ))}
    </div>
);

// --- DEVIATION MODAL COMPONENT ---
const DeviationModal: React.FC<DeviationModalProps> = ({ isOpen, isEditMode, onClose, equipment, onSuccess }) => {
    const [deviationId, setDeviationId] = useState<number | null>(null);
    const [deviationType, setDeviationType] = useState<'OOT' | 'NC'>('OOT');
    const [toolStatus, setToolStatus] = useState('');
    const [steps, setSteps] = useState([{ step: '', value: '' }]);
    const [engineerRemarks, setEngineerRemarks] = useState('');
    const [customerDecision, setCustomerDecision] = useState('');
    
    const [attachments, setAttachments] = useState<DeviationAttachment[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isUploadingSingle, setIsUploadingSingle] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetForm = () => {
        setDeviationId(null); setDeviationType('OOT'); setToolStatus('');
        setSteps([{ step: '', value: '' }]); setEngineerRemarks('');
        setCustomerDecision(''); setAttachments([]); setPendingFiles([]); setError(null);
    }
    
    useEffect(() => {
        if (!isOpen) { setTimeout(resetForm, 300); return; }

        const fetchDeviationData = async () => {
            if (!isEditMode) return;
            setIsLoadingData(true);
            try {
                const response = await api.get<ExternalDeviationData[]>(`/external-deviations/?inward_eqp_id=${equipment.inward_eqp_id}`);
                console.log("DEBUG: Fetched Deviation Data:", response.data);
                
                if (response.data && response.data.length > 0) {
                    const data = response.data[0];
                    setDeviationId(data.id);
                    setDeviationType(data.deviation_type);
                    setToolStatus(data.tool_status || '');
                    setEngineerRemarks(data.engineer_remarks || '');
                    setCustomerDecision(data.customer_decision || '');
                    
                    // Set attachments from backend
                    console.log("DEBUG: Attachments from Backend:", data.attachments);
                    setAttachments(data.attachments || []); 
                    
                    const stepsArray = Object.entries(data.step_per_deviation || {}).map(([step, value]) => ({ step, value: String(value) }));
                    setSteps(stepsArray.length > 0 ? stepsArray : [{ step: '', value: '' }]);
                }
            } catch (err) { 
                console.error("DEBUG: Error fetching deviation:", err);
                setError("Failed to fetch deviation details."); 
            } finally { setIsLoadingData(false); }
        };
        fetchDeviationData();
    }, [isOpen, isEditMode, equipment.inward_eqp_id]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (isEditMode && deviationId) {
            // Immediate upload if record already exists
            setIsUploadingSingle(true);
            const formData = new FormData();
            formData.append("file", file);
            try {
                const response = await api.post(`/external-deviations/${deviationId}/attachments`, formData);
                setAttachments(prev => [...prev, response.data]);
            } catch (err) { alert("Upload failed."); } finally { setIsUploadingSingle(false); }
        } else {
            // Queue for saving with the new record
            setPendingFiles(prev => [...prev, file]);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleDeleteAttachment = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this document?")) return;
        try {
            await api.delete(`/external-deviations/attachments/${id}`);
            setAttachments(prev => prev.filter(a => a.id !== id));
        } catch (err) { alert("Delete failed."); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); 
    setIsSubmitting(true);
    
    console.log("DEBUG LOG: --- Starting Submission ---");

    const payload = {
        inward_eqp_id: equipment.inward_eqp_id,
        deviation_type: deviationType,
        tool_status: toolStatus,
        step_per_deviation: deviationType === 'OOT' ? steps.reduce((acc, curr) => { 
            if(curr.step) acc[curr.step] = curr.value; return acc; 
        }, {} as Record<string, string>) : {},
        engineer_remarks: engineerRemarks,
        customer_decision: customerDecision,
    };

    try {
        let currentId = deviationId;

        // STEP 1: CREATE OR UPDATE DEVIATION (JSON ONLY)
        if (isEditMode && deviationId) {
            console.log(`DEBUG LOG: Updating existing deviation ID: ${deviationId}`);
            await api.patch(`/external-deviations/${deviationId}`, payload);
        } else {
            console.log("DEBUG LOG: Sending JSON payload to create deviation:", payload);
            // This call is now pure JSON. It will NOT trigger a 422 error.
            const response = await api.post('/external-deviations/', payload);
            currentId = response.data.id;
            console.log("DEBUG LOG: Deviation created successfully. ID:", currentId);
        }

        // STEP 2: UPLOAD ATTACHMENTS (MULTIPART)
        if (pendingFiles.length > 0 && currentId) {
            console.log(`DEBUG LOG: Found ${pendingFiles.length} pending files. Starting uploads...`);
            
            for (const file of pendingFiles) {
                const formData = new FormData();
                formData.append("file", file);
                
                console.log(`DEBUG LOG: Uploading file: ${file.name} to deviation ${currentId}`);
                try {
                    const uploadRes = await api.post(`/external-deviations/${currentId}/attachments`, formData);
                    console.log(`DEBUG LOG: File ${file.name} upload success:`, uploadRes.data);
                } catch (fileErr: any) {
                    console.error(`DEBUG LOG ERROR: File upload failed for ${file.name}:`, fileErr.response?.data || fileErr.message);
                }
            }
        }

        alert("Saved successfully!"); 
        onSuccess(); 
        onClose();
    } catch (err: any) { 
        console.error("DEBUG LOG ERROR: Main process failed", err);
        if (err.response) {
            console.error("DEBUG LOG ERROR: Backend returned 422/500 detail:", err.response.data);
        }
        setError(`Submit failed: ${err.response?.data?.detail?.[0]?.msg || "Check console for details"}`); 
    } finally { 
        setIsSubmitting(false); 
        console.log("DEBUG LOG: --- Submission Finished ---");
    }
};
    const getFileFullUrl = (url: string) => {
        if (!url) return "#";
        if (url.startsWith('http')) return url;
        const host = api.defaults.baseURL?.split('/api')[0] || '';
        return `${host}${url}`; 
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b bg-white">
                    <h3 className="text-lg font-bold text-gray-800">{isEditMode ? 'View/Edit' : 'Log'} Deviation: <span className="text-blue-600 font-mono">{equipment.nepl_id}</span></h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={24} /></button>
                </div>

                <div className="bg-blue-50/50 px-6 py-4 flex gap-6 border-b text-xs overflow-x-auto">
  <div>
    <label className="text-blue-400 font-bold uppercase block">Material Description</label>
    <p className="font-semibold">{equipment.material_description || '---'}</p>
  </div>

  <div>
    <label className="text-blue-400 font-bold uppercase block">Make</label>
    <p className="font-semibold">{equipment.make || '---'}</p>
  </div>

  <div>
    <label className="text-blue-400 font-bold uppercase block">Model</label>
    <p className="font-semibold">{equipment.model || '---'}</p>
  </div>

  <div>
    <label className="text-blue-400 font-bold uppercase block">Serial No</label>
    <p className="font-semibold">{equipment.serial_no || '---'}</p>
  </div>

  <div>
    <label className="text-blue-400 font-bold uppercase block">Range</label>
    <p className="font-semibold">{equipment.range || '---'}</p>
  </div>
</div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {isLoadingData ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div> : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm">{error}</div>}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Deviation Type</label>
                                    <select value={deviationType} onChange={(e) => setDeviationType(e.target.value as 'OOT' | 'NC')} className="w-full p-2 border border-gray-300 rounded-md">
                                        <option value="OOT">OOT (Out of Tolerance)</option>
                                        <option value="NC">NC (Not-Calibrated)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Tool Status</label>
                                    <input type="text" value={toolStatus} onChange={(e) => setToolStatus(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" />
                                </div>
                            </div>

                            {/* --- UNIFIED PREVIEW: SAVED + PENDING --- */}
                            {(attachments.length > 0 || pendingFiles.length > 0) && (
                                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                                    <label className="block text-xs font-bold text-blue-700 mb-2 flex items-center gap-2 uppercase tracking-wide">
                                        <Paperclip size={14}/> Evidence Preview ({attachments.length + pendingFiles.length})
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {/* Saved Attachments */}
                                        {attachments.map(a => (
                                            <div key={a.id} className="flex justify-between items-center bg-white p-2 border border-blue-200 rounded shadow-sm">
                                                <span className="truncate text-[11px] font-medium text-gray-700 w-32" title={a.file_name}>{a.file_name}</span>
                                                <div className="flex gap-1">
                                                    <a href={getFileFullUrl(a.file_url)} target="_blank" rel="noreferrer" className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Eye size={16}/></a>
                                                    <button type="button" onClick={() => handleDeleteAttachment(a.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                                                </div>
                                            </div>
                                        ))}
                                        {/* Local Files selected but not yet saved */}
                                        {pendingFiles.map((f, i) => (
                                            <div key={i} className="flex justify-between items-center bg-orange-50 p-2 border border-orange-200 rounded italic">
                                                <span className="truncate text-[11px] text-orange-700 w-32">{f.name} (Ready)</span>
                                                <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-red-500"><X size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {deviationType === 'OOT' ? (
                                <div className="space-y-3 p-4 bg-gray-50 border rounded-lg">
                                    <label className="block text-xs font-bold text-gray-700 uppercase">Step vs. Deviation Values</label>
                                    {steps.map((s, i) => (
                                        <div key={i} className="flex gap-2">
                                            <input placeholder="Step %" value={s.step} onChange={e => {const n=[...steps]; n[i].step=e.target.value; setSteps(n)}} className="flex-1 p-2 border rounded-md text-sm" />
                                            <input placeholder="Deviation" value={s.value} onChange={e => {const n=[...steps]; n[i].value=e.target.value; setSteps(n)}} className="flex-1 p-2 border rounded-md text-sm" />
                                            <button type="button" onClick={() => setSteps(steps.filter((_, idx) => idx !== i))} className="text-red-500 p-2"><Trash2 size={16}/></button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setSteps([...steps, {step:'', value:''}])} className="text-xs text-blue-600 font-bold">+ Add Step</button>
                                </div>
                            ) : (
                                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                                    <label className="block text-xs font-bold text-orange-800 mb-3 flex items-center gap-2 uppercase tracking-wide">
                                        <UploadCloud size={16}/> Evidence Upload
                                    </label>
                                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                                    <button 
                                        type="button" 
                                        disabled={isUploadingSingle}
                                        onClick={() => fileInputRef.current?.click()} 
                                        className="w-full py-3 border-2 border-dashed border-orange-300 rounded-xl text-orange-700 text-xs font-bold hover:bg-orange-100 flex items-center justify-center gap-2 transition-colors"
                                    >
                                        {isUploadingSingle ? <Loader2 className="animate-spin" size={18}/> : <FilePlus size={18}/>}
                                        {isUploadingSingle ? 'Uploading...' : 'Add Document'}
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <textarea placeholder="Engineer Remarks" value={engineerRemarks} onChange={e => setEngineerRemarks(e.target.value)} className="p-2 border border-gray-300 rounded-md text-sm h-24" />
                                <textarea placeholder="Customer Decision" value={customerDecision} onChange={e => setCustomerDecision(e.target.value)} className="p-2 border border-gray-300 rounded-md text-sm h-24" />
                            </div>
                        </form>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-5 py-2 text-sm text-gray-600 font-semibold">Close</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="px-8 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-all active:scale-95 disabled:bg-blue-300">
                        {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18}/>}
                        {isSubmitting ? 'Saving...' : 'Save Deviation'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- BUTTON GROUP COMPONENT ---
const DocumentButtonGroup: React.FC<DocumentButtonGroupProps> = ({ buttonText, documentUrl, onUpload, onDelete }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    return (
        <div className="inline-flex rounded-md shadow-sm border border-blue-200">
            <div className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-l-md border-r border-blue-200">{buttonText}</div>
            <input type="file" ref={fileRef} onChange={async (e) => {if(e.target.files?.[0]){setLoading(true); await onUpload(e.target.files[0]); setLoading(false);}}} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="p-1.5 hover:bg-gray-50">{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <UploadCloud className="h-4 w-4 text-blue-600"/>}</button>
            {documentUrl && (
                <>
                    <a href={documentUrl} target="_blank" rel="noreferrer" className="p-1.5 border-l hover:bg-gray-50"><Eye className="h-4 w-4 text-gray-600"/></a>
                    <button onClick={onDelete} className="p-1.5 border-l hover:bg-gray-50"><Trash2 className="h-4 w-4 text-red-500"/></button>
                </>
            )}
        </div>
    );
};

// --- EQUIPMENT ITEM COMPONENT ---
const EquipmentItem: React.FC<EquipmentItemProps> = ({ equipment }) => {
    const [details, setDetails] = useState<{ res: string | null; cert: string | null; dev: boolean; attCount: number } | null>(null);
    const [meta, setMeta] = useState<BasicEquipment>(equipment);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [docs, dev, m] = await Promise.all([
                api.get(`/manual-calibration/equipment/${equipment.inward_eqp_id}/documents`).catch(() => ({data:{}})),
                api.get(`/external-deviations/?inward_eqp_id=${equipment.inward_eqp_id}`),
                api.get(`/staff/inwards/equipment-metadata/${equipment.inward_eqp_id}`)
            ]);

            console.log(`DEBUG: Equipment ${equipment.nepl_id} attachments count:`, dev.data?.[0]?.attachments?.length);

            setMeta(m.data);
            setDetails({
                res: docs.data.calibration_worksheet_file_url || null,
                cert: docs.data.certificate_file_url || null,
                dev: dev.data && dev.data.length > 0,
                attCount: dev.data?.[0]?.attachments?.length || 0
            });
        } catch (e) { console.error("DEBUG: Equipment fetch error", e); } finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); }, [equipment.inward_eqp_id]);

    const handleUp = async (type: "result" | "certificate", file: File) => {
        const f = new FormData(); f.append("file", file); f.append("doc_type", type);
        await api.post(`/manual-calibration/equipment/${equipment.inward_eqp_id}/upload`, f);
        fetchAll();
    };

    if (loading) return <div className="p-4 bg-white border rounded-lg h-[72px] flex justify-center items-center"><Loader2 className="animate-spin text-gray-300"/></div>;

    return (
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm flex justify-between items-center group hover:border-blue-300 transition-colors">
            <div><p className="font-bold text-gray-800">{meta.nepl_id}</p><p className="text-sm text-gray-500">{meta.material_description}</p></div>
            <div className="flex gap-3 items-center">
                <DocumentButtonGroup buttonText="Calibration Results" docType="result" documentUrl={details?.res ?? null} onUpload={(f) => handleUp("result", f)} onDelete={() => api.delete(`/manual-calibration/equipment/${equipment.inward_eqp_id}/document/result`).then(fetchAll)} />
                <div className="flex items-center gap-1">
                    <button onClick={() => setModalOpen(true)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-md transition-all ${details?.dev ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'}`}>
                        <AlertTriangle size={14}/> {details?.dev ? 'View Deviation' : 'Deviation'}
                    </button>
                    
                </div>
                <DocumentButtonGroup buttonText="Certificates" docType="certificate" documentUrl={details?.cert ?? null} onUpload={(f) => handleUp("certificate", f)} onDelete={() => api.delete(`/manual-calibration/equipment/${equipment.inward_eqp_id}/document/certificate`).then(fetchAll)} />
            </div>
            <DeviationModal isOpen={modalOpen} isEditMode={details?.dev ?? false} onClose={() => setModalOpen(false)} equipment={meta} onSuccess={fetchAll} />
        </div>
    );
};

// --- LIST COMPONENT ---
const EquipmentDetailList: React.FC<EquipmentDetailListProps> = ({ srfNo }) => {
    const [list, setList] = useState<BasicEquipment[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        api.get(`/flow-configs/manual-calibration-groups/${srfNo}/equipment`).then(r => setList(r.data)).finally(() => setLoading(false));
    }, [srfNo]);
    if (loading) return <div className="p-6 text-center"><Loader2 className="animate-spin mx-auto text-gray-400"/></div>;
    return <div className="bg-gray-50 p-4 border-t space-y-3">{list.map(e => <EquipmentItem key={e.inward_eqp_id} equipment={e} />)}</div>;
};

// --- PAGE COMPONENT ---
const ManualCalibrationPage: React.FC = () => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState<SrfGroupSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSrf, setActiveSrf] = useState<string | null>(null);

    useEffect(() => {
        api.get('/flow-configs/manual-calibration-groups').then(r => setGroups(r.data)).finally(() => setLoading(false));
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="bg-white p-6 rounded-2xl border flex justify-between items-center shadow-sm">
                    <div className="flex gap-4 items-center">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl shadow-inner"><ClipboardEdit size={32}/></div>
                        <div><h2 className="text-2xl font-black">Manual Calibration</h2><p className="text-gray-500 text-sm">Upload records and manage deviations</p></div>
                    </div>
                    <button onClick={() => navigate("/engineer")} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl flex items-center gap-2 hover:bg-gray-50 transition-all font-bold text-sm shadow-sm"><ArrowLeft size={18}/> Back</button>
                </div>
                <div className="space-y-4">
                    {loading ? <ManualCalibrationSkeleton /> : groups.map(g => (
                        <div key={g.srf_no} className="bg-white rounded-2xl border border-gray-200 shadow-sm transition-all overflow-hidden">
                            <div onClick={() => setActiveSrf(activeSrf === g.srf_no ? null : g.srf_no)} className="p-6 flex justify-between items-center cursor-pointer hover:bg-gray-50">
                                <div><p className="font-black text-xl text-blue-700 tracking-tight">{g.srf_no}</p><p className="text-sm text-gray-600 font-bold">{g.customer_name} • {g.equipment_count} Items</p></div>
                                <ChevronRight className={`transition-transform duration-300 ${activeSrf === g.srf_no ? 'rotate-90' : ''}`} />
                            </div>
                            {activeSrf === g.srf_no && <EquipmentDetailList srfNo={g.srf_no} />}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ManualCalibrationPage;