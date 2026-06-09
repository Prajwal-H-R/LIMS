// File: src/types/scan.ts
 
export interface ScanResultType {
    device_info: {
      srf_number: string;
      inward_date: string;
      dc_number: string | null;
      dc_date: string | null;
      nepl_id: string;
    };
    customer_info: {
      company_name: string;
      contact_person: string | null;
      phone: string | null;
      address: string;
    };
    equipment: {
      id: string;
      description: string;
      make: string;
      model: string;
      range: string;
      serial_no: string;
      qty: number;
      supplier: string;
      in_dc: string;
      out_dc: string;
      calib_by: string;
      visual_status: string;
      eng_remarks: string | null;
      cust_remarks: string | null;
    };
    status_flow: {
      inward: boolean;
      srf: boolean;
      job: boolean;
      certificate: boolean;
    };
  }