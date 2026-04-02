// src/components/htw/HTWEnvironmentManager.tsx

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowLeft, Plus, History, Trash2, X, Save, 
  Loader2, AlertCircle, Thermometer, Droplets,
  Eye, CheckCircle2, AlertTriangle
} from 'lucide-react';

// ✅ Import ENDPOINTS
import { api, ENDPOINTS } from '../../api/config'; 

// --- TYPES ---
export interface HTWEnvironmentConfig {
  id: number;
  temp_min: number;
  temp_max: number;
  humidity_min: number;
  humidity_max: number;
  created_at: string;
}

interface HTWEnvironmentManagerProps {
  onBack: () => void;
}

// --- SKELETON COMPONENT ---
const SkeletonLoader = () => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-20 animate-pulse">
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {[...Array(5)].map((_, i) => (
              <th key={i} className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded"></div></th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...Array(5)].map((_, i) => (
            <tr key={i}>
              {[...Array(5)].map((_, j) => (
                <td key={j} className="px-6 py-4"><div className="h-5 w-20 bg-slate-200 rounded"></div></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ============================================================================
// MAIN MANAGER COMPONENT
// ============================================================================
export const HTWEnvironmentManager: React.FC<HTWEnvironmentManagerProps> = ({ onBack }) => {
  const [viewMode, setViewMode] = useState<'list' | 'add'>('list');
  const [data, setData] = useState<HTWEnvironmentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- MODALS ---
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<HTWEnvironmentConfig | null>(null);

  // --- ACTIONS ---
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Scroll lock for modal
  useEffect(() => {
    document.body.style.overflow = (isViewModalOpen) ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isViewModalOpen]);

  // --- API FETCH ---
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // ✅ FIX: Use constant from config.ts (uses plural /configs)
      const response = await api.get<HTWEnvironmentConfig[]>(ENDPOINTS.HTW_ENVIRONMENT_CONFIG.LIST); 
      
      // Sort by ID Descending (Highest ID = Latest = Active)
      const sortedData = (response.data || []).sort((a, b) => b.id - a.id);
      
      setData(sortedData);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to load environment config');
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- HANDLERS ---
  const handleAddNewClick = () => setViewMode('add');

  const handleViewClick = (item: HTWEnvironmentConfig) => {
    setViewingItem(item);
    setIsViewModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure? Deleting history allows you to remove errors, but generally historical configurations should be kept for audit trails.")) return;
    try {
      setDeletingId(id);
      // ✅ FIX: Use constant
      await api.delete(ENDPOINTS.HTW_ENVIRONMENT_CONFIG.DELETE(id));
      setData(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async (payload: Omit<HTWEnvironmentConfig, 'id' | 'created_at'>) => {
    setSubmitting(true);
    try {
      // ✅ FIX: Use constant
      await api.post(ENDPOINTS.HTW_ENVIRONMENT_CONFIG.CREATE, payload);
      setViewMode('list');
      fetchData(); // Refresh list to see new active item
    } catch (err: any) {
      throw err; // Pass error back to form to display
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (viewMode === 'add') {
    return (
      <AddConfigPage 
        onCancel={() => setViewMode('list')}
        onSave={handleSave}
        submitting={submitting}
        // Pass the current active config (index 0) as default values
        initialData={data.length > 0 ? data[0] : undefined} 
      />
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center">
          <button onClick={onBack} className="mr-4 p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
             <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
               <Thermometer size={24} className="text-orange-500" />
               Environment Ranges
             </h3>
             <p className="text-sm text-gray-500">Configure allowable Temperature and Humidity limits</p>
          </div>
        </div>
        <button 
          onClick={handleAddNewClick} 
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
        >
            <Plus size={16} className="mr-2" /> Set New Range
        </button>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* TABLE */}
      {loading ? <SkeletonLoader /> : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-20">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase">
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Temperature (°C)</th>
                  <th className="px-6 py-4">Humidity (%)</th>
                  <th className="px-6 py-4">Effective Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {data.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No configuration history found.</td></tr>
                ) : (
                  data.map((item, index) => {
                    const isLatest = index === 0; 
                    return (
                      <tr key={item.id} className={`transition-colors ${isLatest ? 'bg-green-50/30' : 'hover:bg-gray-50'}`}>
                        <td className="px-6 py-4">
                           {isLatest ? (
                             <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                               <CheckCircle2 size={12} className="mr-1"/> ACTIVE
                             </span>
                           ) : (
                             <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                               <History size={12} className="mr-1"/> HISTORY
                             </span>
                           )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-gray-700 font-medium">{item.temp_min} - {item.temp_max}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-gray-700 font-medium">{item.humidity_min}% - {item.humidity_max}%</span>
                        </td>
                        <td className="px-6 py-4 text-gray-500">{formatDate(item.created_at)}</td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex items-center justify-end gap-2">
                             <button onClick={() => handleViewClick(item)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="View">
                                <Eye size={16} />
                             </button>
                             {!isLatest && (
                               <button 
                                 onClick={() => handleDelete(item.id)} 
                                 disabled={deletingId === item.id}
                                 className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                                 title="Delete"
                               >
                                  {deletingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                               </button>
                             )}
                           </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {isViewModalOpen && viewingItem && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[99999] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Thermometer size={20} className="text-blue-500" />
                Config Details
              </h3>
              <button onClick={() => setIsViewModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                  <span className="text-xs font-semibold text-orange-600 uppercase block mb-1">Temperature</span>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Min</span>
                    <span className="font-bold text-gray-900">{viewingItem.temp_min}°C</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm text-gray-500">Max</span>
                    <span className="font-bold text-gray-900">{viewingItem.temp_max}°C</span>
                  </div>
                </div>
                
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="text-xs font-semibold text-blue-600 uppercase block mb-1">Humidity</span>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Min</span>
                    <span className="font-bold text-gray-900">{viewingItem.humidity_min}%</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm text-gray-500">Max</span>
                    <span className="font-bold text-gray-900">{viewingItem.humidity_max}%</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-2">
                 <div className="flex justify-between text-sm">
                   <span className="text-gray-500">Effective Date:</span>
                   <span className="text-gray-900 font-medium">{formatDate(viewingItem.created_at)}</span>
                 </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 flex justify-end">
              <button onClick={() => setIsViewModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// ============================================================================
// ADD PAGE COMPONENT
// ============================================================================
interface AddPageProps {
  onCancel: () => void;
  onSave: (payload: Omit<HTWEnvironmentConfig, 'id' | 'created_at'>) => Promise<void>;
  submitting: boolean;
  initialData?: HTWEnvironmentConfig;
}

const AddConfigPage: React.FC<AddPageProps> = ({ onCancel, onSave, submitting, initialData }) => {
  
  // Use previous data as default values if available for easier copying
  const [formData, setFormData] = useState({
    temp_min: initialData?.temp_min ?? 22.0,
    temp_max: initialData?.temp_max ?? 24.0,
    humidity_min: initialData?.humidity_min ?? 50.0,
    humidity_max: initialData?.humidity_max ?? 70.0,
  });
  
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Convert inputs to numbers
    const tMin = Number(formData.temp_min);
    const tMax = Number(formData.temp_max);
    const hMin = Number(formData.humidity_min);
    const hMax = Number(formData.humidity_max);

    // Frontend validation
    if (tMin >= tMax) {
      setError("Temperature Min must be less than Max.");
      return;
    }
    if (hMin >= hMax) {
      setError("Humidity Min must be less than Max.");
      return;
    }

    try {
      await onSave({
        temp_min: tMin,
        temp_max: tMax,
        humidity_min: hMin,
        humidity_max: hMax,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save configuration.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fadeIn mb-20">
      <div className="mb-6">
        <button onClick={onCancel} className="flex items-center text-gray-500 hover:text-blue-600 transition-colors font-medium text-sm">
          <ArrowLeft size={16} className="mr-2" /> Back to History
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-xl font-bold text-gray-900 flex items-center">
            <Plus className="w-5 h-5 text-blue-500 mr-2" />
            Set New Environmental Limits
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            This will create a new active configuration record. All subsequent jobs will use these limits.
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm flex items-center">
            <AlertCircle size={16} className="mr-2" /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* TEMPERATURE */}
            <div className="space-y-4 p-4 bg-orange-50/50 rounded-xl border border-orange-100">
               <div className="flex items-center gap-2 mb-2">
                 <Thermometer className="text-orange-500" size={20}/>
                 <h4 className="font-semibold text-gray-800">Temperature (°C)</h4>
               </div>
               
               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Minimum</label>
                  <input
                    type="number" step="0.01"
                    name="temp_min"
                    value={formData.temp_min}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
               </div>
               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Maximum</label>
                  <input
                    type="number" step="0.01"
                    name="temp_max"
                    value={formData.temp_max}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
               </div>
            </div>

            {/* HUMIDITY */}
            <div className="space-y-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
               <div className="flex items-center gap-2 mb-2">
                 <Droplets className="text-blue-500" size={20}/>
                 <h4 className="font-semibold text-gray-800">Humidity (%)</h4>
               </div>
               
               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Minimum</label>
                  <input
                    type="number" step="0.01"
                    name="humidity_min"
                    value={formData.humidity_min}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
               </div>
               <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Maximum</label>
                  <input
                    type="number" step="0.01"
                    name="humidity_max"
                    value={formData.humidity_max}
                    onChange={handleChange}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
               </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
             <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
             <div>
               <p className="font-bold">Important:</p>
               <p>Saving this will immediately apply these new limits to all jobs started or recorded from this moment forward. Existing records remain unchanged.</p>
             </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-70 transition-all"
            >
              {submitting ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save className="mr-2" size={18} />}
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};