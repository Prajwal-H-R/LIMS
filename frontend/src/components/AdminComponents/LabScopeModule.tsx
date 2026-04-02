import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Plus, Edit, Trash2, X, Save, Loader2, AlertCircle,
  Building2, ShieldCheck, Hash, Calendar, CheckCircle, PowerOff,
  FileText, Download
} from 'lucide-react';
import { api, ENDPOINTS } from '../../api/config';

export interface LabScopeRecord {
  id?: number;
  laboratory_name: string;
  accreditation_standard: string | null;
  lab_unique_number: string | null;
  valid_from: string | null;
  valid_upto: string | null;
  is_active: boolean;
  document_filename?: string | null;
  has_document?: boolean;
}

interface LabScopeModuleProps {
  onBack: () => void;
}

const LabScopeSkeleton = () => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-20 animate-pulse">
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {[...Array(7)].map((_, i) => (
              <th key={i} className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded" /></th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...Array(5)].map((_, i) => (
            <tr key={i}>
              <td className="px-6 py-4"><div className="h-5 w-32 bg-slate-200 rounded" /></td>
              <td className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded" /></td>
              <td className="px-6 py-4"><div className="h-4 w-12 bg-slate-200 rounded" /></td>
              <td className="px-6 py-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
              <td className="px-6 py-4"><div className="h-6 w-16 bg-slate-200 rounded-full" /></td>
              <td className="px-6 py-4 text-right"><div className="h-8 w-24 bg-slate-200 rounded" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const LabScopeModule: React.FC<LabScopeModuleProps> = ({ onBack }) => {
  const [data, setData] = useState<LabScopeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<LabScopeRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [addModalKey, setAddModalKey] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(ENDPOINTS.LAB_SCOPE.LIST);
      setData(res.data || []);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load Laboratory Scope');
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const isOpen = showAddModal || !!editingItem;
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [showAddModal, editingItem]);

  const handleAddNew = () => {
    setEditingItem(null);
    setAddModalKey((k) => k + 1);
    setShowAddModal(true);
  };

  const handleEdit = (item: LabScopeRecord) => {
    setShowAddModal(false);
    setEditingItem(item);
  };

  const handleToggleStatus = async (item: LabScopeRecord) => {
    if (!item.id) return;
    try {
      setTogglingId(item.id);
      await api.patch(ENDPOINTS.LAB_SCOPE.UPDATE_STATUS(item.id), null, {
        params: { is_active: !item.is_active },
      });
      setData(prev => prev.map(r => r.id === item.id ? { ...r, is_active: !r.is_active } : r));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update status');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      setDeletingId(id);
      await api.delete(ENDPOINTS.LAB_SCOPE.DELETE(id));
      setData(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async (formDataBody: FormData, isEdit: boolean) => {
    setSubmitting(true);
    try {
      if (isEdit && editingItem?.id) {
        await api.put(ENDPOINTS.LAB_SCOPE.UPDATE(editingItem.id), formDataBody);
        setEditingItem(null);
      } else {
        await api.post(ENDPOINTS.LAB_SCOPE.CREATE, formDataBody);
        setShowAddModal(false);
      }
      fetchData();
    } catch (err: any) {
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadDocument = async (item: LabScopeRecord) => {
    if (!item.id || !item.has_document) return;
    try {
      const res = await api.get(ENDPOINTS.LAB_SCOPE.DOCUMENT(item.id), { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.document_filename || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to download document');
    }
  };

  const formatDate = (d: string | null) => (!d ? '—' : new Date(d).toLocaleDateString('en-GB'));

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="mr-4 p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 shadow-sm transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="text-blue-500" size={24} />
              Laboratory Scope
            </h3>
            <p className="text-sm text-gray-500">Manage laboratory accreditation details for certificates</p>
          </div>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 shadow-sm transition-colors"
        >
          <Plus size={16} className="mr-2" /> Add New
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center">
          <AlertCircle size={18} className="mr-2" /> {error}
        </div>
      )}

      {loading ? (
        <LabScopeSkeleton />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-20">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase">
                  <th className="px-6 py-4">Laboratory Name</th>
                  <th className="px-6 py-4">Accreditation Standard</th>
                  <th className="px-6 py-4">Lab Unique Number</th>
                  <th className="px-6 py-4">Valid From</th>
                  <th className="px-6 py-4">Valid Upto</th>
                  <th className="px-6 py-4">Document</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No records. Click &quot;Add New&quot; to create one.
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{item.laboratory_name}</td>
                      <td className="px-6 py-4 text-gray-600">{item.accreditation_standard || '—'}</td>
                      <td className="px-6 py-4 font-mono text-gray-700">{item.lab_unique_number || '—'}</td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(item.valid_from)}</td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(item.valid_upto)}</td>
                      <td className="px-6 py-4">
                        {item.has_document ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadDocument(item)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <Download size={14} />
                            <span className="max-w-[140px] truncate" title={item.document_filename || ''}>
                              {item.document_filename || 'Download'}
                            </span>
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleStatus(item)}
                          disabled={togglingId === item.id}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {togglingId === item.id ? (
                            <Loader2 size={12} className="animate-spin mr-1" />
                          ) : (
                            item.is_active ? <CheckCircle size={12} className="mr-1" /> : <PowerOff size={12} className="mr-1" />
                          )}
                          {item.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id!)}
                            disabled={deletingId === item.id}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && createPortal(
        <LabScopeFormModal
          key={`add-${addModalKey}`}
          onClose={() => setShowAddModal(false)}
          onSave={(fd) => handleSave(fd, false)}
          submitting={submitting}
        />,
        document.body
      )}

      {editingItem && createPortal(
        <LabScopeFormModal
          key={`edit-${editingItem.id}`}
          initialData={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={(fd) => handleSave(fd, true)}
          submitting={submitting}
        />,
        document.body
      )}
    </div>
  );
};

interface LabScopeFormModalProps {
  initialData?: LabScopeRecord | null;
  onClose: () => void;
  onSave: (formData: FormData) => Promise<void>;
  submitting: boolean;
}

const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const LabScopeFormModal: React.FC<LabScopeFormModalProps> = ({
  initialData,
  onClose,
  onSave,
  submitting,
}) => {
  const isEdit = !!initialData?.id;
  const [formData, setFormData] = useState(() => ({
    laboratory_name: initialData?.laboratory_name || '',
    accreditation_standard: initialData?.accreditation_standard || '',
    lab_unique_number: initialData?.lab_unique_number || '',
    valid_from: initialData?.valid_from ? initialData.valid_from.split('T')[0] : '',
    valid_upto: initialData?.valid_upto ? initialData.valid_upto.split('T')[0] : '',
    is_active: initialData?.is_active ?? false,
  }));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [removeDocument, setRemoveDocument] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setSelectedFile(f);
    if (f) setRemoveDocument(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!formData.laboratory_name.trim()) {
      setErr('Laboratory Name is required.');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('laboratory_name', formData.laboratory_name.trim());
      fd.append('accreditation_standard', formData.accreditation_standard.trim());
      fd.append('lab_unique_number', formData.lab_unique_number.trim());
      fd.append('valid_from', formData.valid_from);
      fd.append('valid_upto', formData.valid_upto);
      fd.append('is_active', formData.is_active ? 'true' : 'false');
      if (selectedFile) fd.append('document', selectedFile);
      if (isEdit && removeDocument) fd.append('clear_document', 'true');
      await onSave(fd);
      onClose();
    } catch (e: any) {
      const d = e.response?.data?.detail;
      setErr(typeof d === 'string' ? d : 'Failed to save.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-fadeIn overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="text-blue-500" size={20} />
            {isEdit ? 'Edit Laboratory Scope' : 'Add New Laboratory Scope'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {err && (
          <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
            <AlertCircle size={16} /> {err}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Laboratory Name <span className="text-red-500">*</span></label>
            <div className="relative">
              <Building2 className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                name="laboratory_name"
                value={formData.laboratory_name}
                onChange={handleChange}
                required
                placeholder="e.g. NABL Accredited Lab"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Accreditation Standard</label>
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                name="accreditation_standard"
                value={formData.accreditation_standard}
                onChange={handleChange}
                placeholder="e.g. ISO/IEC 17025:2017"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lab Unique Number</label>
            <p className="text-xs text-gray-500 mb-1">Displayed under right logo in certificates</p>
            <div className="relative">
              <Hash className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                name="lab_unique_number"
                value={formData.lab_unique_number}
                onChange={handleChange}
                placeholder="e.g. TC-1234"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="date"
                name="valid_from"
                value={formData.valid_from}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid Upto</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="date"
                name="valid_upto"
                value={formData.valid_upto}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex items-center pt-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
              <span className="ml-3 text-sm font-medium text-gray-900">Active (used in certificates)</span>
            </label>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <FileText size={16} className="text-gray-500" />
              Supporting document
            </label>
            <p className="text-xs text-gray-500 mb-2">PDF, Word (.doc, .docx), or Excel (.xls, .xlsx). Max 25 MB. Stored in the database.</p>
            <input
              type="file"
              accept={DOC_ACCEPT}
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {selectedFile && (
              <p className="mt-2 text-xs text-gray-600">Selected: {selectedFile.name}</p>
            )}
            {isEdit && initialData?.has_document && !selectedFile && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-600">
                  Current file: <span className="font-medium">{initialData.document_filename || 'attached'}</span>
                </p>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removeDocument}
                    onChange={(e) => setRemoveDocument(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Remove attached document
                </label>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex items-center px-6 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-70">
              {submitting ? <Loader2 size={18} className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
              {isEdit ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
