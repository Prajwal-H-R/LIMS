// File: src/services/scanService.ts
import { api, ENDPOINTS } from "../api/config";
import { ScanResultType } from "../types/scan";
 
export const fetchScanDetails = async (neplId: string): Promise<ScanResultType> => {
  // This uses the endpoint we added in Step 1
  const response = await api.get<ScanResultType>(ENDPOINTS.EQUIPMENT.SCAN(neplId));
  return response.data;
};