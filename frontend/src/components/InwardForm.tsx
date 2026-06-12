import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom"; // Added for rendering modals above everything
import { useNavigate, useParams } from "react-router-dom";
import { 
  Plus, Trash2, Eye, Save, FileText, Loader2, X, ArrowLeft, 
  Camera, Clock, Send, Wrench, AlertCircle, CheckCircle2, 
  Download, UserPlus, MapPin, Receipt, PackagePlus, MessageSquare, 
  Lock, Settings, Pencil, Search, ChevronDown, Star, Building2, UserCog
} from 'lucide-react';
import { InwardForm as InwardFormType, EquipmentDetail as BaseEquipmentDetail, InwardDetail } from '../types/inward';
import { api, ENDPOINTS, BACKEND_ROOT_URL } from '../api/config';
import { useAuth } from '../auth/AuthProvider';
import { generateStandardInwardPDF } from '../utils/InwardPDFHelper'; 
import { useRecordLock } from '../hooks/useRecordLock'; 
import { HTWManufacturerSpecsManager } from './AdminComponents/HTWManufacturerSpecsManager';

// --- TYPE DEFINITIONS ---

interface ExtendedInwardFormType extends InwardFormType {
  customer_dc_no: string;
  received_date: string;
}

interface EquipmentDetail extends Omit<BaseEquipmentDetail, 'inspe_notes' | 'calibration_by'> {
  id?: number;
  inspe_status: 'OK' | 'Not OK';
  inspe_remarks: string; 
  engineer_remarks?: string; 
  calibration_by: 'In Lab' | 'Outsource' | 'On-Site';
  accessories_included?: string;
  remarks_and_decision?: string | null;
  status?: string; 
  existingPhotoUrls?: string[];
  photos?: File[];
  photoPreviews?: string[];
}

interface CustomerDropdownItem {
  customer_id: number;
  customer_details: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  ship_to_address?: string;
  bill_to_address?: string;
  company_name?: string;
  location_name?: string;
}

interface NewCustomerForm {
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  ship_to_address: string;
  bill_to_address: string;
  same_as_ship: boolean;
}

interface InwardResponse {
  inward_id: number;
  srf_no: string;
}

interface DraftSaveResponse {
  inward_id: number;
  draft_updated_at: string;
  customer_details?: string;
  draft_data: Record<string, any>;
}

interface LoadedDraftData {
  srf_no: string;
  received_date: string;
  material_inward_date: string;
  customer_dc_date: string;
  customer_dc_no: string;
  customer_id: number | null;
  customer_details: string;
  receiver: string;
  equipment_list: EquipmentDetail[];
}

interface DraftLoadResponse {
  draft_data: LoadedDraftData;
}

type InwardFormProps = {
  initialDraftId?: number | null;
  onDraftUpdate?: () => void;
  onBack?: () => void; 
};

interface FlowConfig {
  id: number;
  equipment_type: string;
  is_active: boolean;
}

// ====================================================================
// SUB-COMPONENTS
// ====================================================================

const SearchableSelect: React.FC<{
  label: string;
  options: string[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onAddNew?: () => void;
  addNewLabel?: string;
  disabled?: boolean;
}> = ({ label, options, value, placeholder, onChange, onAddNew, addNewLabel, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => 
    options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase())), 
  [options, searchTerm]);

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">{label}</label>
      <div 
        className={`w-full border rounded-xl px-4 py-2.5 bg-white shadow-sm flex items-center justify-between cursor-pointer transition-all ${disabled ? 'bg-gray-100 opacity-60 cursor-not-allowed' : 'hover:border-blue-400 border-gray-200'}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={value ? "text-gray-900 font-medium text-sm truncate pr-2" : "text-gray-400 text-sm truncate pr-2"}>
          {value || placeholder}
        </span>
        <ChevronDown size={16} className={`flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[99999] w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-150">
          <div className="p-2 border-b bg-gray-50">
            <div className="relative">
              <input
                autoFocus
                type="text"
                className="w-full pl-8 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <Search className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {onAddNew && (
              <button
                type="button"
                className="w-full text-left px-4 py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-2 border-b border-gray-100"
                onClick={(e) => { e.stopPropagation(); onAddNew(); setIsOpen(false); }}
              >
                <Plus size={14} /> {addNewLabel}
              </button>
            )}
            {filtered.length > 0 ? filtered.map((opt, i) => (
              <div
                key={i}
                className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${value === opt ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700'}`}
                onClick={(e) => { e.stopPropagation(); onChange(opt); setIsOpen(false); }}
              >
                {opt}
              </div>
            )) : (
              <div className="px-4 py-8 text-center text-gray-400 text-sm italic">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CompanyEntryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (companyName: string, locationName: string) => void;
  initialCompanyName?: string;
}> = ({ isOpen, onClose, onConfirm, initialCompanyName = "" }) => {
  const [tempCompanyName, setTempCompanyName] = useState(initialCompanyName);
  const [tempLocation, setTempLocation] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTempCompanyName(initialCompanyName);
      setTempLocation('');
    }
  }, [isOpen, initialCompanyName]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99995] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200 transform transition-all scale-100">
        <div className="flex justify-between items-center mb-4 border-b pb-3">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="text-blue-600" size={20} />
            {initialCompanyName ? `Add Location for ${initialCompanyName}` : 'Register New Company'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Company Name</label>
            <input
              type="text"
              value={tempCompanyName}
              onChange={(e) => setTempCompanyName(e.target.value)}
              disabled={!!initialCompanyName}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 font-semibold"
              placeholder="e.g. Acme Industries Ltd."
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Branch / Site Name</label>
            <input
              autoFocus
              type="text"
              value={tempLocation}
              onChange={(e) => setTempLocation(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Mumbai Plant, Head Office"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button 
              onClick={() => tempCompanyName && tempLocation && onConfirm(tempCompanyName, tempLocation)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition-all"
            >Confirm Details</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ====================================================================
// HELPERS
// ====================================================================

const INITIAL_MATERIAL_DESCRIPTIONS = [
  "Hydraulic Torque Wrench",
  "Pressure Gauge",
  "Temperature Gauge",
  "Vernier Caliper",
  "Micrometer",
];

const safeDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  try {
    return dateStr.split('T')[0];
  } catch (e) {
    return '';
  }
};

const TruncatedTooltip = ({ text }: { text: string; type: 'input' | 'display' }) => {
  if (!text) return null;
  return (
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 hidden group-hover:block z-[100]">
      <div className="bg-gray-800 text-white text-xs rounded px-3 py-2 shadow-xl relative whitespace-pre-wrap break-words border border-gray-700">
        {text}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
      </div>
    </div>
  );
};

const MaterialSearchSelect = ({ 
  value, options, configuredTypes, onChange, onAddNew, onEditCustom, disabled 
}: { 
  value: string; options: string[]; configuredTypes: string[]; 
  onChange: (val: string) => void; onAddNew: () => void; 
  onEditCustom: (val: string) => void; disabled?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom, left: rect.left, width: rect.width });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => window.removeEventListener('scroll', updatePosition, true);
  }, [isOpen]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isCurrentValueConfigured = configuredTypes.includes(value);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full px-4 py-2.5 text-sm font-semibold border rounded-lg transition-all flex justify-between items-center cursor-pointer ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 
          isCurrentValueConfigured 
            ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-100' 
            : 'bg-white border-gray-300 text-gray-900'
        }`}
      >
        <span className="truncate">
          {value || "Select Equipment..."} {isCurrentValueConfigured && "★"}
        </span>
        <ChevronDown size={16} className={isCurrentValueConfigured ? 'text-amber-600' : 'text-gray-400'} />
      </div>

      {isOpen && createPortal(
        <div 
          style={{ position: 'fixed', top: coords.top + 4, left: coords.left, width: coords.width, zIndex: 99999 }}
          className="bg-white border border-gray-300 rounded-lg shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="p-2 border-b bg-gray-50 flex items-center gap-2">
            <Search size={14} className="text-gray-400 ml-1" />
            <input
              autoFocus
              className="w-full px-2 py-1 text-sm outline-none bg-transparent"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.filter(m => configuredTypes.includes(m)).sort().map(opt => (
              <div
                key={opt}
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className="px-4 py-2.5 text-sm font-bold bg-amber-50 text-amber-900 hover:bg-amber-100 cursor-pointer flex justify-between items-center border-b border-amber-100"
              >
                {opt} <Star size={14} className="fill-amber-500 text-amber-500" />
              </div>
            ))}

            {filteredOptions.filter(m => !configuredTypes.includes(m)).sort().map(opt => (
              <div
                key={opt}
                className="group px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-blue-50 cursor-pointer flex justify-between items-center border-b border-gray-50 last:border-0"
                onClick={() => { onChange(opt); setIsOpen(false); }}
              >
                <span className="truncate flex-1">{opt}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); onEditCustom(opt); setIsOpen(false); }}
                  className="p-1 hover:bg-amber-200 rounded text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil size={14} />
                </button>
              </div>
            ))}

            <div
              onClick={() => { onAddNew(); setIsOpen(false); }}
              className="px-4 py-2.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 flex items-center gap-2 border-t"
            >
              <Plus size={14} /> Add New Item
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// ====================================================================
// MAIN COMPONENT
// ====================================================================

export const InwardForm: React.FC<InwardFormProps> = ({ initialDraftId, onDraftUpdate, onBack }) => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = Boolean(editId);
  const { user } = useAuth();

  const lockId = isEditMode && editId ? parseInt(editId) : null;
  const { isLocked } = useRecordLock("INWARD", lockId);

  const lastLoadedIdRef = useRef<string | number | null>('__NOT_LOADED__');

  const [formData, setFormData] = useState<ExtendedInwardFormType>({
    srf_no: 'Loading...', 
    received_date: new Date().toISOString().split('T')[0],
    material_inward_date: new Date().toISOString().split('T')[0],
    customer_dc_date: '',
    customer_dc_no: '',
    receiver: user?.full_name || user?.username || '',
    customer_id: null,
    customer_details: '',
    status: 'created'
  });

  const [equipmentList, setEquipmentList] = useState<EquipmentDetail[]>([]);
  const hiddenEquipmentsRef = useRef<EquipmentDetail[]>([]);
  const [, setSelectedEquipment] = useState<EquipmentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals & Flow State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<number | null>(null);
   
  const [materialOptions, setMaterialOptions] = useState<string[]>(INITIAL_MATERIAL_DESCRIPTIONS);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [newMaterialInput, setNewMaterialInput] = useState("");
  const [activeRowForNewMaterial, setActiveRowForNewMaterial] = useState<number | null>(null);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false); 
  const [showSpecsManager, setShowSpecsManager] = useState(false);

  const [makeOptions, setMakeOptions] = useState<string[]>([]);
  const [modelCache, setModelCache] = useState<Record<string, string[]>>({});
  const [editingMaterialValue, setEditingMaterialValue] = useState<string | null>(null);

  // New Customer Management States
  const [companyName, setCompanyName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [isCustomCompany, setIsCustomCompany] = useState(false);
  const [isCompanyModalOpen, setCompanyModalOpen] = useState(false);
  const [modalInitialCompany, setModalInitialCompany] = useState("");
  const [newCustomerData, setNewCustomerData] = useState<NewCustomerForm>({
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    ship_to_address: '',
    bill_to_address: '',
    same_as_ship: true
  });

  const [reportEmails, setReportEmails] = useState<string[]>(['']);
  const [lastSavedInwardId, setLastSavedInwardId] = useState<number | null>(null);
  const [lastSavedSrfNo, setLastSavedSrfNo] = useState<string>('');
  const [selectedCustomerEmail, setSelectedCustomerEmail] = useState<string>('');

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const previewUrlsRef = useRef<string[]>([]);

  const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'unsaved'>('idle');
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(initialDraftId ?? null);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);

  const [customers, setCustomers] = useState<CustomerDropdownItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  
  // Main Form Split States
  const [mainSelectedCompany, setMainSelectedCompany] = useState<string>('');

  const selectedCustomerData = customers.find(c => c.customer_id === selectedCustomerId);

  const isFormReady = !isLoadingData && formData.srf_no !== 'Loading...';
  const isAnyOutsourced = equipmentList.some(eq => eq.calibration_by === 'Outsource');
  const showEngineerRemarksColumn = isEditMode || equipmentList.some(eq => eq.inspe_status === 'Not OK' || (eq.engineer_remarks && eq.engineer_remarks.trim() !== ''));
  const showCustomerRemarksColumn = equipmentList.some(eq => eq.remarks_and_decision && eq.remarks_and_decision.trim() !== '');
  
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [includeOutsourceInPDF, setIncludeOutsourceInPDF] = useState(false);
  const [configuredTypes, setConfiguredTypes] = useState<string[]>([]);

  const uniqueCompanies = useMemo(() => {
    const names = customers.map(c => c.company_name || c.customer_details.split(' - ')[0] || c.customer_details);
    return Array.from(new Set(names)).filter(Boolean).sort();
  }, [customers]);

  const filteredLocations = useMemo(() => {
    if (!companyName) return [];
    const branches = customers.filter(c => (c.company_name || c.customer_details.split(' - ')[0] || c.customer_details) === companyName);
    const locNames = branches.map(c => c.location_name || (c.customer_details.includes(' - ') ? c.customer_details.split(' - ')[1] : "Main Office"));
    return Array.from(new Set(locNames)).sort();
  }, [companyName, customers]);

  // Main Form Location derivations
  const mainFilteredLocations = useMemo(() => {
    if (!mainSelectedCompany) return [];
    return customers.filter(c => (c.company_name || c.customer_details.split(' - ')[0] || c.customer_details) === mainSelectedCompany);
  }, [mainSelectedCompany, customers]);

  const mainLocationOptions = useMemo(() => {
    const locNames = mainFilteredLocations.map(c => c.location_name || (c.customer_details.includes(' - ') ? c.customer_details.split(' - ')[1] : 'Main Office'));
    return Array.from(new Set(locNames)).sort();
  }, [mainFilteredLocations]);

  const handleResetOrg = () => {
    setCompanyName(''); setLocationName(''); setIsCustomCompany(false);
    setNewCustomerData({ company_name: '', contact_person: '', email: '', phone: '', ship_to_address: '', bill_to_address: '', same_as_ship: true });
  };

  const fetchFlowConfigs = useCallback(async () => {
    try {
      const response = await api.get<FlowConfig[]>('/flow-configs', { params: { skip: 0, limit: 100 } });
      const activeTypes = response.data.filter(item => item.is_active).map(item => item.equipment_type);
      setConfiguredTypes(activeTypes);
    } catch (error) {
      console.error("Error fetching flow configs:", error);
    }
  }, []);

  const hasFormData = (formData.customer_id !== null && formData.customer_id !== undefined) || (formData.customer_dc_date ?? '').trim().length > 0 || (formData.customer_dc_no ?? '').trim().length > 0 || equipmentList.some((eq) => (eq.material_desc || '').trim().length > 0);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 7000);
  };

  const cleanupAllPreviews = useCallback(() => {
    previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
  }, []);

  const resolvePhotoUrl = useCallback((photo: string | undefined) => {
    if (!photo) return "";
    const sanitized = photo.replace(/\\/g, "/");
    if (/^https?:\/\//i.test(sanitized)) return sanitized;
    const normalized = sanitized.startsWith("/") ? sanitized : `/${sanitized}`;
    const normalizedApiPath = normalized.startsWith("/api/uploads/") ? normalized : normalized.replace(/^\/uploads\//i, "/api/uploads/");
    let assetHost = "";
    const rawRoot = (BACKEND_ROOT_URL || "").trim().replace(/\/+$/, "");
    if (rawRoot && /^https?:\/\//i.test(rawRoot)) assetHost = rawRoot.replace(/\/api$/i, "");
    return `${assetHost}${normalizedApiPath}`;
  }, []);

  const serializeDraftState = useCallback((payload?: { formData: ExtendedInwardFormType; equipmentList: EquipmentDetail[] }) => {
      const targetFormData = payload?.formData ?? formData;
      const targetEquipmentList = payload?.equipmentList ?? equipmentList;
      return JSON.stringify({
        formData: targetFormData,
        equipmentList: targetEquipmentList.map((equipment) => {
          const { photos, photoPreviews, existingPhotoUrls, ...rest } = equipment;
          return {
            ...rest,
            photos: (photos || []).map((file) => (file?.name ? String(file.name) : "")),
            photoPreviews: (photoPreviews || []).slice(),
            existingPhotoUrls: (existingPhotoUrls || []).slice()
          };
        })
      });
    }, [formData, equipmentList]);

  const notifyDraftUpdate = useCallback(() => {
    if (onDraftUpdate) onDraftUpdate();
    window.dispatchEvent(new Event('drafts-updated'));
  }, [onDraftUpdate]);

  const fetchMaterials = useCallback(async () => {
    try {
        const response = await api.get<string[]>(`${ENDPOINTS.STAFF.INWARDS}/materials-history?t=${Date.now()}`);
        const history = Array.isArray(response.data) ? response.data : [];
        setMaterialOptions(prev => {
            const combined = new Set([...INITIAL_MATERIAL_DESCRIPTIONS, ...history, ...prev]);
            return Array.from(combined).filter(Boolean).sort();
        });
    } catch (error) {
        setMaterialOptions(prev => Array.from(new Set([...INITIAL_MATERIAL_DESCRIPTIONS, ...prev])).filter(Boolean).sort());
    }
  }, []);

  const fetchNextSrfNo = async (): Promise<string> => {
    try {
      const response = await api.get<{ next_srf_no: string }>(`${ENDPOINTS.STAFF.INWARDS}/next-no`);
      return response.data.next_srf_no;
    } catch (e) { return "TBD"; }
  };

  const fetchCustomers = useCallback(async () => {
    try {
      const response = await api.get<CustomerDropdownItem[]>(ENDPOINTS.PORTAL.CUSTOMERS_DROPDOWN);
      setCustomers(response.data);
    } catch (error) { showMessage('error', 'Failed to load customer list.'); }
  }, []);

  const fetchMakes = useCallback(async () => {
    try {
      const response = await api.get<string[]>(`${ENDPOINTS.STAFF.INWARDS}/manufacturer/makes`);
      if (Array.isArray(response.data)) setMakeOptions(response.data.sort());
    } catch (error) { console.error("Failed to fetch makes", error); }
  }, []);

  const fetchModelsForMake = async (make: string) => {
    if (!make || modelCache[make]) return;
    try {
      const response = await api.get<string[]>(`${ENDPOINTS.STAFF.INWARDS}/manufacturer/models`, { params: { make } });
      if (Array.isArray(response.data)) setModelCache(prev => ({ ...prev, [make]: response.data.sort() }));
    } catch (error) { console.error(`Failed to fetch models for ${make}`, error); }
  };

  const fetchRangeForMakeModel = async (make: string, model: string): Promise<string> => {
    try {
      const response = await api.get<{ range_min: number | string; range_max: number | string }>(`${ENDPOINTS.STAFF.INWARDS}/manufacturer/range`, { params: { make, model } });
      const { range_min, range_max } = response.data;
      if (range_min !== undefined && range_min !== null && range_max !== undefined && range_max !== null) return `${range_min} - ${range_max}`;
      return '';
    } catch (error) { console.error("Failed to fetch range", error); return ''; }
  };

  const loadInwardData = async (inwardId: number) => {
    try {
      const response = await api.get<InwardDetail>(`${ENDPOINTS.STAFF.INWARDS}/${inwardId}`);
      const inward = response.data;
      const receiverName = inward.receiver || user?.full_name || user?.username || '';

      setFormData({
        srf_no: inward.srf_no.toString(),
        received_date: safeDate((inward as any).received_date),
        material_inward_date: safeDate(inward.material_inward_date),
        customer_dc_date: safeDate(inward.customer_dc_date),
        customer_dc_no: (inward as any).customer_dc_no ?? '',
        receiver: receiverName,
        customer_id: inward.customer_id,
        customer_details: inward.customer_details,
        status: inward.status
      });
      setSelectedCustomerId(inward.customer_id);

      const usedMaterials = new Set((inward.equipments || []).map(eq => eq.material_description));
      setMaterialOptions(prev => Array.from(new Set([...prev, ...usedMaterials])).filter(Boolean).sort());

      const allMappedEquipment: EquipmentDetail[] = (inward.equipments ?? []).map((eq) => {
        let rawCalibBy = eq.calibration_by || 'In Lab';
        if (rawCalibBy === 'Out Lab') rawCalibBy = 'On-Site';
        const calibrationBy = (['In Lab', 'Outsource', 'On-Site'] as const).includes(rawCalibBy as any) ? (rawCalibBy as 'In Lab' | 'Outsource' | 'On-Site') : 'In Lab';
        const isOk = (eq.visual_inspection_notes || 'OK').trim().toUpperCase() === 'OK';
        const existingPhotoUrls = Array.isArray(eq.photos) ? eq.photos.filter((path): path is string => typeof path === 'string' && path.trim().length > 0) : [];
        if (eq.make) fetchModelsForMake(eq.make);
        return {
          id: (eq as any).inward_eqp_id,
          nepl_id: eq.nepl_id,
          material_desc: eq.material_description,
          make: eq.make,
          model: eq.model,
          range: eq.range || '',
          serial_no: eq.serial_no || '',
          qty: eq.quantity,
          calibration_by: calibrationBy,
          inspe_status: isOk ? 'OK' : 'Not OK',
          inspe_remarks: '', 
          engineer_remarks: (eq as any).engineer_remarks || eq.engineer_remarks || '', 
          accessories_included: (eq as any).accessories_included || '',
          remarks_and_decision: (eq as any).customer_remarks || null,
          photos: [], photoPreviews: [], existingPhotoUrls,
          supplier: (eq as any).supplier, in_dc: (eq as any).in_dc, out_dc: (eq as any).out_dc, status: (eq as any).status 
        } as EquipmentDetail;
      });

      cleanupAllPreviews();
      const visibleEquipment = allMappedEquipment.filter(eq => eq.status === 'reviewed'|| eq.status === 'updated');
      hiddenEquipmentsRef.current = allMappedEquipment.filter(eq => eq.status !== 'reviewed'&& eq.status !== 'updated');
      
      if (visibleEquipment.length > 0) setEquipmentList(visibleEquipment);
      else if (allMappedEquipment.length > 0) { setEquipmentList([]); showMessage('error', 'No items with "reviewed" or "updated" status found.'); }
      else { setEquipmentList([{ nepl_id: `${inward.srf_no}-1`, material_desc: '', make: '', model: '', qty: 1, calibration_by: 'In Lab' as const, inspe_status: 'OK' as const, inspe_remarks: '', engineer_remarks: '', accessories_included: '', photos: [], photoPreviews: [], existingPhotoUrls: [] }]); }
    } catch (error) { showMessage('error', 'Failed to load inward data.'); navigate('/engineer/view-inward'); } finally { setIsLoadingData(false); }
  };

  const loadDraftData = async (draftId: number) => {
    try {
      const response = await api.get<DraftLoadResponse>(`${ENDPOINTS.STAFF.DRAFTS}/${draftId}`);
      const draftData = response.data.draft_data;
      if (draftData) {
        const newFormData: ExtendedInwardFormType = { srf_no: "TBD", received_date: safeDate(draftData.received_date), material_inward_date: safeDate(draftData.material_inward_date), customer_dc_date: safeDate(draftData.customer_dc_date), customer_dc_no: draftData.customer_dc_no ?? '', customer_id: draftData.customer_id || null, customer_details: draftData.customer_details || '', receiver: draftData.receiver || '', status: 'created' as const };
        if (draftData.equipment_list) {
            const draftMaterials = new Set(draftData.equipment_list.map((eq: any) => eq.material_desc));
            setMaterialOptions(prev => Array.from(new Set([...prev, ...draftMaterials])).filter(Boolean).sort());
        }
        const newEquipmentList: EquipmentDetail[] = (draftData.equipment_list || []).map(eq => {
          const existingPhotoUrls = (Array.isArray((eq as any).existingPhotoUrls) ? (eq as any).existingPhotoUrls : (Array.isArray((eq as any).existing_photo_urls) ? (eq as any).existing_photo_urls : [])).filter((path: unknown): path is string => typeof path === 'string' && path.trim().length > 0);
          if (eq.make) fetchModelsForMake(eq.make);
          return { ...eq, photos: [], photoPreviews: [], existingPhotoUrls };
        });
        setFormData(newFormData); setSelectedCustomerId(newFormData.customer_id); cleanupAllPreviews(); setEquipmentList(newEquipmentList); setCurrentDraftId(draftId); lastSavedDataRef.current = serializeDraftState({ formData: newFormData, equipmentList: newEquipmentList }); setDraftSaveStatus('saved'); setLastAutoSaveTime(new Date()); showMessage('success', 'Draft loaded successfully!');
      }
    } catch (error) { navigate('/engineer'); } finally { setIsLoadingData(false); }
  };

  const initializeForm = async () => {
    setCurrentDraftId(null); setDraftSaveStatus('idle'); setLastAutoSaveTime(null); cleanupAllPreviews(); setEquipmentList([]); hiddenEquipmentsRef.current = []; setSelectedCustomerId(null); setSelectedCustomerEmail(''); setMainSelectedCompany('');
    try {
      const displaySrf = "TBD";
      const newFormData: ExtendedInwardFormType = { srf_no: displaySrf, received_date: safeDate(new Date().toISOString()), material_inward_date: safeDate(new Date().toISOString()), customer_dc_date: '', customer_dc_no: '', receiver: user?.full_name || user?.username || '', customer_id: null, customer_details: '', status: 'created' as const };
      const newEquipmentList: EquipmentDetail[] = [{ nepl_id: `${displaySrf}-1`, material_desc: '', make: '', model: '', qty: 1, calibration_by: 'In Lab' as const, inspe_status: 'OK' as const, inspe_remarks: '', engineer_remarks: '', accessories_included: '', photos: [], photoPreviews: [], existingPhotoUrls: [] }];
      setFormData(newFormData); setEquipmentList(newEquipmentList); lastSavedDataRef.current = serializeDraftState({ formData: newFormData, equipmentList: newEquipmentList });
    } catch (error: any) { setFormData(prev => ({ ...prev, srf_no: 'Error!' })); } finally { setIsLoadingData(false); }
  };

  useEffect(() => {
    if (selectedCustomerId && customers.length > 0) {
      const customer = customers.find(c => c.customer_id === selectedCustomerId);
      if (customer) {
        if (customer.email) setSelectedCustomerEmail(customer.email);
        const cName = customer.company_name || customer.customer_details.split(' - ')[0] || customer.customer_details;
        setMainSelectedCompany(cName);
      }
    } else if (!selectedCustomerId) {
        setSelectedCustomerEmail('');
    }
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    const currentKey = isEditMode && editId ? editId : (initialDraftId ?? 'new');
    if (lastLoadedIdRef.current === currentKey) return;
    lastLoadedIdRef.current = currentKey;
    const init = async () => {
        setIsLoadingData(true); 
        await fetchCustomers(); await fetchMaterials(); await fetchMakes(); await fetchFlowConfigs();
        if (isEditMode && editId) await loadInwardData(parseInt(editId));
        else if (initialDraftId) await loadDraftData(initialDraftId);
        else await initializeForm();
    };
    init();
    const handleBeforeUnloadLocal = (e: BeforeUnloadEvent) => handleBeforeUnload(e);
    window.addEventListener('beforeunload', handleBeforeUnloadLocal);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnloadLocal);
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      cleanupAllPreviews();
    };
  }, [isEditMode, editId, initialDraftId, fetchCustomers, fetchMaterials, fetchMakes, fetchFlowConfigs]); 

  useEffect(() => {
    if (!isEditMode && isFormReady && hasFormData && !isLocked) {
      const currentData = serializeDraftState();
      if (currentData !== lastSavedDataRef.current) {
        setDraftSaveStatus('unsaved');
        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = setTimeout(() => triggerAutoSave(), 2000);
      }
    }
  }, [formData, equipmentList, isFormReady, hasFormData, isEditMode, serializeDraftState, isLocked]);

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    const currentData = JSON.stringify({ formData, equipmentList });
    if (hasFormData && !isEditMode && currentData !== lastSavedDataRef.current) {
      e.returnValue = 'You have unsaved changes.'; return 'You have unsaved changes.';
    }
  };

  const handleBackToPortal = () => {
    if (hasFormData && !isEditMode && JSON.stringify({ formData, equipmentList }) !== lastSavedDataRef.current && !isLocked) {
      if(!window.confirm('You have unsaved changes. Are you sure you want to go back?')) return;
    }
    if (isEditMode) navigate('/engineer/view-inward');
    else { if (onBack) onBack(); else navigate('/engineer/create-inward'); }
  };

  const triggerAutoSave = async () => {
    if (!isFormReady || isEditMode || isLocked) return; 
    setDraftSaveStatus('saving');
    try {
      const equipmentDraftPayload = equipmentList.map(({ photos, photoPreviews, existingPhotoUrls, ...rest }) => ({ ...rest, qty: Number(rest.qty) || 1, existing_photo_urls: (existingPhotoUrls || []).filter((url): url is string => Boolean(url?.trim())) }));
      const draftPayload = { inward_id: currentDraftId, draft_data: { ...formData, srf_no: 'TBD', equipment_list: equipmentDraftPayload } };
      const response = await api.patch<DraftSaveResponse>(ENDPOINTS.STAFF.DRAFT, draftPayload);
      if (response.data?.inward_id) {
        if (!currentDraftId) {
          setCurrentDraftId(response.data.inward_id);
          const newUrl = `${window.location.pathname}?draft=${response.data.inward_id}`;
          window.history.replaceState({ path: newUrl }, '', newUrl);
        }
        setDraftSaveStatus('saved'); setLastAutoSaveTime(new Date()); lastSavedDataRef.current = serializeDraftState({ formData, equipmentList });
        notifyDraftUpdate();
      }
    } catch (error) { setDraftSaveStatus('error'); }
  };

  const getDraftStatusIcon = () => {
    switch (draftSaveStatus) {
      case 'saving': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'saved': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'unsaved': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default: return <CheckCircle2 className="h-4 w-4 text-gray-400" />;
    }
  };

  const getDraftStatusText = () => {
    switch (draftSaveStatus) {
      case 'saving': return 'Saving...';
      case 'saved': return lastAutoSaveTime ? `Saved at ${lastAutoSaveTime.toLocaleTimeString()}` : 'Draft saved';
      case 'error': return 'Save failed';
      case 'unsaved': return 'Unsaved changes';
      default: return 'Auto-save active';
    }
  };

  const handleAddCustomMaterial = (e: React.FormEvent) => {
    if (isLocked) return; e.preventDefault();
    const isEditing = Boolean(editingMaterialValue);
    const newItem = newMaterialInput.trim();
    if (!newItem) return;
    setMaterialOptions(prev => {
      if (editingMaterialValue) return prev.map(item => item === editingMaterialValue ? newItem : item).sort();
      if (prev.some(item => item.toLowerCase() === newItem.toLowerCase())) return prev;
      return [...prev, newItem].sort();
    });
    if (activeRowForNewMaterial !== null) handleEquipmentChange(activeRowForNewMaterial, 'material_desc', newItem);
    setNewMaterialInput(""); setEditingMaterialValue(null); setShowAddMaterialModal(false); setActiveRowForNewMaterial(null);
    showMessage('success', isEditing ? 'Material updated!' : 'Material added!');
  };

  const handleNewCustomerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (isLocked) return; 
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setNewCustomerData(prev => {
        const updated = { ...prev, [name]: checked };
        if (name === 'same_as_ship' && checked) updated.bill_to_address = updated.ship_to_address;
        return updated;
      });
    } else {
      setNewCustomerData(prev => {
        const updated = { ...prev, [name]: value };
        if (prev.same_as_ship && name === 'ship_to_address') updated.bill_to_address = value;
        return updated;
      });
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    if (isLocked) return; 
    e.preventDefault();
    setIsCreatingCustomer(true);
    try {
      const payload = {
        email: newCustomerData.email,
        role: 'customer',
        invited_name: newCustomerData.contact_person,
        company_name: companyName.trim(),
        location_name: locationName === "Main Office" ? "" : locationName.trim(),
        ship_to_address: newCustomerData.ship_to_address.trim(),
        bill_to_address: newCustomerData.bill_to_address.trim(), 
        phone_number: newCustomerData.phone.trim()
      };
      await api.post('/invitations/send', payload);
      showMessage('success', 'Customer registered and invitation dispatched!');
      await fetchCustomers();
      const updatedRes = await api.get<CustomerDropdownItem[]>(ENDPOINTS.PORTAL.CUSTOMERS_DROPDOWN);
      const newCust = updatedRes.data.find(c => c.email?.toLowerCase() === payload.email.toLowerCase());
      if (newCust) {
        setCustomers(updatedRes.data);
        setFormData(prev => ({ ...prev, customer_id: newCust.customer_id, customer_details: newCust.customer_details }));
        setSelectedCustomerId(newCust.customer_id);
      }
      setShowAddCustomerModal(false);
      handleResetOrg();
    } catch (error: any) {
      showMessage('error', error.response?.data?.detail || 'Registration failed.');
    } finally { setIsCreatingCustomer(false); }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (isLocked) return; 
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEquipmentChange = async (index: number, field: keyof EquipmentDetail, value: string | number) => {
    if (isLocked) return; 
    const currentMaterial = equipmentList[index]?.material_desc;
    const isHydraulic = currentMaterial === "Hydraulic Torque Wrench";
    setEquipmentList(currentList => {
      const updatedList = [...currentList];
      const equipmentToUpdate = { ...updatedList[index] };
      if (field === 'inspe_status') {
          equipmentToUpdate.inspe_status = value as 'OK' | 'Not OK';
          if (value === 'OK') equipmentToUpdate.engineer_remarks = ''; 
      } else if (field === 'calibration_by') {
          (equipmentToUpdate as any).calibration_by = value as 'In Lab' | 'Outsource' | 'On-Site';
          if (value !== 'Outsource') { delete (equipmentToUpdate as any).supplier; delete (equipmentToUpdate as any).in_dc; delete (equipmentToUpdate as any).out_dc; }
      } else if (field === 'make') {
          equipmentToUpdate.make = String(value);
          if (isHydraulic) { equipmentToUpdate.model = ''; equipmentToUpdate.range = ''; }
      } else if (field === 'model') {
          equipmentToUpdate.model = String(value);
          if (isHydraulic) equipmentToUpdate.range = 'Loading...';
      } else (equipmentToUpdate as any)[field] = value;
      updatedList[index] = equipmentToUpdate;
      return updatedList;
    });

    if (isHydraulic) {
      if (field === 'make') {
        const newMake = String(value); if (newMake) await fetchModelsForMake(newMake);
      } else if (field === 'model') {
        const currentItem = equipmentList[index];
        const newModel = String(value);
        if (currentItem.make && newModel) {
          const fetchedRange = await fetchRangeForMakeModel(currentItem.make, newModel);
          setEquipmentList(curr => {
            const up = [...curr];
            if (up[index]) up[index] = { ...up[index], range: fetchedRange };
            return up;
          });
        }
      }
    }
  };

  const addEquipmentRow = () => {
    if (isLocked) return; 
    setEquipmentList(currentList => {
      const newIndex = currentList.length + 1;
      return [...currentList, { nepl_id: `${formData.srf_no}-${newIndex}`, material_desc: '', make: '', model: '', qty: 1, calibration_by: 'In Lab' as const, inspe_status: 'OK' as const, inspe_remarks: '', engineer_remarks: '', accessories_included: '', photos: [], photoPreviews: [], existingPhotoUrls: [] }];
    });
  };

  const confirmDeleteRow = () => {
    if (rowToDelete === null || isLocked) return;
    const equipmentToRemove = equipmentList[rowToDelete];
    if (equipmentToRemove?.photoPreviews?.length) {
        equipmentToRemove.photoPreviews.forEach(url => {
            URL.revokeObjectURL(url);
            previewUrlsRef.current = previewUrlsRef.current.filter(existing => existing !== url);
        });
    }
    const updatedList = equipmentList.filter((_, i) => i !== rowToDelete).map((item, i) => ({ ...item, nepl_id: `${formData.srf_no}-${i + 1}` }));
    if (updatedList.length === 0) addEquipmentRow();
    else setEquipmentList(updatedList);
    setRowToDelete(null);
  };

  const handlePhotoChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked || !e.target.files?.length) return;
    const newFiles = Array.from(e.target.files);
    const newPreviews = newFiles.map(file => URL.createObjectURL(file));
    newPreviews.forEach(url => previewUrlsRef.current.push(url));
    setEquipmentList(currentList => {
      const updatedList = [...currentList]; if (!updatedList[index]) return currentList;
      const currentEquipment = { ...updatedList[index] };
      currentEquipment.photos = [...(currentEquipment.photos || []), ...newFiles];
      currentEquipment.photoPreviews = [...(currentEquipment.photoPreviews || []), ...newPreviews];
      updatedList[index] = currentEquipment; return updatedList;
    });
    e.target.value = '';
  };

  const handleRemovePhoto = (eqIndex: number, photoIndex: number) => {
    if (isLocked) return; 
    let previewToRemove: string | undefined;
    setEquipmentList(currentList => {
      const updatedList = [...currentList]; const equipment = updatedList[eqIndex]; if (!equipment) return currentList;
      const currentPreviews = equipment.photoPreviews || [];
      previewToRemove = currentPreviews[photoIndex];
      updatedList[eqIndex] = { ...equipment, photos: (equipment.photos || []).filter((_, p) => p !== photoIndex), photoPreviews: currentPreviews.filter((_, p) => p !== photoIndex) };
      return updatedList;
    });
    if (previewToRemove) {
      URL.revokeObjectURL(previewToRemove);
      previewUrlsRef.current = previewUrlsRef.current.filter(url => url !== previewToRemove);
    }
  };

  const viewEquipmentDetails = (index: number) => setSelectedEquipment(equipmentList[index]);
  
  const handleSkipDownload = () => {
    setShowDownloadModal(false);
    if (!isEditMode && lastSavedInwardId && !showEmailModal) setShowEmailModal(true);
    else if (isEditMode) navigate('/engineer/view-inward');
  };

  const handleStandardDownload = (e: React.MouseEvent) => { e.preventDefault(); setShowDownloadModal(true); };

  const handleConfirmDownload = async () => {
    let displaySrf = lastSavedSrfNo || formData.srf_no;
    if (displaySrf === 'TBD' || displaySrf === 'Loading...') displaySrf = await fetchNextSrfNo();
    const formattedList = equipmentList.map((eq, index) => ({ ...eq, nepl_id: `${displaySrf}-${index + 1}` }));
    const pdfFormData = { ...formData, srf_no: displaySrf, contact_person: selectedCustomerData?.contact_person || '', phone: selectedCustomerData?.phone || '', email: selectedCustomerData?.email || '', ship_to_address: selectedCustomerData?.ship_to_address || '', bill_to_address: selectedCustomerData?.bill_to_address || '', includeOutsourceDetails: includeOutsourceInPDF };
    try {
      generateStandardInwardPDF(pdfFormData, formattedList);
      setShowDownloadModal(false); 
      if (!isEditMode && lastSavedInwardId && !showEmailModal) setShowEmailModal(true);
      else if (isEditMode) navigate('/engineer/view-inward');
    } catch (error){ showMessage('error', 'Failed to generate PDF.'); }
  };

  const handlePreviewClick = async (e: React.FormEvent) => {
    e.preventDefault(); if (isLocked) return; 
    if (!formData.receiver || formData.customer_id === null) { showMessage('error', 'Please fill in Receiver and Company.'); return; }
    if (equipmentList.some(eq => !eq.material_desc || !eq.make || !eq.model)) { showMessage('error', 'Fill required equipment fields.'); return; }
    if (!isEditMode && formData.srf_no === "TBD") {
      const nextSrf = await fetchNextSrfNo(); setFormData(prev => ({ ...prev, srf_no: nextSrf }));
    }
    setShowPreviewModal(true);
  };

  const handleFinalSubmit = async () => {
    if (isLocked) return; setShowPreviewModal(false); setIsLoading(true);
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    try {
      const submissionData = new FormData();
      submissionData.append('srf_no', formData.srf_no);
      submissionData.append('received_date',formData.received_date);
      submissionData.append('material_inward_date', formData.material_inward_date || new Date().toISOString().split('T')[0]);
      submissionData.append('customer_dc_date', formData.customer_dc_date || "");
      submissionData.append('customer_dc_no', formData.customer_dc_no);
      submissionData.append('receiver', formData.receiver);
      submissionData.append('customer_id', String(formData.customer_id));
      submissionData.append('customer_details', formData.customer_details);

      const formatItem = (item: EquipmentDetail, idx: number, updated: boolean) => ({
        inward_eqp_id: item.id, nepl_id: item.nepl_id || `${formData.srf_no}-${idx + 1}`,
        material_desc: item.material_desc, make: item.make, model: item.model, range: item.range || "", serial_no: item.serial_no || "", qty: Number(item.qty), calibration_by: item.calibration_by, visual_inspection_notes: item.inspe_status, engineer_remarks: item.engineer_remarks || "", accessories_included: item.accessories_included || "", supplier: item.calibration_by === 'Outsource' ? ((item as any).supplier || "") : null, in_dc: item.calibration_by === 'Outsource' ? ((item as any).in_dc || "") : null, out_dc: item.calibration_by === 'Outsource' ? ((item as any).out_dc || "") : null, existing_photo_urls: (item.existingPhotoUrls || []).filter(u => Boolean(u?.trim())), status: isEditMode && updated ? 'updated' : 'created'
      });
      const fullPayload = [...equipmentList.map((eq, i) => formatItem(eq, i, true)), ...hiddenEquipmentsRef.current.map((eq, i) => formatItem(eq, equipmentList.length + i, false))];
      submissionData.append('equipment_list', JSON.stringify(fullPayload));
      equipmentList.forEach((eq, index) => { eq.photos?.forEach((f: File) => submissionData.append(`photos_${index}`, f, f.name)); });

      if (isEditMode && editId) {
        submissionData.append('inward_id', editId);
        await api.put<InwardResponse>(`${ENDPOINTS.STAFF.INWARDS}/${editId}`, submissionData, { headers: { 'Content-Type': 'multipart/form-data' } });
        showMessage('success', 'Inward updated!'); notifyDraftUpdate(); setShowDownloadModal(true);
      } else {
        if (currentDraftId) submissionData.append('inward_id', String(currentDraftId));
        const response = await api.post<InwardResponse>(ENDPOINTS.STAFF.SUBMIT, submissionData, { headers: { 'Content-Type': 'multipart/form-data' } });
        const realSrf = String(response.data.srf_no);
        setLastSavedInwardId(response.data.inward_id); setLastSavedSrfNo(realSrf); setReportEmails([selectedCustomerEmail || '']);
        setFormData(prev => ({ ...prev, srf_no: realSrf })); notifyDraftUpdate(); setShowDownloadModal(true);
      }
    } catch (error: any) { showMessage('error', 'Submission failed'); } finally { setIsLoading(false); }
  };

  const addEmailField = () => setReportEmails(prev => [...prev, '']);
  const removeEmailField = (index: number) => setReportEmails(prev => prev.filter((_, i) => i !== index));

  const handleSendFir = async (e: React.FormEvent) => {
    e.preventDefault(); const valid = reportEmails.filter(em => em.trim() && em.includes('@'));
    if (!valid.length || !lastSavedInwardId) return;
    try {
      await api.post(`${ENDPOINTS.STAFF.INWARDS}/${lastSavedInwardId}/send-report`, { emails: valid, send_later: false });
      showMessage('success', `FIR sent!`); navigate('/engineer'); 
    } catch (error) { showMessage('error', 'Failed to send FIR.'); }
  };

  const handleScheduleFir = async () => {
    if (!lastSavedInwardId) return;
    try {
      await api.post(`${ENDPOINTS.STAFF.INWARDS}/${lastSavedInwardId}/send-report`, { send_later: true });
      showMessage('success', `FIR Scheduled.`); navigate('/engineer');
    } catch (error) { showMessage('error', 'Failed to schedule.'); }
  };

  // ====================================================================
  // MODAL RENDERING - WRAPPED WITH createPortal
  // ====================================================================

  const renderAddMaterialModal = () => {
    if (!showAddMaterialModal) return null;
    const isEditing = Boolean(editingMaterialValue);
    return createPortal(
      <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-black bg-opacity-60 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-y-auto relative">
          <div className="p-4 border-b flex justify-between items-center bg-blue-50 rounded-t-xl">
            <div className="flex items-center gap-2">
              {isEditing ? <Pencil className="text-blue-600" size={20} /> : <PackagePlus className="text-blue-600" size={20} />}
              <h2 className="text-lg font-bold text-gray-800">{isEditing ? 'Edit Material' : 'Add New Material'}</h2>
            </div>
            <button onClick={() => { setShowAddMaterialModal(false); setEditingMaterialValue(null); }} className="text-gray-400 hover:text-red-500"><X size={20} /></button>
          </div>
          <form onSubmit={handleAddCustomMaterial} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Material Name</label>
              <input type="text" autoFocus value={newMaterialInput} onChange={(e) => setNewMaterialInput(e.target.value)} placeholder="e.g. Multimeter" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => { setShowAddMaterialModal(false); setEditingMaterialValue(null); }} className="flex-1 py-2 border rounded-lg hover:bg-gray-50 font-medium text-gray-700">Cancel</button>
              <button type="submit" disabled={!newMaterialInput.trim()} className={`flex-1 py-2 text-white rounded-lg font-medium ${isEditing ? 'bg-amber-600' : 'bg-blue-600'} disabled:bg-gray-300`}>{isEditing ? 'Update' : 'Add'}</button>
            </div>
          </form>
        </div>
      </div>,
      document.body
    );
  };

  const renderAddCustomerModal = () => {
    if (!showAddCustomerModal) return null;
    return createPortal(
      <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in duration-200">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg text-white"><UserPlus size={24} /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">New Customer Registration</h2>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Add Company & Site Profile</p>
              </div>
            </div>
            <button onClick={() => setShowAddCustomerModal(false)} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full"><X size={24} /></button>
          </div>
          <form onSubmit={handleCreateCustomer} className="flex-1 overflow-y-auto p-8 space-y-8">
            <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-4">
              <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2"><Building2 size={14} /> Organization Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isCustomCompany ? (
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="bg-blue-100 border border-blue-200 rounded-xl px-4 py-2 text-blue-900 font-bold text-sm shadow-inner truncate">{companyName}</div>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-blue-700 font-medium text-sm shadow-inner truncate">{locationName}</div>
                    </div>
                    <button type="button" onClick={handleResetOrg} className="p-2.5 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-xl shadow-sm"><X size={18} /></button>
                  </div>
                ) : (
                  <>
                    <SearchableSelect label="1. Company Name" options={uniqueCompanies} value={companyName} placeholder="Select..." onChange={(v) => { setCompanyName(v); setLocationName(''); }} onAddNew={() => { setModalInitialCompany(""); setCompanyModalOpen(true); }} addNewLabel="New Company" />
                    <SearchableSelect label="2. Site / Branch" options={filteredLocations} value={locationName} placeholder="Branch..." disabled={!companyName} onChange={(v) => setLocationName(v)} onAddNew={() => { setModalInitialCompany(companyName); setCompanyModalOpen(true); }} addNewLabel="New Site" />
                  </>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100"><UserCog size={18} className="text-blue-600" /><h3 className="font-bold text-slate-700">Contact Person</h3></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Full Name *</label><input name="contact_person" required value={newCustomerData.contact_person} onChange={handleNewCustomerChange} placeholder="John Doe" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Email *</label><input type="email" name="email" required value={newCustomerData.email} onChange={handleNewCustomerChange} placeholder="john@email.com" className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Phone Number *</label><input name="phone" required value={newCustomerData.phone} onChange={handleNewCustomerChange} placeholder="+91..." className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100"><MapPin size={18} className="text-blue-600" /><h3 className="font-bold text-slate-700">Addresses</h3></div>
              <div className="space-y-4">
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Shipping Address *</label><textarea name="ship_to_address" required value={newCustomerData.ship_to_address} onChange={handleNewCustomerChange} rows={2} className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div>
                  <div className="flex items-center justify-between mb-1"><label className="block text-xs font-bold text-gray-500 uppercase ml-1">Billing Address</label><label className="flex items-center gap-2 text-[10px] font-bold text-blue-600 cursor-pointer bg-blue-50 px-2 py-1 rounded-lg"><input type="checkbox" name="same_as_ship" checked={newCustomerData.same_as_ship} onChange={handleNewCustomerChange} /><span>SAME AS SHIPPING</span></label></div>
                  <textarea name="bill_to_address" required value={newCustomerData.bill_to_address} onChange={handleNewCustomerChange} disabled={newCustomerData.same_as_ship} rows={2} className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" />
                </div>
              </div>
            </div>
          </form>
          <div className="p-6 border-t bg-slate-50 flex gap-3">
            <button type="button" onClick={() => setShowAddCustomerModal(false)} className="flex-1 py-3 border rounded-xl font-bold text-slate-600 hover:bg-white transition-colors">Cancel</button>
            <button type="submit" onClick={handleCreateCustomer} disabled={isCreatingCustomer || !companyName || !locationName} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold shadow-lg disabled:opacity-50 flex justify-center items-center gap-2 transition-all">
              {isCreatingCustomer ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
              <span>Register & Invite Customer</span>
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const renderPreviewModal = () => { 
    if (!showPreviewModal) return null; 
    const handleClosePreview = () => { setShowPreviewModal(false); if (!isEditMode) setFormData(prev => ({ ...prev, srf_no: 'TBD' })); };
    return createPortal( 
      <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-black bg-opacity-70 p-4 overflow-y-auto"> 
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl my-8 flex flex-col max-h-[90vh]"> 
          <div className="flex justify-between items-center p-6 border-b bg-gray-50 rounded-t-lg"> 
            <div className="flex items-center gap-3"><FileText className="text-blue-600" size={28} /><h2 className="text-2xl font-bold text-gray-800">Inward Preview</h2></div> 
            <button onClick={handleClosePreview} className="text-gray-400 hover:text-red-500"><X size={28} /></button> 
          </div> 
          <div className="p-8 overflow-y-auto bg-gray-50"> 
            {!isEditMode && (<div className="max-w-[210mm] mx-auto mb-4 bg-amber-50 border border-amber-200 rounded-md p-4 flex items-start gap-3"><AlertCircle className="text-amber-500 mt-0.5 flex-shrink-0" size={20} /><p className="text-sm text-amber-800 font-medium">SRF Number and NEPL ID are provisional.</p></div>)}
            <div className="bg-white p-8 shadow-sm border border-gray-200 mx-auto max-w-[210mm] min-h-[297mm]"> 
              <div className="text-center border-b pb-4 mb-6"><h1 className="text-2xl font-bold text-blue-900 uppercase tracking-wider">NextAge Engineering Pvt Ltd</h1><p className="text-gray-600 text-sm mt-1">Material Inward Receipt</p></div> 
              <div className="flex justify-between text-sm mb-8 gap-8"> 
                <div className="w-1/2 space-y-2"> 
                  <div className="flex"><span className="font-semibold w-32">Received:</span> <span>{formData.received_date}</span></div> 
                  <div className="flex"><span className="font-semibold w-32">SRF No:</span> <span className="text-blue-600 font-bold">{formData.srf_no}</span></div> 
                  <div className="flex"><span className="font-semibold w-32">Received By:</span> <span>{formData.receiver}</span></div> 
                </div> 
                <div className="w-1/2 space-y-2"> 
                  <div className="flex"><span className="font-semibold w-32">Customer DC:</span> <span>{formData.customer_dc_no}</span></div> 
                </div> 
              </div> 
              <div className="mb-8 p-4 bg-gray-50 rounded border"><h3 className="font-bold text-gray-700 mb-2 text-sm uppercase">Customer Details</h3><p className="text-gray-800 whitespace-pre-line text-sm">{formData.customer_details}</p></div> 
              <table className="w-full text-sm border-collapse border border-gray-300 mb-8"> 
                <thead><tr className="bg-blue-50 text-blue-900"><th className="border p-2 w-12 text-center">#</th><th className="border p-2 text-left">NEPL ID</th><th className="border p-2 text-left">Description</th><th className="border p-2 text-left">Make / Model</th><th className="border p-2 text-center w-16">Qty</th><th className="border p-2 text-left">Visual</th>{showEngineerRemarksColumn && <th className="border p-2 text-left">Remarks</th>}</tr></thead> 
                <tbody>{equipmentList.map((eq, idx) => (<tr key={idx}><td className="border p-2 text-center">{idx + 1}</td><td className="border p-2 font-semibold text-blue-700">{formData.srf_no}-{idx + 1}</td><td className="border p-2">{eq.material_desc}</td><td className="border p-2">{eq.make} / {eq.model}</td><td className="border p-2 text-center">{eq.qty}</td><td className="border p-2">{eq.inspe_status}</td>{showEngineerRemarksColumn && <td className="border p-2 text-xs">{eq.engineer_remarks || '-'}</td>}</tr>))}</tbody> 
              </table> 
            </div> 
          </div> 
          <div className="p-6 border-t bg-gray-50 flex justify-end gap-4 rounded-b-lg"><button onClick={handleClosePreview} className="px-6 py-3 text-gray-700 bg-white border rounded-lg font-medium">Cancel / Edit</button><button onClick={handleFinalSubmit} className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-md"><Save size={20} /><span>Submit Inward</span></button></div> 
        </div> 
      </div>,
      document.body
    ); 
  };
  
  const renderEmailModal = () => !showEmailModal ? null : createPortal( 
    <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-black bg-opacity-70"> 
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl m-4 p-8 relative"> 
            <button onClick={handleScheduleFir} className="absolute top-4 right-4 text-gray-400 hover:text-red-500"><X size={24} /></button> 
            <div className="flex items-center space-x-4 mb-4"><Send className="text-green-600" size={36} /><h2 className="text-2xl font-bold text-gray-800">Submission Successful!</h2></div> 
            <p className="text-gray-600 mb-6">Inward SRF <strong>{lastSavedSrfNo}</strong> created.<br/>Download complete. Send FIR to customer?</p> 
            <div className="space-y-6"> 
                <form onSubmit={handleSendFir} className="p-4 border rounded-lg bg-gray-50"> 
                    <div className="space-y-2"> 
                        {reportEmails.map((email, index) => ( 
                            <div key={index} className="flex gap-2"> 
                                <input type="email" value={email} onChange={(e) => { const newEmails = [...reportEmails]; newEmails[index] = e.target.value; setReportEmails(newEmails); }} required className="flex-grow px-4 py-2 border rounded-lg" placeholder="Customer email..." /> 
                                {reportEmails.length > 1 && (<button type="button" onClick={() => removeEmailField(index)} className="px-3 py-2 text-red-600"><X size={16} /></button>)} 
                            </div> 
                        ))} 
                        <div className="flex gap-2"><button type="button" onClick={addEmailField} className="px-4 py-2 text-blue-600 bg-blue-50 rounded-lg">+ Add Email</button><button type="submit" className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-bold"><Send size={18} /><span>Send FIR</span></button></div> 
                    </div> 
                </form> 
                <div className="p-4 border rounded-lg bg-gray-50"><button type="button" onClick={handleScheduleFir} className="w-full flex items-center justify-center gap-2 px-6 py-3 text-orange-700 bg-orange-100 rounded-lg font-medium"><Clock size={20} /><span>Schedule for Later</span></button></div> 
            </div> 
        </div> 
    </div>,
    document.body
  );

  const renderDownloadModal = () => {
    if (!showDownloadModal) return null;
    return createPortal(
      <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 transform transition-all scale-100">
          <div className="flex items-center gap-3 mb-4"><div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Download size={24} /></div><h3 className="text-xl font-bold text-gray-900">PDF Options</h3></div>
          <p className="text-sm text-gray-500 mb-6">Inward saved. Download receipt PDF?</p>
          <label className={`flex items-start gap-4 p-4 border rounded-xl cursor-pointer transition-all ${includeOutsourceInPDF ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'}`}>
            <div className="pt-0.5"><input type="checkbox" checked={includeOutsourceInPDF} onChange={(e) => setIncludeOutsourceInPDF(e.target.checked)} /></div>
            <div className="flex-1"><span className="font-bold text-gray-900 block">Include Outsource Info</span><span className="text-[10px] text-gray-500">Supplier and DC details</span></div>
          </label>
          <div className="flex flex-col gap-3 mt-8"><button onClick={handleConfirmDownload} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"><Download size={20} /><span>Download PDF</span></button><button onClick={handleSkipDownload} className="w-full py-3 text-gray-500 bg-white border rounded-xl font-semibold transition-colors">{isEditMode ? 'Close' : 'Skip & Continue'}</button></div>
        </div>
      </div>,
      document.body
    );
  };

  const renderDeleteRowModal = () => {
    if (rowToDelete === null) return null;
    return createPortal(
        <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100"><div className="p-6 pb-0 flex justify-between items-start"><div className="p-3 bg-red-100 rounded-full"><AlertCircle className="h-6 w-6 text-red-600" /></div><button onClick={() => setRowToDelete(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button></div><div className="p-6"><h3 className="text-lg font-bold text-gray-900 mb-2">Delete Row?</h3><p className="text-gray-600">Action cannot be undone.</p></div><div className="p-6 pt-0 flex gap-3"><button onClick={() => setRowToDelete(null)} className="flex-1 px-4 py-2.5 bg-white border rounded-lg">Cancel</button><button onClick={confirmDeleteRow} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg">Delete</button></div></div>
        </div>,
        document.body
    );
  };

  const formOpacity = isLocked ? "opacity-70 pointer-events-none select-none" : "opacity-100";

  if (isLoadingData) {
    return (
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100 relative overflow-hidden animate-in fade-in duration-300">
        <div className="flex flex-wrap items-center justify-between border-b pb-4 mb-6 gap-4"><div className="flex items-center space-x-4"><div className="h-8 w-8 bg-gray-200 rounded animate-pulse" /><div><div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" /></div></div><div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse" /></div>
        <div className="mb-8"><div className="h-6 w-40 bg-gray-200 rounded mb-4 animate-pulse" /><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 bg-gray-50 rounded-lg border border-gray-100">{[...Array(6)].map((_, i) => (<div key={i}><div className="h-4 w-32 bg-gray-200 rounded mb-2 animate-pulse" /><div className="h-10 w-full bg-white border rounded-lg animate-pulse" /></div>))}</div></div>
      </div>
    );
  }

  if (showSpecsManager) {
    return (
      <div className="animate-in fade-in duration-300">
        <HTWManufacturerSpecsManager onBack={() => { fetchMakes(); setShowSpecsManager(false); }} />
      </div>
    );
  }

  return (
    <>
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100 relative overflow-hidden">
      {isLocked && (<div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-3 relative z-10 mb-4 rounded-lg"><div className="p-1.5 bg-amber-100 rounded-full text-amber-600"><Lock className="h-5 w-5 animate-pulse" /></div><div><h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide">Read-Only Mode</h3><p className="text-xs text-amber-700">Being edited by another user.</p></div></div>)}
      <div className="flex flex-wrap items-center justify-between border-b pb-4 mb-6 gap-4">
        <div className="flex items-center space-x-4"><FileText className="h-8 w-8 text-blue-600" /><div><h1 className="text-3xl font-bold text-gray-900">{isEditMode ? 'Edit Inward Form' : 'New Inward Form'}</h1></div></div>
        <div className="flex items-center space-x-2 sm:space-x-4">
           {!isEditMode && (<div className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-100 px-4 py-2 rounded-lg border">{getDraftStatusIcon()} <span className="font-medium">{getDraftStatusText()}</span></div>)}
          <button type="button" onClick={handleBackToPortal} className="flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold text-sm"><ArrowLeft size={18} /> <span>Back</span></button>
        </div>
      </div>

      {!isEditMode && hasFormData && (<div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3"><Save className="h-5 w-5 text-blue-600" /><div><h3 className="font-semibold text-blue-900">Auto-Save Active</h3><p className="text-sm text-blue-700">Progress is saved automatically.</p></div></div>)}
      {message && (<div className={`my-4 px-4 py-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>{message.text}</div>)}

      <form onSubmit={handlePreviewClick} className={formOpacity} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as any).type !== 'textarea') e.preventDefault(); }}>
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 bg-gray-50 rounded-lg border">
             <div className="md:col-span-1"><label className="block text-sm font-semibold text-gray-700 mb-2">SRF No</label><div className="flex items-center px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 font-bold">{formData.srf_no}</div></div>
             <div><label className="block text-sm font-semibold text-gray-700 mb-2">Received Date *</label><input type="date" name="received_date" value={formData.received_date} onChange={handleFormChange} required className="w-full px-4 py-2 border rounded-lg" disabled={isLocked} /></div>
             <div><label className="block text-sm font-semibold text-gray-700 mb-2">Inward Date *</label><input type="date" name="material_inward_date" value={formData.material_inward_date} onChange={handleFormChange} required className="w-full px-4 py-2 border rounded-lg" disabled={isLocked} /></div>
             <div><label className="block text-sm font-semibold text-gray-700 mb-2">Customer DC No. *</label><input type="text" name="customer_dc_no" value={formData.customer_dc_no} onChange={handleFormChange} required className="w-full px-4 py-2 border rounded-lg" disabled={isLocked} /></div>
             <div><label className="block text-sm font-semibold text-gray-700 mb-2">Customer DC Date</label><input type="date" name="customer_dc_date" value={formData.customer_dc_date} onChange={handleFormChange} className="w-full px-4 py-2 border rounded-lg" disabled={isLocked} /></div>
             <div><label className="block text-sm font-semibold text-gray-700 mb-2">Receiver *</label><input type="text" name="receiver" value={formData.receiver} onChange={handleFormChange} required className="w-full px-4 py-2 border rounded-lg" disabled={isLocked} /></div>
             <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <SearchableSelect
                    label="Company Name *"
                    options={uniqueCompanies}
                    value={mainSelectedCompany}
                    placeholder="Select Company..."
                    onChange={(val) => {
                       setMainSelectedCompany(val);
                       setFormData(prev => ({ ...prev, customer_id: null, customer_details: '' }));
                       setSelectedCustomerId(null);
                    }}
                    onAddNew={() => setShowAddCustomerModal(true)}
                    addNewLabel="+ Add New Company"
                    disabled={isEditMode || isLocked}
                  />
                </div>
                <div>
                  <SearchableSelect
                    label="Branch / Location *"
                    options={mainLocationOptions}
                    value={selectedCustomerData ? (selectedCustomerData.location_name || (selectedCustomerData.customer_details.includes(' - ') ? selectedCustomerData.customer_details.split(' - ')[1] : 'Main Office')) : ''}
                    placeholder={mainSelectedCompany ? "Select Location..." : "Select Company First"}
                    onChange={(val) => {
                       const cust = mainFilteredLocations.find(c => (c.location_name || (c.customer_details.includes(' - ') ? c.customer_details.split(' - ')[1] : 'Main Office')) === val);
                       if (cust) {
                           setFormData(prev => ({ ...prev, customer_id: cust.customer_id, customer_details: cust.customer_details }));
                           setSelectedCustomerId(cust.customer_id);
                       }
                    }}
                    disabled={!mainSelectedCompany || isEditMode || isLocked}
                  />
                </div>
             </div>
            {selectedCustomerData && (
              <>
                <div className="md:col-span-2 lg:col-span-1.5"><label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><MapPin size={16} className="text-gray-500" /> Ship To</label><div className="w-full px-4 py-3 bg-gray-100 border rounded-lg text-gray-700 text-sm min-h-[80px] whitespace-pre-wrap">{selectedCustomerData.ship_to_address || 'N/A'}</div></div>
                <div className="md:col-span-2 lg:col-span-1.5"><label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Receipt size={16} className="text-gray-500" /> Bill To</label><div className="w-full px-4 py-3 bg-gray-100 border rounded-lg text-gray-700 text-sm min-h-[80px] whitespace-pre-wrap">{selectedCustomerData.bill_to_address || 'N/A'}</div></div>
              </>
            )}
          </div>
        </div>

        <div className="mb-6">
           <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2"><Wrench size={24} className="text-blue-600" />Equipment Details</h2><div className="relative"><button type="button" onClick={() => setShowSettingsDropdown(!showSettingsDropdown)} className="p-2 bg-gray-100 border rounded-lg transition-colors"><Settings size={20} /></button>{showSettingsDropdown && (<><div className="fixed inset-0 z-[90]" onClick={() => setShowSettingsDropdown(false)}></div><div className="absolute right-0 mt-2 w-72 bg-white border rounded-lg shadow-xl z-[100] py-1"><button type="button" onClick={() => { setShowSettingsDropdown(false); setShowSpecsManager(true); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2 font-medium transition-colors"><Settings size={16} /><span>Add/Update Manufacturer Specs</span></button></div></>)}</div></div>
           <div className="overflow-x-auto border rounded-lg bg-white shadow-sm">
              <table className="w-full text-sm border-collapse min-w-[2500px]">
                <thead className="bg-slate-100">
                    <tr><th className="sticky left-0 z-20 p-3 text-center text-xs font-semibold uppercase bg-slate-100 border-b">#</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[160px]">NEPL ID</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[280px]">Material Description *</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[200px]">Make *</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[200px]">Model *</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[150px]">Range</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[150px]">Serial No</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[100px]">Qty *</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[150px]">Calibration *</th>{isAnyOutsourced && (<><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[200px]">Supplier</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[150px]">In DC</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[150px]">Out DC</th></>)}<th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[200px]">Accessories</th><th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[150px]">Visual</th>{showEngineerRemarksColumn && (<th className="p-3 text-left text-xs font-semibold uppercase border-b w-[200px]">Eng. Remarks</th>)}{showCustomerRemarksColumn && (<th className="p-3 text-left text-xs font-semibold uppercase border-b w-[200px]">Customer Feedback</th>)}<th className="p-3 text-left text-xs font-semibold uppercase border-b min-w-[250px]">Photos</th><th className="sticky right-0 z-20 p-3 text-center text-xs font-semibold uppercase bg-slate-100 border-b">Actions</th></tr>
                </thead>
                <tbody>
                  {equipmentList.map((equipment, index) => {
                    const isHydraulic = equipment.material_desc === "Hydraulic Torque Wrench";
                    return (
                    <React.Fragment key={index}>
                      <tr className={`hover:bg-slate-50 group ${equipment.inspe_status === 'Not OK' ? 'bg-orange-50' : ''}`}>
                        <td className="sticky left-0 z-10 p-3 text-center font-semibold bg-white group-hover:bg-slate-50">{index + 1}</td>
                        <td className="p-2"><input type="text" value={`${formData.srf_no}-${index + 1}`} disabled className="w-full bg-slate-100 font-medium px-2 py-1.5 border rounded-md" /></td>
                        <td className="p-2"><MaterialSearchSelect value={equipment.material_desc} options={materialOptions} configuredTypes={configuredTypes} disabled={isLocked} onChange={(val) => handleEquipmentChange(index, 'material_desc', val)} onAddNew={() => { setActiveRowForNewMaterial(index); setEditingMaterialValue(null); setNewMaterialInput(""); setShowAddMaterialModal(true); }} onEditCustom={(val) => { setActiveRowForNewMaterial(index); setEditingMaterialValue(val); setNewMaterialInput(val); setShowAddMaterialModal(true); }} /></td>
                        <td className="p-2">{isHydraulic ? (<select value={equipment.make} onChange={e => handleEquipmentChange(index, 'make', e.target.value)} required className="w-full px-2 py-1.5 border rounded-md bg-white" disabled={isLocked}><option value="">Select Make</option>{makeOptions.map(m => (<option key={m} value={m}>{m}</option>))}</select>) : (<input type="text" value={equipment.make} onChange={e => handleEquipmentChange(index, 'make', e.target.value)} required placeholder="Enter Make" className="w-full px-2 py-1.5 border rounded-md bg-white" disabled={isLocked} />)}</td>
                        <td className="p-2">{isHydraulic ? (<select value={equipment.model} onChange={e => handleEquipmentChange(index, 'model', e.target.value)} required disabled={!equipment.make || isLocked} className="w-full px-2 py-1.5 border rounded-md bg-white"><option value="">Select Model</option>{equipment.make && modelCache[equipment.make]?.map(m => (<option key={m} value={m}>{m}</option>))}</select>) : (<input type="text" value={equipment.model} onChange={e => handleEquipmentChange(index, 'model', e.target.value)} required placeholder="Enter Model" className="w-full px-2 py-1.5 border rounded-md bg-white" disabled={isLocked} />)}</td>
                        <td className="p-2"><input value={equipment.range} readOnly={isHydraulic} onChange={e => !isHydraulic && handleEquipmentChange(index, 'range', e.target.value)} className={`w-full px-2 py-1.5 border rounded-md ${isHydraulic ? 'bg-gray-50' : ''}`} placeholder={isHydraulic ? 'Auto-filled' : 'Enter Range'} disabled={isLocked} /></td>
                        <td className="p-2"><input value={equipment.serial_no} onChange={e=>handleEquipmentChange(index,'serial_no',e.target.value)} className="w-full px-2 py-1.5 border rounded-md" disabled={isLocked} /></td>
                        <td className="p-2"><input type="number" value={equipment.qty} min={1} onChange={e=>handleEquipmentChange(index,'qty',e.target.value)} required className="w-full px-2 py-1.5 border rounded-md text-center" disabled={isLocked} /></td>
                        <td className="p-2"><select value={equipment.calibration_by} onChange={e=>handleEquipmentChange(index,'calibration_by',e.target.value)} className="w-full px-2 py-1.5 border rounded-md" disabled={isLocked}><option value="In Lab">In Lab</option><option value="Outsource">Outsource</option><option value="On-Site">On-Site</option></select></td>
                        {equipment.calibration_by === 'Outsource' ? (
                          <>
                            <td className="p-2"><input placeholder="Supplier" value={(equipment as any).supplier || ''} onChange={(e) => handleEquipmentChange(index, 'supplier' as any, e.target.value)} className="w-full px-2 py-1.5 border rounded-md" disabled={isLocked} /></td>
                            <td className="p-2"><input placeholder="In DC" value={(equipment as any).in_dc || ''} onChange={(e) => handleEquipmentChange(index, 'in_dc' as any, e.target.value)} className="w-full px-2 py-1.5 border rounded-md" disabled={isLocked} /></td>
                            <td className="p-2"><input placeholder="Out DC" value={(equipment as any).out_dc || ''} onChange={(e) => handleEquipmentChange(index, 'out_dc' as any, e.target.value)} className="w-full px-2 py-1.5 border rounded-md" disabled={isLocked} /></td>
                          </>
                        ) : ( isAnyOutsourced && <td colSpan={3} className="p-2 bg-slate-50"></td> )}
                        <td className="p-2"><input value={equipment.accessories_included} onChange={e=>handleEquipmentChange(index,'accessories_included',e.target.value)} className="w-full px-2 py-1.5 border rounded-md" placeholder="e.g. Case" disabled={isLocked} /></td>
                        <td className="p-2"><select value={equipment.inspe_status} onChange={e=>handleEquipmentChange(index,'inspe_status',e.target.value)} className={`w-full px-2 py-1.5 border rounded-md ${equipment.inspe_status === 'Not OK' ? 'bg-red-50 border-red-300' : ''}`} disabled={isLocked}><option value="OK">OK</option><option value="Not OK">Not OK</option></select></td>
                        {showEngineerRemarksColumn && (<td className="p-2 relative group w-[200px]">{equipment.inspe_status === 'Not OK' ? (<><textarea placeholder="Describe issue..." value={equipment.engineer_remarks || ''} onChange={e => handleEquipmentChange(index, 'engineer_remarks', e.target.value)} className="w-full h-10 px-2 py-1.5 border rounded-md text-xs bg-yellow-50 resize-none" disabled={isLocked} /><TruncatedTooltip text={equipment.engineer_remarks || ''} type="input" /></>) : (<div className="text-center pt-2">-</div>)}</td>)}
                        {showCustomerRemarksColumn && (<td className="p-2 relative group w-[200px]">{equipment.remarks_and_decision ? (<div className="w-full h-10 p-2 bg-yellow-50 border rounded text-xs truncate"><div className="flex items-center gap-1.5"><MessageSquare size={12} className="flex-shrink-0" /><span className="truncate">{equipment.remarks_and_decision}</span></div><TruncatedTooltip text={equipment.remarks_and_decision} type="display" /></div>) : (<div className="text-center pt-2">-</div>)}</td>)}
                        <td className="p-2"><div className="flex items-center gap-2"><label htmlFor={`photo-${index}`} className={`cursor-pointer bg-gray-200 px-2 py-1 rounded text-xs flex items-center gap-1 ${isLocked ? 'opacity-50' : ''}`}><Camera size={12}/> Attach</label><input id={`photo-${index}`} type="file" multiple accept="image/*" className="hidden" onChange={e=>handlePhotoChange(index,e)} disabled={isLocked} /></div><div className="flex flex-wrap gap-1 mt-1">{equipment.existingPhotoUrls?.map((url, i) => (<a key={`ex-${i}`} href={resolvePhotoUrl(url)} target="_blank" rel="noreferrer" className="w-8 h-8 border"><img src={resolvePhotoUrl(url)} className="w-full h-full object-cover"/></a>))}{equipment.photoPreviews?.map((url, i) => (<div key={`new-${i}`} className="relative w-8 h-8 border"><img src={url} className="w-full h-full object-cover"/>{!isLocked && <button type="button" onClick={()=>handleRemovePhoto(index,i)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={8}/></button>}</div>))}</div></td>
                        <td className="sticky right-0 z-10 p-2 text-center bg-white group-hover:bg-slate-50 border-l"><div className="flex justify-center gap-2"><button type="button" onClick={() => viewEquipmentDetails(index)} className="text-blue-600 hover:bg-blue-100 p-1 rounded transition-colors"><Eye size={18}/></button>{!isEditMode && !isLocked && (<button type="button" onClick={() => setRowToDelete(index)} className="text-red-600 hover:bg-red-100 p-1 rounded transition-colors"><Trash2 size={18}/></button>)}</div></td>
                      </tr>
                    </React.Fragment>
                  )})}
                </tbody>
              </table>
           </div>
           {!isEditMode && !isLocked && (<button type="button" onClick={addEquipmentRow} className="mt-4 w-full py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 font-semibold hover:bg-blue-50 flex items-center justify-center gap-2 transition-all"><Plus size={20} /><span>Add Equipment Row</span></button>)}
        </div>

        <div className="flex flex-wrap justify-end pt-6 border-t mt-8 gap-4 pointer-events-auto opacity-100"> 
          <button type="button" onClick={handleStandardDownload} disabled={!isFormReady} className="flex items-center space-x-2 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white font-medium px-6 py-3 rounded-lg shadow transition-colors"><FileText size={20} /><span>Download PDF</span></button>
          <button type="submit" disabled={!isFormReady || isLoading || isLocked} className="flex items-center space-x-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold px-8 py-3 rounded-lg text-lg shadow-lg transition-all transform hover:scale-105">{isLoading ? <Loader2 className="animate-spin" size={24} /> : <Save size={24} />}<span>{isEditMode ? 'Update Inward' : 'Preview & Submit'}</span></button>
        </div>
      </form>

    </div>
    
    {/* MODALS RENDERED HERE VIA CREATEPORTAL TO AVOID Z-INDEX CLIPPING */}
    {renderPreviewModal()}
    {renderEmailModal()}
    {renderAddCustomerModal()}
    {renderAddMaterialModal()}
    {renderDownloadModal()}
    {renderDeleteRowModal()}
    {isCompanyModalOpen && <CompanyEntryModal isOpen={isCompanyModalOpen} onClose={() => setCompanyModalOpen(false)} initialCompanyName={modalInitialCompany} onConfirm={(c, l) => { setCompanyName(c); setLocationName(l); setIsCustomCompany(true); setCompanyModalOpen(false); }} />}
    </>
  );
};

export default InwardForm;