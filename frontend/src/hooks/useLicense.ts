// src/hooks/useLicense.ts
import { useEffect, useState } from "react";
import { fetchLicenseStatus, LicenseResponse } from "../api/license";

let inFlightLicenseRequest: Promise<LicenseResponse> | null = null;

const getLicenseStatusOnce = () => {
  if (!inFlightLicenseRequest) {
    inFlightLicenseRequest = fetchLicenseStatus().finally(() => {
      inFlightLicenseRequest = null;
    });
  }
  return inFlightLicenseRequest;
};

export const useLicense = () => {
  const [license, setLicense] = useState<LicenseResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const data = await getLicenseStatusOnce();
        if (alive) setLicense(data);
      } catch {
        // Fail open (never block app if API fails)
        if (alive) setLicense(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await fetchLicenseStatus();
      setLicense(data);
    } catch {
      setLicense(null);
    } finally {
      setLoading(false);
    }
  };

  return { license, loading, refresh };
};