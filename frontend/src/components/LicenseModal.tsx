//frontend/src/components/LicenseModal.tsx
import { useState } from "react";
import { extendLicense } from "../api/license";
 
interface Props {
  status: "EXPIRED" | "EXPIRING_SOON";
  validUntil: string;
  onExtended: (newDate: string) => void;
  onClose: () => void;
}
 
const LicenseModal = ({
  status,
  validUntil,
  onExtended,
  onClose,
}: Props) => {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
 
  const handleExtend = async () => {
    setError("");
    setLoading(true);
 
    try {
      const res = await extendLicense(key);
      onExtended(res.valid_until);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Invalid activation key");
    } finally {
      setLoading(false);
    }
  };
 
  const title =
    status === "EXPIRED" ? "Expired" : "Expiring Soon";
 
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl relative">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-700"
        >
          ×
        </button>
 
        <h2 className="text-xl font-semibold mb-3">
          License {title}
        </h2>
 
        <div className="text-gray-700 mb-4">
          {status === "EXPIRED" ? (
            <>
              <p>
                <strong>License expired.</strong> Renew the license to create new inward records.
              </p>
              <p>
                Your <strong>Yatharthata LIMS</strong> subscription expired on{" "}
                <strong>{validUntil}</strong>.
              </p>
              <p>
                Use the activation key below to restore access and extend the license.
              </p>
            </>
          ) : (
            <>
              <p>
                Your subscription will expire on <b>{validUntil}</b>.
              </p>
              <p>
                Your subscription is nearing expiration. Please contact the{" "}
                <strong>AIMLSN Yatharthata LIMS Administrator</strong> to avoid
                service disruption.
              </p>
              <p>
                For assistance, email{" "}
                <a
                  href="mailto:HRhelp@aimlsn.com"
                  style={{ textDecoration: "underline" }}
                >
                  HRhelp@aimlsn.com
                </a>
                .
              </p>
            </>
          )}
        </div>
 
        {status === "EXPIRED" && (
          <>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste activation key"
              className="w-full border rounded-lg px-3 py-2 mb-3"
            />
 
            {error && (
              <div className="text-red-600 text-sm mb-2">{error}</div>
            )}
 
            <button
              onClick={handleExtend}
              disabled={loading || !key}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg disabled:opacity-50"
            >
              {loading ? "Validating..." : "Extend License"}
            </button>
 
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full border py-2 rounded-lg"
            >
              OK
            </button>
          </>
        )}
 
        {status === "EXPIRING_SOON" && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full border py-2 rounded-lg"
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
};
 
export default LicenseModal;