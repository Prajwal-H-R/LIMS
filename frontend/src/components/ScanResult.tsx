import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/config'; // ✅ FIXED: Importing correctly from your config file
import { 
  ArrowLeft, Loader2, Package, FileText, 
  Briefcase, Award, Phone, MapPin 
} from 'lucide-react';

// --- Types Definition (Included here to fix "Cannot find module" error) ---
export interface ScanResultType {
  device_info: {
    srf_number: string;
    inward_date: string;
    dc_number: string | null;
    dc_date: string | null;
    nepl_id: string;
  };
  customer_info: {
    company_name: string;
    contact_person: string | null;
    phone: string | null;
    address: string;
  };
  equipment: {
    id: string;
    description: string;
    make: string;
    model: string;
    range: string;
    serial_no: string;
    qty: number;
    supplier: string;
    in_dc: string;
    out_dc: string;
    calib_by: string;
    visual_status: string;
    eng_remarks: string | null;
    cust_remarks: string | null;
  };
  status_flow: {
    inward: boolean;
    srf: boolean;
    job: boolean;
    certificate: boolean;
  };
}

export const ScanResult = () => {
  const { id } = useParams<{ id: string }>(); // This captures the ID from URL (e.g. /scan-result/NEPL26001)
  const navigate = useNavigate();
  
  const [data, setData] = useState<ScanResultType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // ✅ API Call: Using your configured axios instance
        // Ensure your backend route matches this path: /scan/{id} or /equipment/scan/{id}
        const response = await api.get<ScanResultType>(`/scan/${id}`);
        
        setData(response.data);
      } catch (err: any) {
        console.error("Scan fetch error:", err);
        setError("Equipment details not found or server error.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // --- Loading State ---
  if (loading) return (
    <div className="flex h-screen justify-center items-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <span className="text-gray-500 font-medium">Fetching Equipment Details...</span>
      </div>
    </div>
  );

  // --- Error State ---
  if (error || !data) return (
    <div className="flex flex-col h-screen justify-center items-center bg-gray-50 p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg border border-red-100 text-center max-w-md">
        <div className="text-red-500 mb-4 flex justify-center">
          <Package size={48} />
        </div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">Scan Failed</h3>
        <p className="text-gray-500 mb-6">{error || "No data returned for this ID."}</p>
        <button 
          onClick={() => navigate(-1)} 
          className="px-6 py-2.5 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-700 transition shadow-lg shadow-gray-200"
        >
          Go Back to Scanner
        </button>
      </div>
    </div>
  );

  // --- Success State (Render UI) ---
  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      {/* --- HEADER --- */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-blue-50 p-3 rounded-xl hidden sm:block">
            {/* Custom Barcode Icon */}
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="5" x2="21" y2="5"></line><line x1="3" y1="19" x2="21" y2="19"></line><rect x="5" y="9" width="14" height="6"></rect></svg>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Equipment Details</h1>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-1">
              REFERENCE SRF : <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{data.device_info.srf_number}</span>
            </p>
          </div>
        </div>
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm whitespace-nowrap"
        >
          <ArrowLeft size={18} /> Back to Scan
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* --- DEVICE INFO CARD --- */}
        <div className="bg-white rounded-xl shadow-sm p-6 lg:p-8 border border-gray-100 h-full">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-100 pb-3">
            Device Information
          </h3>
          <div className="space-y-4">
            <InfoRow label="SRF NUMBER:" value={data.device_info.srf_number} isBold />
            <InfoRow label="INWARD DATE:" value={data.device_info.inward_date} isBold />
            <InfoRow label="DC NUMBER:" value={data.device_info.dc_number || '-'} isBold />
            <InfoRow label="DC DATE:" value={data.device_info.dc_date || '-'} isBold />
          </div>
        </div>

        {/* --- CUSTOMER INFO CARD --- */}
        <div className="bg-white rounded-xl shadow-sm p-6 lg:p-8 border border-gray-100 h-full">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-100 pb-3">
            Customer Information
          </h3>
          <h2 className="text-xl font-bold text-gray-800 mb-4">{data.customer_info.company_name}</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3 group">
              <div className="p-2 bg-blue-50 rounded-full text-blue-500 group-hover:bg-blue-100 transition">
                <Phone size={16} />
              </div>
              <span className="text-sm font-medium text-gray-600">
                {data.customer_info.contact_person} 
                {data.customer_info.phone && <span className="text-gray-400 mx-2">|</span>} 
                {data.customer_info.phone}
              </span>
            </div>
            <div className="flex items-start gap-3 group">
              <div className="p-2 bg-blue-50 rounded-full text-blue-500 mt-0.5 group-hover:bg-blue-100 transition">
                <MapPin size={16} />
              </div>
              <span className="text-sm font-medium text-gray-600 leading-relaxed max-w-md">
                {data.customer_info.address}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* --- EQUIPMENT TABLE --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#2c7bb6] text-white uppercase text-xs tracking-wider">
              <tr>
                {[
                  'S.NO', 'ID', 'DESCRIPTION', 'MAKE', 'MODEL', 'RANGE', 'SERIAL', 
                  'QTY', 'SUPPLIER', 'IN DC', 'OUT DC', 'CALIB BY', 
                  'REF', 'ACC.', 'VISUAL', 'ENG REM', 'CUST REM'
                ].map(header => (
                  <th key={header} className="px-4 py-4 font-bold whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="hover:bg-blue-50/30 transition-colors group">
                <td className="px-4 py-4 font-medium text-gray-900">1</td>
                <td className="px-4 py-4 font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{data.equipment.id}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap max-w-xs truncate" title={data.equipment.description}>
                  {data.equipment.description}
                </td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{data.equipment.make}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{data.equipment.model}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{data.equipment.range}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{data.equipment.serial_no}</td>
                <td className="px-4 py-4 text-gray-600">{data.equipment.qty}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{data.equipment.supplier}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{data.equipment.in_dc}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{data.equipment.out_dc}</td>
                <td className="px-4 py-4 text-gray-600 whitespace-nowrap">{data.equipment.calib_by}</td>
                <td className="px-4 py-4 text-gray-400">-</td>
                <td className="px-4 py-4 text-gray-400">-</td>
                <td className={`px-4 py-4 font-bold whitespace-nowrap ${
                  data.equipment.visual_status.toLowerCase().includes('not') 
                    ? 'text-red-500' 
                    : 'text-green-600'
                }`}>
                  {data.equipment.visual_status}
                </td>
                <td className="px-4 py-4 text-gray-400 italic text-xs whitespace-nowrap">
                  {data.equipment.eng_remarks || 'none'}
                </td>
                <td className="px-4 py-4 text-gray-400 italic text-xs whitespace-nowrap">
                  {data.equipment.cust_remarks || '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* --- STATUS CARDS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard 
          title="INWARD" 
          active={data.status_flow.inward} 
          icon={<Package size={32} />} 
          color="bg-blue-600" 
        />
        <StatusCard 
          title="SRF" 
          active={data.status_flow.srf} 
          icon={<FileText size={32} />} 
          color="bg-emerald-500" 
        />
        <StatusCard 
          title="JOB" 
          active={data.status_flow.job} 
          icon={<Briefcase size={32} />} 
          color="bg-orange-500" 
        />
        <StatusCard 
          title="CERTIFICATE" 
          active={data.status_flow.certificate} 
          icon={<Award size={32} />} 
          color="bg-purple-600" 
        />
      </div>
    </div>
  );
};

// --- Helper Components (Defined locally to keep file self-contained) ---

const InfoRow = ({ label, value, isBold }: { label: string, value: string, isBold?: boolean }) => (
  <div className="flex items-baseline gap-2">
    <span className="w-32 text-xs font-bold text-blue-500 uppercase flex-shrink-0 tracking-wide">{label}</span>
    <span className={`text-sm text-gray-800 break-words flex-1 ${isBold ? 'font-bold' : 'font-medium'}`}>
      {value}
    </span>
  </div>
);

const StatusCard = ({ title, active, icon, color }: { title: string, active: boolean, icon: React.ReactNode, color: string }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center h-48 transition-all duration-300 ${active ? 'hover:shadow-md hover:-translate-y-1' : 'opacity-70'}`}>
    <div className={`p-5 rounded-2xl mb-4 text-white shadow-lg transition-colors duration-500 ${active ? color : 'bg-gray-300 shadow-none'}`}>
      {icon}
    </div>
    <span className={`text-xs font-extrabold tracking-widest uppercase ${active ? 'text-gray-800' : 'text-gray-400'}`}>
      {title}
    </span>
  </div>
);