import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Award, Eye, Loader2, X, FileText, ChevronLeft, Download } from 'lucide-react';
import { api, ENDPOINTS } from '../api/config';
import { CustomerCertificatePrintView } from './CustomerCertificatePrintView';
import type { CertificateTemplateData } from './CustomerCertificatePrintView';

interface Certificate {
  certificate_id: number;
  job_id: number;
  inward_id: number | null;
  certificate_no: string;
  date_of_calibration: string;
  ulr_no: string | null;
  field_of_parameter: string | null;
  recommended_cal_due_date: string | null;
  status: string;
  dc_number?: string | null;
}

const formatDate = (d?: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const CustomerCertificatesPage: React.FC = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedCertId, setSelectedCertId] = useState<number | null>(null);
  const [printData, setPrintData] = useState<{ template_data: CertificateTemplateData } | null>(null);
  const [printLoading, setPrintLoading] = useState(false);

  const fetchCertificates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<Certificate[]>(ENDPOINTS.PORTAL.CERTIFICATES);
      setCertificates(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to fetch certificates:', err);
      setError(err.response?.data?.detail || 'Failed to load certificates.');
      setCertificates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const handleDownloadPdf = async (cert: Certificate) => {
    try {
      const res = await api.get(ENDPOINTS.PORTAL.CERTIFICATE_DOWNLOAD_PDF(cert.certificate_id), {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const contentDisp = res.headers?.['content-disposition'];
      const filename =
        contentDisp?.match(/filename="?([^";\n]+)"?/)?.[1] ||
        `certificate_${cert.certificate_no || cert.certificate_id}.pdf`.replace(/\//g, '-');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to download PDF.');
    }
  };

  const handleViewCertificate = async (cert: Certificate) => {
    setSelectedCertId(cert.certificate_id);
    setShowPrintModal(true);
    setPrintData(null);
    setPrintLoading(true);
    try {
      const res = await api.get(ENDPOINTS.PORTAL.CERTIFICATE_VIEW(cert.certificate_id));
      setPrintData(res.data);
    } catch (err) {
      console.error('Failed to load certificate:', err);
      setPrintData(null);
    } finally {
      setPrintLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl">
            <Award className="h-8 w-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Calibration Certificates</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              View and download your issued calibration certificates
            </p>
          </div>
        </div>
        <Link
          to="/customer"
          className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm flex items-center gap-1 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 text-slate-600 text-sm">
            <tr>
              <th className="p-4 font-semibold border-b">Certificate No</th>
              <th className="p-4 font-semibold border-b">DC number</th>
              <th className="p-4 font-semibold border-b">Calibration Date</th>
              <th className="p-4 font-semibold border-b">ULR No</th>
              <th className="p-4 font-semibold border-b">Cal Due Date</th>
              <th className="p-4 font-semibold border-b text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-2" />
                  <p className="text-slate-500">Loading certificates...</p>
                </td>
              </tr>
            ) : certificates.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-slate-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>No issued certificates found.</p>
                  <p className="text-sm mt-1">
                    Certificates appear here once they are issued by the laboratory.
                  </p>
                </td>
              </tr>
            ) : (
              certificates.map((cert) => (
                <tr key={cert.certificate_id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono text-sm font-medium text-slate-800">
                    {cert.certificate_no || '—'}
                  </td>
                  <td className="p-4 text-slate-600 font-mono">{(cert.dc_number || cert.job_id) ?? '—'}</td>
                  <td className="p-4 text-slate-600">{formatDate(cert.date_of_calibration)}</td>
                  <td className="p-4 text-slate-600 font-mono">{cert.ulr_no || '—'}</td>
                  <td className="p-4 text-slate-600">{formatDate(cert.recommended_cal_due_date)}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleViewCertificate(cert)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <Eye className="h-4 w-4" /> View
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(cert)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <Download className="h-4 w-4" /> Download PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Certificate Preview Popup */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setShowPrintModal(false); setSelectedCertId(null); setPrintData(null); }}>
          <div
            className="bg-white rounded-xl shadow-2xl flex flex-col max-w-4xl w-full max-h-[90vh] overflow-hidden mt-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-slate-200 bg-slate-50">
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  setSelectedCertId(null);
                  setPrintData(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors font-medium shadow-sm"
              >
                <ChevronLeft className="h-5 w-5" /> Back
              </button>
              <h3 className="text-lg font-bold text-slate-800 truncate flex-1 text-center">Certificate Preview</h3>
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  setSelectedCertId(null);
                  setPrintData(null);
                }}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-100 p-4 min-h-0">
              {printLoading ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-4" />
                  <p className="text-slate-600">Loading certificate...</p>
                </div>
              ) : printData?.template_data ? (
                <CustomerCertificatePrintView
                  data={printData.template_data}
                  onDownload={() => {
                    const cert = certificates.find((c) => c.certificate_id === selectedCertId);
                    if (cert) handleDownloadPdf(cert);
                  }}
                />
              ) : (
                <div className="text-center py-24 text-slate-500">
                  Failed to load certificate.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
