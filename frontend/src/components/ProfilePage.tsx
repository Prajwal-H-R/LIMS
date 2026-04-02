import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { ChevronLeft, Eye, EyeOff, Loader2, UserCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../auth/AuthProvider";
import { api, ENDPOINTS } from "../api/config";

function formatApiError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.data) {
    const data = err.response.data as { detail?: unknown };
    if (typeof data.detail === "string") return data.detail;
  }
  return "Could not save profile. Please try again.";
}

const inputClass = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
const readOnlyClass = "mt-1 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-700";

const ProfilePage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const homePath = location.pathname.startsWith("/customer")
    ? "/customer"
    : location.pathname.startsWith("/engineer")
      ? "/engineer"
      : "/admin?section=dashboard";

  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [billTo, setBillTo] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isCustomer = user?.role === "customer";

  useEffect(() => {
    refreshUser().catch(() => undefined);
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name ?? "");
    setUsername(user.username ?? "");
    setEmail(user.email ?? "");
    setContactPerson(user.contact_person ?? "");
    setPhone(user.phone ?? "");
    setCompanyName(user.customer_details ?? "");
    setShipTo(user.ship_to_address ?? "");
    setBillTo(user.bill_to_address ?? "");
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showChangePassword) {
      if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
        toast.error("Please fill current, new and confirm password.");
        return;
      }
      if (newPassword.length < 8) {
        toast.error("New password must be at least 8 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("New password and confirm password do not match.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, string | null> = {
        full_name: fullName.trim() || null,
        username: username.trim(),
      };
      if (isCustomer) {
        payload.contact_person = contactPerson.trim() || null;
        payload.phone = phone.trim() || null;
        payload.ship_to_address = shipTo.trim();
        payload.bill_to_address = billTo.trim();
      }
      if (showChangePassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }
      await api.patch(ENDPOINTS.AUTH.ME_PROFILE, payload);
      await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setShowChangePassword(false);
      toast.success("Profile updated");
      navigate(homePath);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><UserCircle /> Profile</h1>
        <button type="button" onClick={() => navigate(homePath)} className="inline-flex items-center gap-2 border rounded-lg px-3 py-2 text-sm">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
      </div>
      <form onSubmit={handleSubmit} className="rounded-2xl border bg-white p-6 space-y-4">
        <div><label>Email</label><input value={email} readOnly className={readOnlyClass} /></div>
        <div><label>Full name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} /></div>
        <div><label>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} /></div>
        {isCustomer && (
          <>
            <div><label>Company</label><input value={companyName} readOnly className={readOnlyClass} /></div>
            <div><label>Contact person</label><input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputClass} /></div>
            <div><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} /></div>
            <div><label>Ship-to address</label><textarea value={shipTo} onChange={(e) => setShipTo(e.target.value)} className={inputClass} /></div>
            <div><label>Bill-to address</label><textarea value={billTo} onChange={(e) => setBillTo(e.target.value)} className={inputClass} /></div>
          </>
        )}
        <div className="border-t pt-4">
          <button
            type="button"
            onClick={() => setShowChangePassword((prev) => !prev)}
            className="text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            {showChangePassword ? "Hide change password" : "Change password"}
          </button>
          {showChangePassword && (
            <div className="mt-3 space-y-3">
              <div>
                <label>Current password</label>
                <div className="relative mt-1">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={`${inputClass} mt-0 pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                    aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label>New password</label>
                <div className="relative mt-1">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`${inputClass} mt-0 pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                    aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label>Confirm password</label>
                <div className="relative mt-1">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`${inputClass} mt-0 pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <button disabled={saving} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm">{saving ? "Saving..." : "Save changes"}</button>
      </form>
    </div>
  );
};

export default ProfilePage;
