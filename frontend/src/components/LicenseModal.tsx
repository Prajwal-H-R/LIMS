//frontend/src/components/LicenseModal.tsx
import { useState } from "react";
import { extendLicense } from "../api/license";

interface Props {
  status: "EXPIRED" | "EXPIRING_SOON";
  validUntil: string;
  onExtended: (newDate: string) => void;
  onClose?: () => void;
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
      setError(
        e.response?.data?.detail || "Invalid activation key"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-semibold mb-3">
          License {status === "EXPIRED" ? "Expired" : "Expiring Soon"}
        </h2>

        <p className="text-gray-700 mb-4">
          {status === "EXPIRED" ? (
           <>
  <p>
    Your <strong>Yatharthata LIMS</strong> subscription expired on{" "}
    <strong>{validUntil}</strong>.
  </p>

  <p>
    Please contact the <strong>AIMLSN Yatharthata LIMS Administrator</strong> to
    obtain an activation key and restore access.
  </p>

  <p>
    For assistance, email{" "}
    <a
      href="mailto:HRhelp@aimlsn.com"
      style={{ textDecoration: "underline", fontWeight: 600 }}
    >
      HRhelp@aimlsn.com
    </a>.
  </p>
</>

          ) : (
            <>
              Your subscription will expire on{" "}
              <b>{validUntil}</b>.
              <br />
              <>
  <p>
    Your subscription is nearing expiration. Please contact the{" "}
    <strong>AIMLSN Yatharthata LIMS Administrator</strong> to avoid service
    disruption.
  </p>
  <p>
    For assistance, email{" "}
     <a
      href="mailto:HRhelp@aimlsn.com"
      style={{ textDecoration: "underline" }}
    >
      HRhelp@aimlsn.com
    </a>.
  </p>
</>

            </>
          )}
        </p>

        {status === "EXPIRED" && (
          <>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste activation key"
              className="w-full border rounded-lg px-3 py-2 mb-3"
            />

            {error && (
              <div className="text-red-600 text-sm mb-2">
                {error}
              </div>
            )}

            <button
              onClick={handleExtend}
              disabled={loading || !key}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg disabled:opacity-50"
            >
              {loading ? "Validating..." : "Extend License"}
            </button>
          </>
        )}

        {status === "EXPIRING_SOON" && onClose && (
          <button
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
