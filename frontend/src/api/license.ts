// src/api/license.ts
import { api } from "./config";

export type LicenseStatus =
  | "ACTIVE"
  | "EXPIRING_SOON"
  | "EXPIRED";

export interface LicenseResponse {
  status: LicenseStatus;
  valid_until: string;
  message?: string;
  days_left?: number;
}

export const fetchLicenseStatus = async (): Promise<LicenseResponse> => {
  const res = await api.get("/license/status");
  return res.data;
};

export const extendLicense = async (activationKey: string) => {
  const res = await api.post("/license/extend", {
    activation_key: activationKey,
  });
  return res.data;
};
