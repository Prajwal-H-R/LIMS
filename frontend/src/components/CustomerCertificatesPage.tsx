import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Award, Eye, Loader2, X, ChevronLeft, 
  Download, Package, Search, Calendar, 
  ChevronRight, ClipboardList, ExternalLink 
} from 'lucide-react';
import { api, ENDPOINTS } from '../api/config';
import { CustomerCertificatePrintView } from './CustomerCertificatePrintView';
import type { CertificateTemplateData } from './CustomerCertificatePrintView';

// Unified interface to handle both System and Manual certificates
interface Certificate {
  certificate_id: number | string; 
  job_id: number;
  inward_id: number | null;
  certificate_no: string;
  date_of_calibration: string;
  ulr_no: string | null;
  customer_dc_no: string | null;
  customer_dc_date?: string | null; 
  is_external: boolean; 
  certificate_file_url?: string;
  certificate_file_name?: string;
}

const formatDate = (d?: string | null) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch (e) { return '—'; }
};

export const CustomerCertificatesPage: React.FC = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDc, setSelectedDc] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedCertId, setSelectedCertId] = useState<number | string | null>(null);
  const [printData, setPrintData] = useState<{ template_data: CertificateTemplateData } | null>(null);
  const [printLoading, setPrintLoading] = useState(false);

  const fetchCertificates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<Certificate[]>(ENDPOINTS.PORTAL.CERTIFICATES);
      setCertificates(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load certificates.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const groupedData = useMemo(() => {
    let filtered = certificates;
    if (searchTerm) {
      const low = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        (c.customer_dc_no?.toLowerCase().includes(low)) || 
        (c.certificate_no?.toLowerCase().includes(low))
      );
    }
    return filtered.reduce((acc, cert) => {
      const key = cert.customer_dc_no || "General / Others";
      if (!acc[key]) acc[key] = [];
      acc[key].push(cert);
      return acc;
    }, {} as Record<string, Certificate[]>);
  }, [certificates, searchTerm]);

  const activeCertificates = selectedDc ? groupedData[selectedDc] || [] : [];

  const handleDownloadPdf = async (cert: Certificate) => {
    // FLOW 1: Manual/External Upload
    if (cert.is_external && cert.certificate_file_url) {
      const link = document.createElement('a');
      link.href = cert.certificate_file_url;
      link.download = cert.certificate_file_name || `cert_${cert.certificate_id}.pdf`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // FLOW 2: System Generated
    try {
      const res = await api.get(ENDPOINTS.PORTAL.CERTIFICATE_DOWNLOAD_PDF(cert.certificate_id as number), {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `certificate_${cert.certificate_no || cert.certificate_id}.pdf`.replace(/\//g, '-');
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      alert('Failed to download PDF.');
    }
  };

  const handleViewCertificate = async (cert: Certificate) => {
    // FLOW 1: Manual/External Upload (Open URL directly)
    if (cert.is_external && cert.certificate_file_url) {
      window.open(cert.certificate_file_url, '_blank');
      return;
    }

    // FLOW 2: System Generated (Show Preview Modal)
    setSelectedCertId(cert.certificate_id);
    setShowPrintModal(true);
    setPrintData(null);
    setPrintLoading(true);
    try {
      const res = await api.get(ENDPOINTS.PORTAL.CERTIFICATE_VIEW(cert.certificate_id as number));
      setPrintData(res.data);
    } catch (err) {
      setPrintData(null);
    } finally {
      setPrintLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* --- Header Section --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Award className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                {selectedDc ? `DC: ${selectedDc}` : "Calibration Certificates"}
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {selectedDc ? `List of certificates for this delivery challan` : "View and download your issued calibration certificates"}
              </p>
            </div>
          </div>

          {selectedDc ? (
            <button 
              onClick={() => setSelectedDc(null)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-all shadow-sm"
            >
              <ChevronLeft size={16} />
              <span>Back to List</span>
            </button>
          ) : (
            <Link 
              to="/customer" 
              className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-all shadow-sm"
            >
              <ChevronLeft size={16} />
              <span>Back to Dashboard</span>
            </Link>
          )}
        </div>

        {!selectedDc ? (
          /* --- VIEW 1: Group Listing (Cards Style) --- */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50 rounded-t-2xl">
              <div className="relative max-w-md w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input 
                  type="text" 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  placeholder="Search by DC or Certificate No..." 
                  className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow bg-white" 
                />
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {isLoading ? (
                <div className="text-center py-16"><Loader2 className="h-10 w-10 animate-spin text-indigo-600 mx-auto" /></div>
              ) : Object.keys(groupedData).length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                   <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                   <p>No certificates found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(groupedData).map(([dcNo, certs]) => (
                    <div 
                      key={dcNo} 
                      onClick={() => setSelectedDc(dcNo)}
                      className="flex items-center justify-between p-5 bg-gray-50 hover:bg-indigo-50 border border-gray-200 rounded-xl transition-all group cursor-pointer shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-start gap-4">
                        <div className="mt-1">
                          <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-indigo-600 group-hover:border-indigo-200 transition-colors">
                            <Package className="h-5 w-5" />
                          </div>
                        </div>
                        <div>
                          <p className="font-semibold text-lg text-gray-800">DC No: {dcNo}</p>
                         
                          <div className="mt-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white border border-gray-200 text-indigo-700">
                              {certs.length} Certificates
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* --- VIEW 2: Table Detail View --- */
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-gray-50/50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
               <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-indigo-600" />
                  Certificate Details
               </h3>
               <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{activeCertificates.length} Records found</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
                    <th className="px-6 py-4 font-semibold">Certificate No</th>
                    <th className="px-6 py-4 font-semibold">ULR No</th>
                    <th className="px-6 py-4 font-semibold">Calibration Date</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {activeCertificates.map((cert) => (
                    <tr key={cert.certificate_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-indigo-700">
                        {cert.certificate_no || (cert.is_external ? 'MANUAL-UPLOAD' : '—')}
                      </td>
                      <td className="px-6 py-4 text-gray-500 font-mono">
                        {cert.ulr_no || '—'}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {formatDate(cert.date_of_calibration)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                           <button 
                             onClick={() => handleViewCertificate(cert)} 
                             className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                           >
                              {cert.is_external ? <ExternalLink className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              VIEW
                           </button>
                           <button 
                             onClick={() => handleDownloadPdf(cert)} 
                             className="p-1.5 border border-gray-200 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                           >
                              <Download className="h-4 w-4" />
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- Modal Preview (System only) --- */}
        {showPrintModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowPrintModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-lg font-bold text-gray-800">Certificate Preview</h3>
                <button onClick={() => setShowPrintModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
                {printLoading ? (
                  <div className="py-20 text-center"><Loader2 className="animate-spin h-10 w-10 mx-auto text-indigo-600" /></div>
                ) : (
                  printData?.template_data && (
                    <CustomerCertificatePrintView 
                      data={printData.template_data} 
                      onDownload={() => {
                        const cert = certificates.find(c => c.certificate_id === selectedCertId);
                        if(cert) handleDownloadPdf(cert);
                      }} 
                    />
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};