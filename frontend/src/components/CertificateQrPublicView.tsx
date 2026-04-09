import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Eye, AlertCircle, Download } from "lucide-react";
import { api, ENDPOINTS, FULL_API_BASE } from "../api/config";
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

function safePdfFilename(certificateNo: string): string {
  const base = (certificateNo || "certificate").replace(/[/\\?%*:|"<>]/g, "-").trim() || "certificate";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export const CertificateQrPublicView: React.FC = () => {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [data, setData] = useState<QrCertificateViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfBlobRef = useRef<Blob | null>(null);

  const pdfApiUrl = certificateId
    ? `${FULL_API_BASE}${ENDPOINTS.CERTIFICATES.DOWNLOAD_PDF(Number(certificateId))}`
    : "";
  const pdfInlineTabUrl = pdfApiUrl ? `${pdfApiUrl}?inline=1` : "";

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
        const res = await api.get<QrCertificateViewResponse>(
          ENDPOINTS.CERTIFICATES.VIEW_BY_QR_CERT(Number(certificateId)),
        );
        setData(res.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Unable to load certificate from QR.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [certificateId]);

  useEffect(() => {
    if (!certificateId || !data || !pdfApiUrl) {
      return undefined;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    pdfBlobRef.current = null;
    setPdfObjectUrl(null);
    setPdfError(null);
    setPdfLoading(true);

    const loadPdf = async () => {
      try {
        const res = await fetch(pdfApiUrl, { credentials: "same-origin" });
        if (!res.ok) {
          const msg =
            res.status === 403 || res.status === 404
              ? "Certificate PDF is not available."
              : "Unable to load certificate PDF.";
          throw new Error(msg);
        }
        const blob = await res.blob();
        if (cancelled) return;
        pdfBlobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setPdfObjectUrl(objectUrl);
      } catch (e: any) {
        if (!cancelled) {
          setPdfError(e?.message || "Unable to load certificate PDF.");
        }
      } finally {
        if (!cancelled) {
          setPdfLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      pdfBlobRef.current = null;
    };
  }, [certificateId, data, pdfApiUrl]);

  const handleDownloadPdf = () => {
    const blob = pdfBlobRef.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data ? safePdfFilename(data.certificate_no) : "certificate.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  };

  const handlePreviewPdfInNewTab = () => {
    if (!pdfInlineTabUrl) return;
    window.open(pdfInlineTabUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Certificate View</h1>
            {data && (
              <p className="text-sm text-slate-600">
                {data.certificate_no} • Cal Due: {data.recommended_cal_due_date || "-"} •{" "}
                {data.calibration_status}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {data && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={!pdfObjectUrl}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none text-sm font-medium"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={handlePreviewPdfInNewTab}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium"
                >
                  <Eye className="h-4 w-4" />
                  Preview PDF
                </button>
              </>
            )}
          </div>
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
        ) : data ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 text-sm text-slate-600 font-medium">
              Certificate PDF (embedded)
            </div>
            {pdfLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-2" />
                <p className="text-slate-600">Loading PDF preview...</p>
              </div>
            ) : pdfError ? (
              <div className="p-6 text-red-700 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {pdfError}
              </div>
            ) : pdfObjectUrl ? (
              <iframe
                title="Certificate PDF preview"
                src={pdfObjectUrl}
                className="w-full min-h-[75vh]"
                style={{ border: "none" }}
              />
            ) : null}
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
