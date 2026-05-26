// frontend/src/components/AdminComponents/AdminDashboardHome.tsx

import React from 'react';
import {
  Shield, PowerOff, Users, Activity,
  UserPlus, UserCog, Ruler, Thermometer,
  Building2, Award, AlertTriangle, XCircle,
  ArrowRight,
} from 'lucide-react';

// ====================================================================
// HELPERS
// ====================================================================

export const formatTableName = (tableName: string) =>
  tableName
    .replace('htw_', '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// ====================================================================
// STAT CARD
// ====================================================================

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  description: string;
  gradient: string;
  bgGradient: string;
}> = ({ icon, label, value, description, gradient, bgGradient }) => (
  <div className="relative bg-white rounded-2xl p-8 shadow-lg border border-gray-100 hover:shadow-xl group transition-all duration-300">
    <div
      className={`absolute inset-0 bg-gradient-to-r ${bgGradient} opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl`}
    />
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-6">
        <div
          className={`p-4 bg-gradient-to-r ${gradient} rounded-xl text-white shadow-lg`}
        >
          {icon}
        </div>
        <div className="text-4xl font-bold text-gray-900 group-hover:text-gray-800 transition-colors">
          {value}
        </div>
      </div>
      <div>
        <h3 className="text-xl font-semibold text-gray-900">{label}</h3>
        <p className="text-gray-500 group-hover:text-gray-700 text-sm font-medium mt-1">
          {description}
        </p>
      </div>
    </div>
  </div>
);

// ====================================================================
// ACTION BUTTON
// ====================================================================

const ActionButton: React.FC<{
  color: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ color, label, description, icon, onClick }) => (
  <button
    onClick={onClick}
    className="relative group bg-white border border-gray-100 rounded-xl p-6 hover:shadow-lg text-left transition-all duration-300 hover:-translate-y-1"
  >
    <div
      className={`inline-flex p-3 bg-gradient-to-r ${color} rounded-xl text-white mb-4 shadow-md`}
    >
      {icon}
    </div>
    <h3 className="font-semibold text-lg text-gray-800">{label}</h3>
    <p className="text-sm text-gray-500 mt-2">{description}</p>
  </button>
);

// ====================================================================
// EXPIRED TABLES BANNER
// ====================================================================

const ExpiredTablesBanner: React.FC<{
  expiredTables: string[];
  onNavigate: (section: string) => void;
}> = ({ expiredTables, onNavigate }) => {
  if (expiredTables.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm animate-slideUp">
      <div className="flex items-start gap-4">
        <div className="p-2.5 bg-amber-100 rounded-lg text-amber-600 shrink-0 mt-1 shadow-sm">
          <AlertTriangle size={24} />
        </div>
        <div className="flex-1 pr-6">
          <h3 className="text-amber-900 font-bold text-lg flex items-center gap-2">
            Calibration Records Expired
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200 shadow-sm">
              Deactivated
            </span>
          </h3>
          <p className="text-amber-800 text-sm mt-2 leading-relaxed">
            Records in the following tables have expired dates (valid_upto &lt;
            today). Please update the dates or remove the records in Master
            Standards.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {expiredTables.map((table) => (
              <span
                key={table}
                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-amber-200 text-amber-800 shadow-sm hover:bg-amber-50 cursor-default transition-colors"
              >
                <XCircle size={12} className="mr-1.5 text-red-500" />
                {formatTableName(table)}
              </span>
            ))}
          </div>
          <div className="mt-6">
            <button
              onClick={() => onNavigate('master-standard')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all"
            >
              Review &amp; Fix Master Standards <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ====================================================================
// ADMIN DASHBOARD HOME (main export)
// ====================================================================

export interface User {
  user_id: number;
  role: string;
  is_active: boolean;
  full_name?: string;
  username?: string;
}

export interface AdminDashboardHomeProps {
  users: User[];
  expiredTables: string[];
  onNavigate: (section: string) => void;
}

export const AdminDashboardHome: React.FC<AdminDashboardHomeProps> = ({
  users,
  onNavigate,
  expiredTables,
}) => {
  const totalUsers    = users.length;
  const activeUsers   = users.filter((u) => u.is_active).length;
  const inactiveUsers = totalUsers - activeUsers;
  const adminCount    = users.filter((u) => u.role === 'admin').length;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* ── Page Title ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-gray-900 flex items-center gap-3">
            <Shield className="w-10 h-10 text-blue-600" />
            Admin Portal
          </h1>
          <p className="text-lg text-gray-500 mt-2">
            System overview and management controls.
          </p>
        </div>
      </div>

      {/* ── Expiry Banner ── */}
      <ExpiredTablesBanner
        expiredTables={expiredTables}
        onNavigate={onNavigate}
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <StatCard
          icon={<Users className="w-10 h-10" />}
          label="Total Users"
          value={totalUsers}
          description={`${adminCount} Administrator(s)`}
          gradient="from-blue-500 to-indigo-600"
          bgGradient="from-blue-50 to-indigo-50"
        />
        <StatCard
          icon={<Activity className="w-10 h-10" />}
          label="Active Accounts"
          value={activeUsers}
          description="Currently enabled"
          gradient="from-emerald-500 to-green-600"
          bgGradient="from-emerald-50 to-green-50"
        />
        <StatCard
          icon={<PowerOff className="w-10 h-10" />}
          label="Inactive Accounts"
          value={inactiveUsers}
          description="Disabled or suspended"
          gradient="from-orange-500 to-red-600"
          bgGradient="from-orange-50 to-red-50"
        />
      </div>

      {/* ── Quick Actions ── */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-8 py-6 bg-gradient-to-r from-gray-900 to-gray-800">
          <h2 className="text-2xl font-bold text-white">
            Administrative Actions
          </h2>
          <p className="text-gray-400 mt-1">Common tasks and configurations</p>
        </div>
        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <ActionButton
            color="from-blue-500 to-cyan-500"
            label="Invite New User"
            description="Send email invitations to staff or customers."
            icon={<UserPlus className="h-8 w-8" />}
            onClick={() => onNavigate('invite-users')}
          />
          <ActionButton
            color="from-purple-500 to-violet-500"
            label="Manage Users"
            description="View directory, toggle access, or update roles."
            icon={<UserCog className="h-8 w-8" />}
            onClick={() => onNavigate('users')}
          />
          <ActionButton
            color="from-pink-500 to-rose-500"
            label="Master Standards"
            description="Configure calibration standards and references."
            icon={<Ruler className="h-8 w-8" />}
            onClick={() => onNavigate('master-standard')}
          />
          <ActionButton
            color="from-teal-500 to-emerald-500"
            label="Environment Ranges"
            description="Set temperature and humidity limits."
            icon={<Thermometer className="h-8 w-8" />}
            onClick={() => onNavigate('htw-environment')}
          />
          <ActionButton
            color="from-indigo-500 to-indigo-600"
            label="Laboratory Scope"
            description="Manage scope of accreditation parameters."
            icon={<Building2 className="h-8 w-8" />}
            onClick={() => onNavigate('laboratory-scope')}
          />
          <ActionButton
            color="from-amber-500 to-orange-500"
            label="Certificate Approval"
            description="Approve and issue calibration certificates."
            icon={<Award className="h-8 w-8" />}
            onClick={() => onNavigate('certificate-approval')}
          />
        </div>
      </div>
    </div>
  );
};