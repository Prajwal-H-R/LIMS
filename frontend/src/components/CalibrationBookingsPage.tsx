import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar, FileText, CheckCircle, XCircle, ChevronLeft,
  ChevronDown, ChevronRight, Eye, Clock, AlertCircle, Loader2,
} from "lucide-react";
import { api,CALIBRATION_BOOKING } from "../api/config";

interface BookingFile {
  file_name: string | null;
  file_url: string | null;
  file_type: string | null;
}

interface AllBookingItem {
  booking_id: number;
  customer_name: string | null;
  equipment_count: number | null;
  status: string;
  file_count: number;
  created_at: string | null;
  files: BookingFile[];
  remarks: string | null;
}

const statusConfig: Record<string, { label: string; class: string }> = {
  pending: {
    label: "Pending",
    class: "bg-yellow-100 text-yellow-800",
  },
  accepted: {
    label: "Accepted",
    class: "bg-green-100 text-green-800",
  },
  resend_requested: {
    label: "Resend Requested",
    class: "bg-orange-100 text-orange-800",
  },
};

const isImage = (type: string | null): boolean =>
  !!type && ["image/jpeg", "image/png", "image/webp"].includes(type);

const CalibrationBookingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<AllBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchAll = useCallback(async () => {
    try {
      const res = await api.get<{ bookings: AllBookingItem[] }>(CALIBRATION_BOOKING.ALL);
      setBookings(res.data.bookings || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAccept = async (id: number) => {
    setActionLoading(id);
    try {
      await api.post(CALIBRATION_BOOKING.ACCEPT(id));
      setBookings((prev) =>
                      prev.map((b) => (b.booking_id === id ? { ...b, status: "accepted" } : b))
      );
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  const handleResend = async (id: number) => {
    setActionLoading(id);
    try {
      await api.post(CALIBRATION_BOOKING.RESEND(id));
      setBookings((prev) =>
                      prev.map((b) => (b.booking_id === id ? { ...b, status: "resend_requested" } : b))
      );
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-8 bg-white rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Calibration Bookings</h2>
          <p className="text-sm text-gray-500 mt-0.5">All customer calibration booking requests</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-all"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No bookings yet</p>
        </div>
      ) : (
        <div className="space-y-3">
              {bookings.map((booking) => {
            const cfg = statusConfig[booking.status] || statusConfig.pending;
            const isExpanded = expanded.has(booking.booking_id);
            const isPending = booking.status === "pending";
            return (
              <div key={booking.booking_id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg shrink-0 ${cfg.class}`}>
                      {booking.status === "accepted" ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : booking.status === "resend_requested" ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        Booking ID - {booking.booking_id}
                        {booking.customer_name && (
                          <span className="text-gray-500 font-normal"> &middot; {booking.customer_name}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {booking.file_count} file{booking.file_count !== 1 ? "s" : ""}
                        {booking.equipment_count != null && (
                          <> &middot; {booking.equipment_count} equipment</>
                        )}
                        {booking.created_at && (
                          <> &middot; {new Date(booking.created_at).toLocaleDateString("en-GB", {
                            day: "numeric", month: "short", year: "numeric",
                          })}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.class}`}>
                      {cfg.label}
                    </span>
                    {booking.files.length > 0 && (
                      <button
                        onClick={() => toggleExpand(booking.booking_id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    )}
                    {isPending && (
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => handleAccept(booking.booking_id)}
                          disabled={actionLoading === booking.booking_id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
                        >
                          {actionLoading === booking.booking_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3.5 w-3.5" />
                          )}
                          Accept
                        </button>
                        <button
                          onClick={() => handleResend(booking.booking_id)}
                          disabled={actionLoading === booking.booking_id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-amber-300 text-amber-800 text-xs font-semibold rounded-lg hover:bg-amber-50 disabled:opacity-60 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Resend
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (booking.files.length > 0 || booking.remarks) && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                    {booking.remarks && (
                      <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                        <span className="font-medium">Remarks:</span> {booking.remarks}
                      </div>
                    )}
                    {booking.files.map((file, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isImage(file.file_type) ? (
                            <span className="text-gray-400 text-xs">🖼</span>
                          ) : (
                            <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                          )}
                          <span className="text-sm text-gray-700 truncate">{file.file_name || "Unnamed file"}</span>
                        </div>
                        {file.file_url && (
                          <a
                            href={file.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0 ml-2"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CalibrationBookingsPage;
