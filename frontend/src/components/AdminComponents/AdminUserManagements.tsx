// frontend/src/components/AdminComponents/AdminUserManagement.tsx

import React, { useState, useEffect, FormEvent } from 'react';
import {
  Shield, Power, PowerOff, UserPlus, Users, Info, Loader2,
  Settings, ChevronLeft, AlertCircle, X, Search,
  Filter, Briefcase, Wrench, Building2, Grid, AlignJustify,
  Lock, CheckCircle2, XCircle, ChevronDown, UserCog,
  Pencil, Thermometer, ArrowRight, AlertTriangle,
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
  customer_details?: string;
  contact_person?: string | null;
  phone?: string | null;
  ship_to_address?: string | null;
  bill_to_address?: string | null;
}

export interface Customer {
  customer_id: number;
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
// COMPANY ENTRY MODAL
// ====================================================================

interface CompanyEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

const CompanyEntryModal: React.FC<CompanyEntryModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [tempName, setTempName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      onConfirm(tempName.trim());
      setTempName('');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100">
        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="text-blue-600" size={20} />
            Enter New Company
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Name (Customer Details)
            </label>
            <input
              autoFocus
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="e.g. Acme Industries Ltd."
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
            <p className="text-xs text-gray-500 mt-2">
              This will create a new customer record in the database upon invitation.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!tempName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Confirm Name
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const [shipTo,         setShipTo]         = useState('');
  const [billTo,         setBillTo]         = useState('');
  const [saving,         setSaving]         = useState(false);
  const [formError,      setFormError]      = useState<string | null>(null);

  const isCustomerLinked =
    Boolean(user?.customer_id) && user?.role === 'customer';

  useEffect(() => {
    if (!user) return;
    setEmail(user.email || '');
    setFullName(user.full_name || '');
    setUsername(user.username || '');
    setContactPerson(user.contact_person || '');
    setPhone(user.phone || '');
    setCompanyName(user.customer_details || '');
    setShipTo(user.ship_to_address || '');
    setBillTo(user.bill_to_address || '');
    setFormError(null);
  }, [user]);

  if (!user) return null;

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
        payload.customer_details = companyName.trim();
        payload.ship_to_address  = shipTo.trim();
        payload.bill_to_address  = billTo.trim();
      }
      await api.put(ENDPOINTS.USERS.UPDATE(user.user_id), payload);
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } })
              .response?.data?.detail
          : null;
      setFormError(typeof msg === 'string' ? msg : 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center z-10">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Pencil className="text-blue-600" size={20} />
            Edit user
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
          >
            <X size={22} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}
          <p className="text-xs text-gray-500">
            User ID {user.user_id} · {user.role}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {isCustomerLinked && (
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Customer organization
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Company / organization
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Contact person
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Ship-to address
                </label>
                <textarea
                  required
                  rows={2}
                  value={shipTo}
                  onChange={(e) => setShipTo(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y min-h-[60px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Bill-to address
                </label>
                <textarea
                  required
                  rows={2}
                  value={billTo}
                  onChange={(e) => setBillTo(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-y min-h-[60px]"
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save changes
            </button>
          </div>
        </form>
      </div>
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
          <span
            className={`font-semibold ${
              user.is_active ? 'text-gray-900' : 'text-gray-500'
            }`}
          >
            {user.full_name || user.username}
          </span>
          <span className="text-gray-400 text-xs">{user.email}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        {user.role === 'customer' && user.customer_details ? (
          <div
            className={`flex items-center text-sm ${
              user.is_active ? 'text-gray-600' : 'text-gray-400'
            }`}
          >
            <Building2 size={14} className="mr-2 opacity-70" />
            {user.customer_details}
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
    if (
      window.confirm(
        `Are you sure you want to ${action} all ${users.length} users in ${companyName}?`
      )
    ) {
      onBatchUpdate(companyName, targetStatus);
    }
  };

  if (companyName === 'Unassigned / Independent') {
    return (
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-gray-200 p-2 rounded-lg text-gray-500">
            <Users size={18} />
          </div>
          <div>
            <h4 className="font-bold text-gray-800 text-sm">{companyName}</h4>
            <span className="text-xs text-gray-500">{users.length} user(s)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`px-6 py-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-3 transition-colors ${
        hasActiveUsers ? 'bg-blue-50/30' : 'bg-red-50/30'
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`p-2.5 rounded-xl shadow-sm ${
            hasActiveUsers
              ? 'bg-blue-100 text-blue-600'
              : 'bg-red-100 text-red-500'
          }`}
        >
          <Building2 size={20} />
        </div>
        <div>
          <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
            {companyName}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-bold border ${
                hasActiveUsers
                  ? 'bg-green-100 text-green-700 border-green-200'
                  : 'bg-red-100 text-red-700 border-red-200'
              }`}
            >
              {hasActiveUsers ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
              {hasActiveUsers ? 'Active' : 'Inactive'}
            </span>
          </h4>
          <span className="text-xs text-gray-500 font-medium">
            {users.length} associated account(s)
          </span>
        </div>
      </div>
      <button
        onClick={handleBatchClick}
        disabled={isUpdating}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm
          ${targetStatus
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : 'bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300'
          } disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {isUpdating ? (
          <Loader2 size={14} className="animate-spin" />
        ) : targetStatus ? (
          <Power size={14} />
        ) : (
          <PowerOff size={14} />
        )}
        {targetStatus ? 'Activate Company' : 'Deactivate Company'}
      </button>
    </div>
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
        customer_details: companyName,
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
        (user.customer_details || '').toLowerCase().includes(t)
      );
    }
    return true;
  });

  const groupedCustomers =
    activeFilter === 'customer' && groupByCompany
      ? filteredUsers.reduce((groups, user) => {
          const company =
            user.customer_details || 'Unassigned / Independent';
          if (!groups[company]) groups[company] = [];
          groups[company].push(user);
          return groups;
        }, {} as Record<string, User[]>)
      : null;

  const TabButton = ({
    id,
    label,
    icon,
    count,
  }: {
    id: UserFilterTab;
    label: string;
    icon: React.ReactNode;
    count: number;
  }) => (
    <button
      onClick={() => setActiveFilter(id)}
      className={`
        flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap
        ${activeFilter === id
          ? 'border-blue-600 text-blue-600 bg-blue-50/50'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
        }
      `}
    >
      {icon}
      {label}
      <span
        className={`ml-1 text-xs px-2 py-0.5 rounded-full ${
          activeFilter === id
            ? 'bg-blue-100 text-blue-700'
            : 'bg-gray-100 text-gray-600'
        }`}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
      <EditUserModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={onRefreshData}
      />

      {/* ── Header + Tabs ── */}
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
          <TabButton
            id="all"
            label="All Users"
            icon={<Users size={16} />}
            count={users.length}
          />
          <TabButton
            id="admin"
            label="Administrators"
            icon={<Shield size={16} />}
            count={users.filter((u) => u.role === 'admin').length}
          />
          <TabButton
            id="engineer"
            label="Engineers"
            icon={<Wrench size={16} />}
            count={users.filter((u) => u.role === 'engineer').length}
          />
          <TabButton
            id="customer"
            label="Customers"
            icon={<Briefcase size={16} />}
            count={users.filter((u) => u.role === 'customer').length}
          />
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder={
                activeFilter === 'customer'
                  ? 'Search Company or User...'
                  : 'Search Users...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
            />
          </div>
          <div className="relative hidden sm:block">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
              <Filter size={16} />
            </div>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as UserFilterTab)}
              className="pl-10 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer shadow-sm hover:border-gray-400 transition-colors"
            >
              <option value="all">All Roles</option>
              <option value="admin">Administrators</option>
              <option value="engineer">Engineers</option>
              <option value="customer">Customers</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-gray-500">
              <ChevronDown size={14} />
            </div>
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
                className={`p-1.5 rounded-md transition-all ${
                  !groupByCompany
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="List View"
              >
                <AlignJustify size={18} />
              </button>
              <button
                onClick={() => setGroupByCompany(true)}
                className={`p-1.5 rounded-md transition-all ${
                  groupByCompany
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="Group by Customer Details"
              >
                <Grid size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Table Body ── */}
      <div className="flex-1 overflow-auto bg-white min-h-[400px]">
        {groupedCustomers ? (
          <div className="p-6 space-y-6">
            {Object.entries(groupedCustomers).map(
              ([companyName, companyUsers], index) => {
                const isCompanyInactive = !companyUsers.some((u) => u.is_active);
                return (
                  <div
                    key={index}
                    className={`border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
                      isCompanyInactive
                        ? 'border-gray-200 bg-gray-50'
                        : 'border-blue-100 bg-white'
                    }`}
                  >
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
                            <th className="px-6 py-3">User</th>
                            <th className="px-6 py-3">Company Details</th>
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
                              isGroupInactive={
                                isCompanyInactive &&
                                companyName !== 'Unassigned / Independent'
                              }
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase font-semibold text-xs border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">User Profile</th>
                  <th className="px-6 py-4">Company / Details</th>
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
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <Filter size={24} className="text-gray-400 mb-2" />
                        <p className="font-medium">No users found</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ====================================================================
// INVITE USERS SECTION
// ====================================================================

export const InviteUsersSection: React.FC<{
  existingCustomers: Customer[];
}> = ({ existingCustomers }) => {
  const [email,         setEmail]         = useState('');
  const [role,          setRole]          = useState<UserRole>('customer');
  const [invitedName,   setInvitedName]   = useState('');
  const [companyName,   setCompanyName]   = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [billToAddress, setBillToAddress] = useState('');
  const [sameAsShip,    setSameAsShip]    = useState(false);
  const [phoneNumber,   setPhoneNumber]   = useState('');
  const [isInviting,    setIsInviting]    = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isCompanyModalOpen, setCompanyModalOpen] = useState(false);
  const [isCustomCompany,    setIsCustomCompany]  = useState(false);

  const isCustomerRole = role === 'customer';

  const handleSameAsShipChange = (checked: boolean) => {
    setSameAsShip(checked);
    if (checked) setBillToAddress(shipToAddress);
  };

  const handleCompanySelectChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const val = e.target.value;
    if (val === '__NEW_COMPANY_TRIGGER__') {
      setCompanyModalOpen(true);
      setCompanyName('');
      setShipToAddress('');
      setBillToAddress('');
    } else {
      setCompanyName(val);
      setIsCustomCompany(false);
      const selected = existingCustomers.find(
        (c) => c.customer_details === val
      );
      if (selected) {
        setShipToAddress(selected.ship_to_address || '');
        setBillToAddress(
          selected.bill_to_address || selected.ship_to_address || ''
        );
      }
    }
  };

  const handleNewCompanyConfirm = (name: string) => {
    setCompanyName(name);
    setIsCustomCompany(true);
    setCompanyModalOpen(false);
    setShipToAddress('');
    setBillToAddress('');
  };

  const handleResetCompany = () => {
    setCompanyName('');
    setIsCustomCompany(false);
    setShipToAddress('');
    setBillToAddress('');
  };

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviteMessage(null);
    setIsInviting(true);
    try {
      let payload: any = { email, role };
      if (isCustomerRole) {
        payload = {
          ...payload,
          company_name:    companyName.trim(),
          ship_to_address: shipToAddress.trim(),
          bill_to_address: billToAddress.trim(),
          invited_name:    invitedName.trim(),
          phone_number:    phoneNumber.trim(),
        };
      } else {
        payload = { ...payload, invited_name: invitedName.trim() };
      }
      const response = await api.post<InvitationResponse>(
        ENDPOINTS.INVITATIONS.SEND,
        payload
      );
      setInviteMessage({
        type: 'success',
        text: response.data.message || `Invitation sent successfully to ${email}!`,
      });
      setEmail('');
      setRole('customer');
      setInvitedName('');
      setCompanyName('');
      setShipToAddress('');
      setBillToAddress('');
      setSameAsShip(false);
      setPhoneNumber('');
      setIsCustomCompany(false);
    } catch (error: any) {
      setInviteMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to send invitation.',
      });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white border border-gray-100 rounded-2xl shadow-lg">
      <CompanyEntryModal
        isOpen={isCompanyModalOpen}
        onClose={() => setCompanyModalOpen(false)}
        onConfirm={handleNewCompanyConfirm}
      />
      <h2 className="text-2xl font-bold text-gray-800 flex items-center mb-6">
        <div className="p-2 bg-blue-100 rounded-lg mr-3">
          <UserPlus className="w-6 h-6 text-blue-600" />
        </div>
        Invite New System User
      </h2>
      <form onSubmit={handleInvite} className="space-y-5">
        {inviteMessage && (
          <div
            className={`p-4 rounded-xl text-sm font-medium flex items-center ${
              inviteMessage.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            <Info size={16} className="mr-2" />
            {inviteMessage.text}
          </div>
        )}
        <div className="grid grid-cols-1 gap-5">
          {/* Role */}
          <div>
            <label
              htmlFor="role"
              className="block text-sm font-semibold text-gray-700 mb-1"
            >
              Assign Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              required
              disabled={isInviting}
              className="w-full border border-gray-300 rounded-xl shadow-sm px-4 py-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            >
              <option value="customer">Customer</option>
              <option value="engineer">Engineer</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Non-customer fields */}
          {!isCustomerRole && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={invitedName}
                  onChange={(e) => setInvitedName(e.target.value)}
                  required
                  disabled={isInviting}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isInviting}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>
          )}

          {/* Customer-specific fields */}
          {isCustomerRole && (
            <>
              {/* Company Details */}
              <div className="p-5 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Company Details
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name
                  </label>
                  {isCustomCompany ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 font-medium">
                        {companyName}
                      </div>
                      <button
                        type="button"
                        onClick={handleResetCompany}
                        className="px-3 py-2.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={companyName}
                        onChange={handleCompanySelectChange}
                        required={isCustomerRole}
                        disabled={isInviting}
                        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all appearance-none bg-white"
                      >
                        <option value="" disabled>
                          Select an existing company...
                        </option>
                        <option
                          value="__NEW_COMPANY_TRIGGER__"
                          className="font-bold text-blue-600 bg-blue-50"
                        >
                          + Add New Company
                        </option>
                        <option disabled>────────────────────</option>
                        {existingCustomers.map((c, idx) => (
                          <option key={idx} value={c.customer_details}>
                            {c.customer_details}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500">
                        <ChevronLeft size={16} className="-rotate-90" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ship To Address
                    </label>
                    <textarea
                      rows={3}
                      value={shipToAddress}
                      onChange={(e) => {
                        setShipToAddress(e.target.value);
                        if (sameAsShip) setBillToAddress(e.target.value);
                      }}
                      required={isCustomerRole}
                      disabled={isInviting}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-gray-700">
                        Bill To Address
                      </label>
                      <label className="text-xs flex items-center cursor-pointer text-gray-600">
                        <input
                          type="checkbox"
                          checked={sameAsShip}
                          onChange={(e) =>
                            handleSameAsShipChange(e.target.checked)
                          }
                          className="mr-1 rounded text-blue-600 focus:ring-blue-500"
                        />
                        Same as Ship
                      </label>
                    </div>
                    <textarea
                      rows={3}
                      value={billToAddress}
                      onChange={(e) => setBillToAddress(e.target.value)}
                      required={isCustomerRole}
                      disabled={isInviting || sameAsShip}
                      className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all resize-none ${
                        sameAsShip ? 'bg-gray-100 text-gray-500' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Contact Person */}
              <div className="p-5 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Contact Person
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={invitedName}
                      onChange={(e) => setInvitedName(e.target.value)}
                      required={isCustomerRole}
                      disabled={isInviting}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      required={isCustomerRole}
                      disabled={isInviting}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required={isCustomerRole}
                    disabled={isInviting}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={isInviting}
          className="w-full flex justify-center items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isInviting ? (
            <Loader2 className="animate-spin mr-2" size={20} />
          ) : (
            <UserPlus className="mr-2" size={20} />
          )}
          {isInviting ? 'Sending Invitation...' : 'Send Invitation'}
        </button>
      </form>
    </div>
  );
};