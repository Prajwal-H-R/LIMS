import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Printer, AlertCircle } from "lucide-react";
import { api, ENDPOINTS } from "../api/config";
import { CustomerCertificatePrintView } from "./CustomerCertificatePrintView";
import type { CertificateTemplateData } from "./CustomerCertificatePrintView";

interface QrCertificateViewResponse {
  certificate_id: number;
  certificate_no: string;
  status: string;
  date_of_calibration: string | null;
  recommended_cal_due_date: string | null;
  calibration_status: string;
  template_data: CertificateTemplateData;
  print_pdf_url: string;
}

export const CertificateQrPublicView: React.FC = () => {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [data, setData] = useState<QrCertificateViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!certificateId) {
        setError("Invalid QR link.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<QrCertificateViewResponse>(ENDPOINTS.CERTIFICATES.VIEW_BY_QR_CERT(Number(certificateId)));
        setData(res.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Unable to load certificate from QR.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [certificateId]);

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Certificate View</h1>
            {data && (
              <p className="text-sm text-slate-600">
                {data.certificate_no} • Cal Due: {data.recommended_cal_due_date || "-"} • {data.calibration_status}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium"
          >
            <Printer className="h-4 w-4" />
            Print Certificate
          </button>
        </div>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-2" />
            <p className="text-slate-600">Loading certificate...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : data?.template_data ? (
          <div className="bg-slate-100">
            <CustomerCertificatePrintView data={data.template_data} />
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-600">
            Certificate unavailable.
          </div>
        )}
      </div>
    </div>
  );
};
