import { useState, useEffect } from 'react';

// 1. Define TypeScript interfaces for the API responses
interface DashboardSummary {
  total_equipments_received: number;
  total_certificates_issued: number;
  open_deviations: number;
  active_customers: number;
}

interface CustomerThroughput {
  customer_id: number;
  customer_details: string;
  total_inwards: number;
  total_srfs: number;
  total_equipments: number;
  completed_jobs: number;
  issued_certificates: number;
  last_certificate_dispatched_at: string | null;
}

interface ExpiringStandard {
  master_standard_id: number;
  nomenclature: string;
  calibration_valid_upto: string;
  days_remaining: number;
}

const ReportsAndAnalytics = () => {
  // Default to the current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const currentDay = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(currentDay);
  const [loading, setLoading] = useState(false);

  // 2. Add explicit TypeScript types to the useState hooks
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [throughput, setThroughput] = useState<CustomerThroughput[]>([]);
  const [expiringStandards, setExpiringStandards] = useState<ExpiringStandard[]>([]);

  // 3. Strongly type the 'url' parameter
  const fetchWithAuth = async (url: string) => {
    const token = localStorage.getItem('access_token');
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('API Request Failed');
    return response.json();
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryData, throughputData, standardsData] = await Promise.all([
        fetchWithAuth(`/api/v1/analytics/dashboard-summary?start_date=${startDate}&end_date=${endDate}`),
        fetchWithAuth(`/api/v1/analytics/customer-throughput?start_date=${startDate}&end_date=${endDate}`),
        fetchWithAuth(`/api/v1/analytics/master-standards/expiring?threshold_days=30`)
      ]);

      setSummary(summaryData);
      setThroughput(throughputData);
      setExpiringStandards(standardsData);
    } catch (error) {
      console.error("Failed to load analytics data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `/api/v1/analytics/export/customer-throughput?start_date=${startDate}&end_date=${endDate}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Extract filename from headers if possible, or fallback
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `Throughput_${startDate}_to_${endDate}.xlsx`;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting file:", error);
      alert("Failed to export report. Please try again.");
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Reports & Analytics</h1>
        
        {/* Date Filters */}
        <div className="flex items-center space-x-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Start Date</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">End Date</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {loading && <div className="text-blue-600 mb-4 font-medium">Loading analytics data...</div>}

      {/* Executive Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
            <p className="text-sm text-gray-500 font-medium">Equipments Received</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">{summary.total_equipments_received}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-green-500">
            <p className="text-sm text-gray-500 font-medium">Certificates Issued</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">{summary.total_certificates_issued}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-red-500">
            <p className="text-sm text-gray-500 font-medium">Open Deviations</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">{summary.open_deviations}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-purple-500">
            <p className="text-sm text-gray-500 font-medium">Active Customers</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">{summary.active_customers}</p>
          </div>
        </div>
      )}

      {/* Main Throughput Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
        <div className="flex justify-between items-center p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Customer Throughput Report</h2>
          <button 
            onClick={handleExport}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            Export to Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                <th className="p-4 font-semibold">Customer</th>
                <th className="p-4 font-semibold">Inwards</th>
                <th className="p-4 font-semibold">SRFs</th>
                <th className="p-4 font-semibold">Equipments</th>
                <th className="p-4 font-semibold">Completed Jobs</th>
                <th className="p-4 font-semibold">Issued Certs</th>
                <th className="p-4 font-semibold">Last Dispatch</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {throughput.length > 0 ? throughput.map((row) => (
                <tr key={row.customer_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4 text-gray-800">{row.customer_details.substring(0, 30)}...</td>
                  <td className="p-4 text-gray-600">{row.total_inwards}</td>
                  <td className="p-4 text-gray-600">{row.total_srfs}</td>
                  <td className="p-4 text-gray-600">{row.total_equipments}</td>
                  <td className="p-4 text-gray-600">{row.completed_jobs}</td>
                  <td className="p-4 text-gray-600">{row.issued_certificates}</td>
                  <td className="p-4 text-gray-600">
                    {row.last_certificate_dispatched_at ? new Date(row.last_certificate_dispatched_at).toLocaleDateString() : 'N/A'}
                  </td>
                </tr>
              )) : (
                <tr>
                  {/* 4. Converted string "7" to number {7} for TypeScript JSX compatibility */}
                  <td colSpan={7} className="p-8 text-center text-gray-500">No data available for this date range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compliance Alerts Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Compliance Alerts: Expiring Master Standards</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                <th className="p-4 font-semibold">Standard ID</th>
                <th className="p-4 font-semibold">Nomenclature</th>
                <th className="p-4 font-semibold">Valid Upto</th>
                <th className="p-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {expiringStandards.length > 0 ? expiringStandards.map((std) => (
                <tr key={std.master_standard_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4 text-gray-800 font-medium">#{std.master_standard_id}</td>
                  <td className="p-4 text-gray-600">{std.nomenclature}</td>
                  <td className="p-4 text-gray-600">{new Date(std.calibration_valid_upto).toLocaleDateString()}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      std.days_remaining < 0 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {std.days_remaining < 0 ? `Expired ${Math.abs(std.days_remaining)} days ago` : `Expires in ${std.days_remaining} days`}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  {/* 4. Converted string "4" to number {4} */}
                  <td colSpan={4} className="p-8 text-center text-gray-500">All master standards are up to date.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsAndAnalytics;