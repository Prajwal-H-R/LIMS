import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode'; // Import library
import { ScanBarcode, ArrowRight, Camera, X } from 'lucide-react';

export const BarcodeScanner = () => {
  const [code, setCode] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  // Focus input on load (for USB scanners)
  useEffect(() => {
    if (!isCameraOpen) {
      inputRef.current?.focus();
    }
  }, [isCameraOpen]);

  // Handle Manual/USB Input
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (code.trim()) {
      handleScanSuccess(code.trim());
    }
  };

  // Central success handler
  const handleScanSuccess = (decodedText: string) => {
    // Stop camera if running
    if (scannerRef.current) {
      scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
      scannerRef.current = null;
    }
    
    setIsCameraOpen(false);
    
    // Navigate to result
    navigate(`/engineer/scan-result/${decodedText}`);
  };

  // Initialize Camera Scanner when isCameraOpen becomes true
  useEffect(() => {
    if (isCameraOpen) {
      // Configuration for the scanner
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        // Important: Limit formats to common 1D barcodes and QR codes for better performance
        formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
        ]
      };

      // Create scanner instance
      const scanner = new Html5QrcodeScanner(
        "reader", 
        config, 
        /* verbose= */ false
      );
      
      scannerRef.current = scanner;

      // Start scanning
      scanner.render(
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        (errorMessage) => {
          // parse error, ignore it.
        }
      );
    }

    // Cleanup function when component unmounts or camera closes
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isCameraOpen, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] bg-gray-50 p-4">
      <div className="bg-white p-6 md:p-10 rounded-2xl shadow-xl text-center max-w-lg w-full border border-gray-100 relative">
        
        {/* Header Icon */}
        <div className="bg-blue-50 p-5 rounded-full inline-block mb-6">
          <ScanBarcode size={56} className="text-blue-600" />
        </div>
        
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Scan Equipment</h2>
        <p className="text-gray-500 mb-8">
          Use camera or enter NEPL ID manually.
        </p>

        {/* --- CAMERA SECTION --- */}
        {isCameraOpen ? (
          <div className="mb-6">
            <div 
              id="reader" 
              className="w-full overflow-hidden rounded-lg border-2 border-blue-500"
            ></div>
            <button 
              onClick={() => setIsCameraOpen(false)}
              className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 flex items-center justify-center gap-2 w-full font-medium"
            >
              <X size={18} /> Cancel Camera
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCameraOpen(true)}
            className="mb-8 w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
          >
            <Camera size={20} /> Scan with Camera
          </button>
        )}

        {/* --- MANUAL INPUT SECTION --- */}
        {!isCameraOpen && (
          <>
            <div className="relative flex items-center justify-center mb-6">
              <div className="border-t border-gray-200 w-full"></div>
              <span className="bg-white px-3 text-gray-400 text-sm absolute">OR TYPE ID</span>
            </div>

            <form onSubmit={handleSubmit} className="relative">
              <input
                ref={inputRef}
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="NEPL-ID..."
                className="w-full px-6 py-4 text-xl border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all text-center tracking-wider font-mono uppercase"
              />
              <button
                type="submit"
                className="mt-4 w-full bg-gray-800 text-white py-3.5 rounded-xl font-semibold hover:bg-gray-900 transition-colors flex items-center justify-center gap-2"
              >
                Get Details <ArrowRight size={20} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};