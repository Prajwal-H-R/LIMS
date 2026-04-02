import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

/** 
 * Data interface matching the backend schema.
 */
export interface CertificateTemplateData {
  certificate_no?: string;
  calibration_date?: string;
  nepl_id?: string;
  cal_due_date?: string;
  ulr_no?: string;
  issue_date?: string;
  field_of_parameter?: string;
  calibration_mode?: string;
  customer_name?: string;
  customer_address?: string;
  reference_dc_no?: string;
  reference_no_date?: string;
  receipt_date?: string;
  item_status?: string;
  device_nomenclature?: string;
  device_make_model?: string;
  device_type?: string;
  device_classification?: string;
  si_no?: string;
  torque_range?: string;
  place_of_calibration?: string;
  units_of_measurement?: string;
  torque_unit?: string;
  pressure_gauge_resolution?: string;
  pressure_gauge_unit?: string;
  standard1_nomenclature?: string;
  standard1_manufacturer?: string;
  standard1_model?: string;
  standard1_uncertainty?: string;
  standard1_cert_no?: string;
  standard1_valid_upto?: string;
  standard1_traceability?: string;
  standard2_nomenclature?: string;
  standard2_manufacturer?: string;
  standard2_model?: string;
  standard2_uncertainty?: string;
  standard2_cert_no?: string;
  standard2_valid_upto?: string;
  standard2_traceability?: string;
  standard3_nomenclature?: string;
  standard3_manufacturer?: string;
  standard3_model?: string;
  standard3_uncertainty?: string;
  standard3_cert_no?: string;
  standard3_valid_upto?: string;
  standard3_traceability?: string;
  temperature?: string;
  humidity?: string;
  authorised_signatory?: string;
  logo_left?: string;
  logo_right?: string;
  qr_code?: string;
  repeatability_data?: Array<{ pressure: number; target: number; readings: number[]; repeatability: number; repeatability_pct: number }>;
  reproducability_data?: Array<Record<string, unknown>>;
  geometric_data?: Array<Record<string, unknown>>;
  interface_data?: Array<Record<string, unknown>>;
  loading_data?: Array<Record<string, unknown>>;
  uncertainty_data?: Array<Record<string, unknown>>;
  coverage_factor_k?: number;
}

export const CustomerCertificatePrintView: React.FC<{
  data: CertificateTemplateData;
}> = ({ data }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for scaling logic
  const [scale, setScale] = useState(1);
  const [iframeHeight, setIframeHeight] = useState('297mm'); // Start with 1 page height
  
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 1. Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('access_token') || localStorage.getItem('token');
        if (!token) throw new Error("No authentication token found.");

        const response = await axios.post(
          '/api/certificates/render-preview', 
          data,
          { 
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            responseType: 'text' 
          }
        );
        
        // Inject CSS to hide scrollbars strictly within the iframe
        const rawHtml = response.data;
        const noScrollStyle = `
          <style>
            body { overflow-y: hidden !important; overflow-x: hidden !important; }
            ::-webkit-scrollbar { display: none; }
          </style>
        `;
        // Append style to head or body
        setHtmlContent(rawHtml + noScrollStyle);

      } catch (err: any) {
        console.error("Fetch error:", err);
        if (axios.isAxiosError(err) && err.response?.status === 401) {
            setError("Session expired. Please log in.");
        } else {
            setError("Failed to load preview.");
        }
      } finally {
        setLoading(false);
      }
    };

    const t = setTimeout(fetchData, 500);
    return () => clearTimeout(t);
  }, [data]);

  // 2. Calculate Scale to Fit Width
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.offsetWidth;
        // 210mm is approx 794px. We add a little buffer (e.g. 820)
        const A4_WIDTH_PX = 820; 
        
        // Calculate ratio. Cap at 1 (don't zoom in if screen is huge)
        const newScale = Math.min(1, (availableWidth - 32) / A4_WIDTH_PX); // 32px padding
        setScale(newScale);
      }
    };

    handleResize(); // Initial calc
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [loading]); // Re-calc when loading finishes

  // 3. Auto-height adjustment to remove vertical scrollbar
  const handleIframeLoad = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      const doc = iframeRef.current.contentWindow.document;
      // Calculate total height of content (3 pages usually)
      const contentHeight = doc.body.scrollHeight;
      // Set iframe height to match content exactly
      setIframeHeight(`${contentHeight}px`);
    }
  };

  const handlePrint = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full bg-gray-100 py-8">
      
      

      {loading && <div className="text-blue-600 font-semibold animate-pulse">Generating Preview...</div>}
      {error && <div className="text-red-600 font-semibold bg-red-50 p-4 border border-red-200 rounded">{error}</div>}

      {/* Container to measure width */}
      <div 
        ref={containerRef} 
        className="w-full flex justify-center overflow-hidden"
        style={{ minHeight: '500px' }} // Placeholder height
      >
        <div 
            className="transition-transform origin-top duration-300 ease-out shadow-2xl bg-white"
            style={{
                // Apply the calculated scale
                transform: `scale(${scale})`,
                // Force the wrapper to take up the scaled height space in the DOM
                height: `calc(${iframeHeight} * ${scale})`,
                width: '210mm', // Fixed base width
                marginBottom: '-100px' // Negative margin to reduce empty space caused by scaling
            }}
        >
            <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            onLoad={handleIframeLoad}
            title="Certificate Preview"
            style={{
                width: '210mm',
                height: iframeHeight, // Dynamic height based on content
                border: 'none',
                overflow: 'hidden', // Hide scrollbars logic 1
                display: 'block',
                backgroundColor: 'white'
            }}
            scrolling="no" // Hide scrollbars logic 2 (deprecated but works)
            />
        </div>
      </div>
    </div>
  );
};