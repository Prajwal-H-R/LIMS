// frontend/src/components/AdminComponents/AdminUserManagement.tsx

import React, { useState, useEffect, FormEvent, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield, Power, PowerOff, UserPlus, Users, Info, Loader2,
  Settings, ChevronLeft, AlertCircle, X, Search,
  Filter, Briefcase, Wrench, Building2, Grid, AlignJustify,
  Lock, CheckCircle2, XCircle, ChevronDown, UserCog,
  Pencil, Thermometer, ArrowRight, AlertTriangle, MapPin, Plus
} from 'lucide-react';
import { api, ENDPOINTS } from '../../api/config';
import { UserRole } from '../../types';

// ====================================================================
// TYPES
// ====================================================================

export interface User {
  user_id: number;
  email: string;
  username: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  customer_id?: number | null;
  company_name?: string;
  location_name?: string;
  customer_details?: string;
  contact_person?: string | null;
  phone?: string | null;
  ship_to_address?: string | null;
  bill_to_address?: string | null;
}

export interface Customer {
  customer_id: number;
  company_name: string;
  location_name: string;
  customer_details: string;
  contact_person: string;
  phone: string;
  email: string;
  ship_to_address?: string;
  bill_to_address?: string;
}

type UserFilterTab = 'all' | 'admin' | 'engineer' | 'customer';

interface InvitationResponse {
  message: string;
}

// ====================================================================
// CUSTOM SEARCHABLE SELECT COMPONENT
// ====================================================================

interface SearchableSelectProps {
  label: string;
  options: string[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onAddNew?: () => void;
  addNewLabel?: string;
  disabled?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label, options, value, placeholder, onChange, onAddNew, addNewLabel, disabled
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    return options.filter(opt => 
      opt.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm]);

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div 
        className={`w-full border rounded-xl px-4 py-2.5 bg-white shadow-sm flex items-center justify-between cursor-pointer transition-all ${disabled ? 'bg-gray-100 opacity-60 cursor-not-allowed' : 'hover:border-blue-400'}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={value ? "text-gray-900 font-medium" : "text-gray-400"}>
          {value || placeholder}
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-fadeIn">
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
                onClick={(e) => { e.stopPropagation(); onAddNew(); setIsOpen(false); setSearchTerm(''); }}
              >
                <Plus size={14} /> {addNewLabel}
              </button>
            )}
            {filtered.length > 0 ? (
              filtered.map((opt, i) => (
                <div
                  key={i}
                  className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${value === opt ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700'}`}
                  onClick={(e) => { e.stopPropagation(); onChange(opt); setIsOpen(false); setSearchTerm(''); }}
                >
                  {opt}
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-gray-400 text-sm italic">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ====================================================================
// COMPANY ENTRY MODAL (Handles Company + Location)
// ====================================================================

interface CompanyEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (companyName: string, locationName: string) => void;
  initialCompanyName?: string;
}

const CompanyEntryModal: React.FC<CompanyEntryModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialCompanyName = ""
}) => {
  const [tempCompanyName, setTempCompanyName] = useState(initialCompanyName);
  const [tempLocation, setTempLocation] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTempCompanyName(initialCompanyName);
      setTempLocation('');
    }
  }, [isOpen, initialCompanyName]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempCompanyName.trim() && tempLocation.trim()) {
      onConfirm(tempCompanyName.trim(), tempLocation.trim());
    }
  };

  // Teleport to document.body to escape layout z-index issues
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100 border border-gray-200">
        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="text-blue-600" size={20} />
            {initialCompanyName ? `Add Location for ${initialCompanyName}` : 'Register New Company'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input
              type="text"
              value={tempCompanyName}
              onChange={(e) => setTempCompanyName(e.target.value)}
              disabled={!!initialCompanyName}
              placeholder="e.g. Acme Industries Ltd."
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 font-semibold"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch / Site Name</label>
            <input
              autoFocus
              type="text"
              value={tempLocation}
              onChange={(e) => setTempLocation(e.target.value)}
              placeholder="e.g. Mumbai Plant, Head Office, etc."
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition-all">Confirm Details</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// ====================================================================
// EDIT USER MODAL
// ====================================================================

export const EditUserModal: React.FC<{
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ user, onClose, onSaved }) => {
  const [email,          setEmail]          = useState('');
  const [fullName,       setFullName]       = useState('');
  const [username,       setUsername]       = useState('');
  const [contactPerson,  setContactPerson]  = useState('');
  const [phone,          setPhone]          = useState('');
  const [companyName,    setCompanyName]    = useState('');
  const [locationName,   setLocationName]   = useState('');
  const [shipTo,         setShipTo]         = useState('');
  const [billTo,         setBillTo]         = useState('');
  const [saving,         setSaving]         = useState(false);
  const [formError,      setFormError]      = useState<string | null>(null);

  const isCustomerLinked = Boolean(user?.customer_id) && user?.role === 'customer';

  useEffect(() => {
    if (!user) return;
    setEmail(user.email || '');
    setFullName(user.full_name || '');
    setUsername(user.username || '');
    setContactPerson(user.contact_person || '');
    setPhone(user.phone || '');
    
    // Bind company and location fields from DB user object
    setCompanyName(user.company_name || user.customer_details || '');
    setLocationName(user.location_name || ''); 
    
    setShipTo(user.ship_to_address || '');
    setBillTo(user.bill_to_address || '');
    setFormError(null);
  }, [user]);

  if (!user || typeof document === 'undefined') return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload: Record<string, string | null> = {
        email:     email.trim(),
        username:  username.trim(),
        full_name: fullName.trim() || null,
      };
      
      if (isCustomerLinked) {
        payload.contact_person   = contactPerson.trim() || null;
        payload.phone            = phone.trim() || null;
        payload.company_name     = companyName.trim() || null;
        payload.location_name    = locationName.trim() || null;
        payload.customer_details = companyName.trim() || null; // Fallback
        payload.ship_to_address  = shipTo.trim() || null;
        payload.bill_to_address  = billTo.trim() || null;
      }
      
      await api.put(ENDPOINTS.USERS.UPDATE(user.user_id), payload);
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
          ? (err as any).response?.data?.detail
          : null;
      setFormError(typeof msg === 'string' ? msg : 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  // Teleport to document.body to escape layout z-index issues
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center z-10">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Pencil className="text-blue-600" size={20} />
            Edit User Profile
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle size={16}/> {formError}
            </div>
          )}
          <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">
            Account: ID {user.user_id} · {user.role}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          
          {isCustomerLinked && (
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 size={14}/> Customer Organization
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company / Org</label>
                  <input type="text" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch / Location</label>
                  <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="e.g. Main Office" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                  <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ship-to Address</label>
                <textarea required rows={2} value={shipTo} onChange={(e) => setShipTo(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y min-h-[60px] focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bill-to Address</label>
                <textarea required rows={2} value={billTo} onChange={(e) => setBillTo(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y min-h-[60px] focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
          )}
          
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2 shadow-sm transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4"/>}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// ====================================================================
// COMPANY GROUP HEADER
// ====================================================================

const CompanyGroupHeader: React.FC<{
  companyName: string;
  users: User[];
  onBatchUpdate: (companyName: string, newStatus: boolean) => void;
  isUpdating: boolean;
}> = ({ companyName, users, onBatchUpdate, isUpdating }) => {
  const hasActiveUsers = users.some((u) => u.is_active);
  const targetStatus   = !hasActiveUsers;

  const handleBatchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const action = targetStatus ? 'ACTIVATE' : 'DEACTIVATE';
    if (window.confirm(`Are you sure you want to ${action} all ${users.length} users in ${companyName}?`)) {
      onBatchUpdate(companyName, targetStatus);
    }
  };

  if (companyName === 'Unassigned / Independent') {
    return (
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-gray-200 p-2 rounded-lg text-gray-500"><Users size={18} /></div>
          <div>
            <h4 className="font-bold text-gray-800 text-sm">{companyName}</h4>
            <span className="text-xs text-gray-500">{users.length} user(s)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`px-6 py-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-3 transition-colors ${hasActiveUsers ? 'bg-blue-50/30' : 'bg-red-50/30'}`}>
      <div className="flex items-center gap-4">
        <div className={`p-2.5 rounded-xl shadow-sm ${hasActiveUsers ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-500'}`}>
          <Building2 size={20} />
        </div>
        <div>
          <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
            {companyName}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-bold border ${hasActiveUsers ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
              {hasActiveUsers ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
              {hasActiveUsers ? 'Active' : 'Inactive'}
            </span>
          </h4>
          <span className="text-xs text-gray-500 font-medium">{users.length} associated account(s)</span>
        </div>
      </div>
      <button
        onClick={handleBatchClick}
        disabled={isUpdating}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm
          ${targetStatus ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'} disabled:opacity-50`}
      >
        {isUpdating ? <Loader2 size={14} className="animate-spin" /> : targetStatus ? <Power size={14} /> : <PowerOff size={14} />}
        {targetStatus ? 'Activate Company' : 'Deactivate Company'}
      </button>
    </div>
  );
};

// ====================================================================
// USER TABLE ROW
// ====================================================================

export const UserTableRow: React.FC<{
  user: User;
  updatingUserId: number | null;
  onToggleStatus: (userId: number, currentStatus: boolean) => void;
  onEdit: (user: User) => void;
  isGroupInactive?: boolean;
}> = ({ user, updatingUserId, onToggleStatus, onEdit, isGroupInactive }) => {
  const isActionBlocked = isGroupInactive && !user.is_active;

  return (
    <tr
      className={`hover:bg-blue-50/30 transition-colors border-b border-gray-50 last:border-b-0 ${
        !user.is_active ? 'bg-gray-50/40 text-gray-500' : ''
      }`}
    >
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className={`font-semibold ${user.is_active ? 'text-gray-900' : 'text-gray-500'}`}>
            {user.full_name || user.username}
          </span>
          <span className="text-gray-400 text-xs">{user.email}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        {user.role === 'customer' && (user.company_name || user.customer_details) ? (
          <div className={`flex flex-col text-sm ${user.is_active ? 'text-gray-600' : 'text-gray-400'}`}>
            <div className="flex items-center font-medium">
              <Building2 size={13} className="mr-1.5 opacity-70" />
              {user.company_name || user.customer_details}
            </div>
            {user.location_name && (
              <div className="flex items-center text-[11px] mt-0.5 text-gray-400">
                <MapPin size={11} className="mr-1.5 opacity-60" />
                {user.location_name}
              </div>
            )}
          </div>
        ) : (
          <span className="text-gray-400 text-xs italic">N/A</span>
        )}
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize
            ${user.role === 'admin'    ? 'bg-purple-50 text-purple-700 border-purple-100' : ''}
            ${user.role === 'engineer' ? 'bg-orange-50 text-orange-700 border-orange-100' : ''}
            ${user.role === 'customer' ? 'bg-blue-50   text-blue-700   border-blue-100'   : ''}
            ${!user.is_active ? 'opacity-60 grayscale' : ''}
          `}
        >
          {user.role}
        </span>
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
            user.is_active
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(user)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition-all shadow-sm"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          <div className="relative inline-block group/tooltip">
            <button
              type="button"
              onClick={() => onToggleStatus(user.user_id, Boolean(user.is_active))}
              disabled={updatingUserId === user.user_id || isActionBlocked}
              className={`
                inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm
                ${isActionBlocked
                  ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                  : Boolean(user.is_active)
                  ? 'bg-white border border-red-200 text-red-600 hover:bg-red-50'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 border border-transparent'
                } disabled:opacity-70
              `}
            >
              {updatingUserId === user.user_id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isActionBlocked ? (
                <Lock className="w-3 h-3" />
              ) : Boolean(user.is_active) ? (
                <PowerOff className="w-3 h-3" />
              ) : (
                <Power className="w-3 h-3" />
              )}
              {Boolean(user.is_active) ? 'Deactivate' : 'Activate'}
            </button>
            {isActionBlocked && (
              <div className="absolute bottom-full right-0 mb-2 w-max px-2 py-1 bg-gray-800 text-white text-[10px] rounded shadow-md opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10">
                Activate Company First
                <div className="absolute top-full right-4 -mt-1 border-4 border-transparent border-t-gray-800" />
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
};

// ====================================================================
// USER MANAGEMENT SYSTEM
// ====================================================================

export const UserManagementSystem: React.FC<{
  users: User[];
  updatingUserId: number | null;
  onToggleStatus: (userId: number, currentStatus: boolean) => void;
  onRefreshData: () => void;
}> = ({ users, updatingUserId, onToggleStatus, onRefreshData }) => {
  const [activeFilter,    setActiveFilter]    = useState<UserFilterTab>('all');
  const [groupByCompany,  setGroupByCompany]  = useState(false);
  const [searchTerm,      setSearchTerm]      = useState('');
  const [updatingCompany, setUpdatingCompany] = useState<string | null>(null);
  const [editingUser,     setEditingUser]     = useState<User | null>(null);

  useEffect(() => { setSearchTerm(''); }, [activeFilter]);

  const handleBatchUpdate = async (companyName: string, newStatus: boolean) => {
    setUpdatingCompany(companyName);
    try {
      await api.post('/users/batch-status-by-customer', {
        customer_details: companyName, // Map to backward compatible field or updated endpoint requirement
        is_active: newStatus,
      });
      onRefreshData();
    } catch (error) {
      console.error('Batch update failed', error);
      alert('Failed to update company users.');
    } finally {
      setUpdatingCompany(null);
    }
  };

  const filteredUsers = users.filter((user) => {
    if (activeFilter !== 'all' && user.role !== activeFilter) return false;
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      return (
        (user.full_name || user.username).toLowerCase().includes(t) ||
        user.email.toLowerCase().includes(t) ||
        (user.company_name || user.customer_details || '').toLowerCase().includes(t)
      );
    }
    return true;
  });

  const groupedCustomers =
    activeFilter === 'customer' && groupByCompany
      ? filteredUsers.reduce((groups, user) => {
          const company = user.company_name || user.customer_details || 'Unassigned / Independent';
          if (!groups[company]) groups[company] = [];
          groups[company].push(user);
          return groups;
        }, {} as Record<string, User[]>)
      : null;

  const TabButton = ({
    id, label, icon, count,
  }: {
    id: UserFilterTab; label: string; icon: React.ReactNode; count: number;
  }) => (
    <button
      onClick={() => setActiveFilter(id)}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap
        ${activeFilter === id ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
    >
      {icon}
      {label}
      <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${activeFilter === id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
        {count}
      </span>
    </button>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full relative z-0">
      <EditUserModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={onRefreshData}
      />

      {/* Header + Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="p-6 pb-4">
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Users size={24} className="text-blue-600" />
            User Directory
          </h3>
          <p className="text-gray-500 text-sm mt-1">
            Manage system access for staff and clients.
          </p>
        </div>
        <div className="flex overflow-x-auto scrollbar-hide px-2">
          <TabButton id="all" label="All Users" icon={<Users size={16} />} count={users.length} />
          <TabButton id="admin" label="Administrators" icon={<Shield size={16} />} count={users.filter((u) => u.role === 'admin').length} />
          <TabButton id="engineer" label="Engineers" icon={<Wrench size={16} />} count={users.filter((u) => u.role === 'engineer').length} />
          <TabButton id="customer" label="Customers" icon={<Briefcase size={16} />} count={users.filter((u) => u.role === 'customer').length} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
            />
          </div>
        </div>
        {activeFilter === 'customer' && (
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:inline">
              {groupByCompany ? 'Grouped View' : 'List View'}
            </span>
            <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
              <button
                onClick={() => setGroupByCompany(false)}
                className={`p-1.5 rounded-md transition-all ${!groupByCompany ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                title="List View"
              >
                <AlignJustify size={18} />
              </button>
              <button
                onClick={() => setGroupByCompany(true)}
                className={`p-1.5 rounded-md transition-all ${groupByCompany ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                title="Group by Customer Details"
              >
                <Grid size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-white min-h-[400px]">
        {groupedCustomers ? (
          <div className="p-6 space-y-6">
            {Object.entries(groupedCustomers).map(([companyName, companyUsers], index) => {
              const isCompanyInactive = !companyUsers.some((u) => u.is_active);
              return (
                <div key={index} className={`border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${isCompanyInactive ? 'border-gray-200 bg-gray-50' : 'border-blue-100 bg-white'}`}>
                  <CompanyGroupHeader
                    companyName={companyName}
                    users={companyUsers}
                    onBatchUpdate={handleBatchUpdate}
                    isUpdating={updatingCompany === companyName}
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50/50 text-gray-400 border-b border-gray-100 uppercase font-semibold text-[10px] tracking-wider">
                        <tr>
                          <th className="px-6 py-3">User Profile</th>
                          <th className="px-6 py-3">Company / Location</th>
                          <th className="px-6 py-3">Role</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {companyUsers.map((u) => (
                          <UserTableRow
                            key={u.user_id}
                            user={u}
                            updatingUserId={updatingUserId}
                            onToggleStatus={onToggleStatus}
                            onEdit={(row) => setEditingUser(row)}
                            isGroupInactive={isCompanyInactive && companyName !== 'Unassigned / Independent'}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 uppercase font-semibold text-[10px] tracking-wider border-b">
              <tr>
                <th className="px-6 py-4">User Profile</th>
                <th className="px-6 py-4">Company / Location</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((u) => (
                  <UserTableRow
                    key={u.user_id}
                    user={u}
                    updatingUserId={updatingUserId}
                    onToggleStatus={onToggleStatus}
                    onEdit={(row) => setEditingUser(row)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <Filter size={24} className="text-gray-400 mb-2" />
                      <p className="font-medium">No users found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ====================================================================
// INVITE USERS SECTION (Dual Searchable Dropdowns + Sync Address)
// ====================================================================

export const InviteUsersSection: React.FC<{
  existingCustomers: Customer[];
}> = ({ existingCustomers }) => {
  const [email,         setEmail]         = useState('');
  const [role,          setRole]          = useState<UserRole>('customer');
  const [invitedName,   setInvitedName]   = useState('');
  
  const [companyName,   setCompanyName]   = useState('');
  const [locationName,  setLocationName]  = useState('');
  const [isCustomCompany, setIsCustomCompany] = useState(false); 
  
  const [shipToAddress, setShipToAddress] = useState('');
  const [billToAddress, setBillToAddress] = useState('');
  const [phoneNumber,   setPhoneNumber]   = useState('');
  const [sameAsShip,    setSameAsShip]    = useState(false);
  
  const [isInviting,    setIsInviting]    = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error'; text: string; } | null>(null);
  const [isCompanyModalOpen, setCompanyModalOpen] = useState(false);
  const [modalInitialCompany, setModalInitialCompany] = useState("");

  const isCustomerRole = role === 'customer';

  const uniqueCompanies = useMemo(() => {
    const names = existingCustomers.map(c => c.company_name || c.customer_details);
    return Array.from(new Set(names)).filter(Boolean).sort();
  }, [existingCustomers]);

  const filteredLocations = useMemo(() => {
    if (!companyName) return [];
    const branches = existingCustomers.filter(c => (c.company_name || c.customer_details) === companyName);
    const locNames = branches.map(c => c.location_name || "Main Office");
    return Array.from(new Set(locNames)).sort();
  }, [companyName, existingCustomers]);

  const handleResetOrg = () => {
    setCompanyName(''); setLocationName(''); setShipToAddress(''); setBillToAddress(''); 
    setPhoneNumber(''); setIsCustomCompany(false); setSameAsShip(false);
  };

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviteMessage(null);
    setIsInviting(true);
    try {
      const payload = {
        email, role, invited_name: invitedName,
        ...(isCustomerRole && {
          company_name: companyName.trim(),
          location_name: locationName === "Main Office" ? "" : locationName.trim(),
          ship_to_address: shipToAddress.trim(),
          bill_to_address: billToAddress.trim(),
          phone_number: phoneNumber.trim()
        })
      };
      const response = await api.post<InvitationResponse>(ENDPOINTS.INVITATIONS.SEND, payload);
      setInviteMessage({ type: 'success', text: response.data.message });
      setEmail(''); setInvitedName(''); handleResetOrg();
    } catch (error: any) {
      setInviteMessage({ type: 'error', text: error.response?.data?.detail || 'Invitation failed.' });
    } finally { setIsInviting(false); }
  };

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white border border-gray-100 rounded-2xl shadow-lg">
      <CompanyEntryModal 
        isOpen={isCompanyModalOpen} 
        onClose={() => setCompanyModalOpen(false)} 
        initialCompanyName={modalInitialCompany}
        onConfirm={(c, l) => {
          setCompanyName(c); setLocationName(l); setIsCustomCompany(true); 
          setCompanyModalOpen(false); setShipToAddress(''); setBillToAddress(''); setPhoneNumber('');
        }} 
      />

      <h2 className="text-2xl font-bold text-gray-800 flex items-center mb-6">
        <div className="p-2 bg-blue-100 rounded-lg mr-3"><UserPlus className="w-6 h-6 text-blue-600" /></div>
        Invite New System User
      </h2>

      <form onSubmit={handleInvite} className="space-y-5">
        {inviteMessage && <div className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${inviteMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}><Info size={18}/> {inviteMessage.text}</div>}
        
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Select User Role</label>
          <select value={role} onChange={(e) => { setRole(e.target.value as UserRole); handleResetOrg(); }} className="w-full border rounded-xl px-4 py-2.5 bg-gray-50 focus:bg-white shadow-sm transition-all outline-none focus:ring-2 focus:ring-blue-500">
            <option value="customer">Customer (External)</option>
            <option value="engineer">Engineer (Internal)</option>
            <option value="admin">Administrator (Internal)</option>
          </select>
        </div>

        {isCustomerRole && (
          <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-4">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2"><Building2 size={14} /> Organization Context</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isCustomCompany ? (
                <div className="col-span-2 flex items-center gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div className="bg-blue-100 border border-blue-200 rounded-xl px-4 py-2 text-blue-900 font-bold text-sm shadow-inner truncate">{companyName}</div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-blue-700 font-medium text-sm shadow-inner truncate">{locationName}</div>
                  </div>
                  <button type="button" onClick={handleResetOrg} className="p-2.5 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-xl shadow-sm transition-all"><X size={18} /></button>
                </div>
              ) : (
                <>
                  <SearchableSelect 
                    label="1. Select Company" 
                    options={uniqueCompanies} 
                    value={companyName} 
                    placeholder="Search/Select Company..."
                    onChange={(val) => { setCompanyName(val); setLocationName(''); setShipToAddress(''); setBillToAddress(''); }}
                    onAddNew={() => { setModalInitialCompany(""); setCompanyModalOpen(true); }}
                    addNewLabel="Register New Company"
                  />
                  <SearchableSelect 
                    label="2. Select Location" 
                    options={filteredLocations} 
                    value={locationName} 
                    placeholder="Choose branch..."
                    disabled={!companyName}
                    onChange={(val) => {
                      setLocationName(val);
                      const record = existingCustomers.find(c => (c.company_name || c.customer_details) === companyName && (c.location_name === val || (!c.location_name && val === "Main Office")));
                      if (record) {
                        setShipToAddress(record.ship_to_address || '');
                        setBillToAddress(record.bill_to_address || record.ship_to_address || '');
                        setPhoneNumber(record.phone || '');
                        if (record.ship_to_address === record.bill_to_address) setSameAsShip(true);
                      }
                    }}
                    onAddNew={() => { setModalInitialCompany(companyName); setCompanyModalOpen(true); }}
                    addNewLabel={`Add new site to ${companyName}`}
                  />
                </>
              )}
            </div>

            {locationName && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ship-To Address</label>
                  <textarea rows={2} value={shipToAddress} onChange={(e) => { setShipToAddress(e.target.value); if (sameAsShip) setBillToAddress(e.target.value); }} required className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Branch shipping address..." />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-700">Bill-To Address</label>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 cursor-pointer bg-white px-2 py-0.5 rounded-full border border-blue-100 hover:bg-blue-50 transition-all">
                      <input type="checkbox" checked={sameAsShip} onChange={(e) => { setSameAsShip(e.target.checked); if (e.target.checked) setBillToAddress(shipToAddress); }} className="rounded text-blue-600 w-3 h-3 focus:ring-0" />
                      Same as Ship
                    </label>
                  </div>
                  <textarea rows={2} value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} disabled={sameAsShip} required className={`w-full border border-gray-300 rounded-xl px-4 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none ${sameAsShip ? 'bg-gray-50 opacity-70' : ''}`} placeholder="Branch billing address..." />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><UserCog size={14} /> Personal Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label><input type="text" value={invitedName} onChange={(e) => setInvitedName(e.target.value)} required className="w-full border rounded-xl px-4 py-2.5 shadow-sm outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full border rounded-xl px-4 py-2.5 shadow-sm outline-none focus:ring-2 focus:ring-blue-500" /></div>
            {isCustomerRole && (
              <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label><input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required className="w-full border rounded-xl px-4 py-2.5 shadow-sm outline-none focus:ring-2 focus:ring-blue-500" /></div>
            )}
          </div>
        </div>

        <button type="submit" disabled={isInviting || (isCustomerRole && (!companyName || !locationName))} className="w-full flex justify-center items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none">
          {isInviting ? <Loader2 className="animate-spin mr-2" /> : <UserPlus className="mr-2" />}
          {isInviting ? 'Sending...' : 'Send Invitation'}
        </button>
      </form>
    </div>
  );
};