import React, { useState, useEffect, ChangeEvent, FormEvent } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { User, UserRole } from "../types";
import {
  Mail,
  Lock,
  ArrowRight,
  HelpCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw, // Added for Captcha reload
  ShieldCheck, // Added for Captcha input icon
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";
import { useLicense } from "../hooks/useLicense";
import LicenseModal from "../components/LicenseModal";
import ShinyText from "../components/ShinyText";

interface LoginResponse {
  user_id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  customer_id?: number | null;
}

// Number of failed attempts before CAPTCHA is required
const CAPTCHA_THRESHOLD = 2; 

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user, bootstrapped } = useAuth();
  const { license, loading: licenseLoading, refresh } = useLicense();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showLicenseModal, setShowLicenseModal] = useState(true);

  // --- CAPTCHA STATES ---
  // Initialize failed attempts from sessionStorage to prevent page-refresh bypass
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    return parseInt(sessionStorage.getItem("failedLoginAttempts") || "0", 10);
  });
  const [captchaCode, setCaptchaCode] = useState<string>("");
  const [captchaInput, setCaptchaInput] = useState<string>("");

  const licenseExpired = license?.status === "EXPIRED";
  const isCaptchaRequired = failedAttempts >= CAPTCHA_THRESHOLD;

  // Function to generate a random 6-character CAPTCHA
  const generateCaptcha = () => {
    // Removed confusing characters like 0, O, I, l, 1
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(result);
    setCaptchaInput(""); // Clear previous input
  };

  // Trigger CAPTCHA generation if threshold is met
  useEffect(() => {
    sessionStorage.setItem("failedLoginAttempts", failedAttempts.toString());
    if (failedAttempts >= CAPTCHA_THRESHOLD && !captchaCode) {
      generateCaptcha();
    }
  }, [failedAttempts, captchaCode]);

  if (!bootstrapped || licenseLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  if (user) {
    const path =
      {
        admin: "/admin",
        engineer: "/engineer",
        customer: "/customer",
      }[user.role] || "/";

    return <Navigate to={path} replace />;
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });

    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // HARD BLOCK if license expired
    if (licenseExpired) {
      setError(
        "License expired. Contact AIMLSN YatharthataLIMS System Administrator."
      );
      return;
    }

    // VALIDATE CAPTCHA if required
    if (isCaptchaRequired) {
      if (captchaInput !== captchaCode) {
        setError("Incorrect CAPTCHA code. Please try again.");
        generateCaptcha(); // Regenerate a new code on failure
        return;
      }
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const formData = new URLSearchParams();
      formData.append("username", form.email);
      formData.append("password", form.password);

      const response = await api.post<LoginResponse>(
        ENDPOINTS.AUTH.LOGIN,
        formData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const loginData = response.data;

      const userInfo: User = {
        user_id: loginData.user_id,
        customer_id: loginData.customer_id || null,
        username: loginData.username,
        email: loginData.email,
        full_name: loginData.full_name,
        role: loginData.role as UserRole,
        token: loginData.access_token,
        refresh_token: loginData.refresh_token,
        is_active: loginData.is_active,
      };

      // Reset failed attempts on success
      sessionStorage.removeItem("failedLoginAttempts");
      setFailedAttempts(0);

      setSuccess("Login successful! Redirecting...");
      login(userInfo);

      const params = new URLSearchParams(location.search);
      const redirectPath = params.get("redirect");

      setTimeout(() => {
        if (redirectPath) {
          navigate(redirectPath, { replace: true });
        } else {
          const defaultPath =
            {
              admin: "/admin",
              engineer: "/engineer",
              customer: "/customer",
            }[userInfo.role] || "/";

          navigate(defaultPath, { replace: true });
        }
      }, 500);
    } catch (err: any) {
      // Increment failed attempts
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      
      // If CAPTCHA was already showing, generate a new one for the next try
      if (newAttempts >= CAPTCHA_THRESHOLD) {
        generateCaptcha();
      }

      const errorMessage =
        err.response?.data?.detail ||
        "Login failed. Please check your credentials.";

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {license &&
        license.status !== "ACTIVE" &&
        showLicenseModal && (
          <LicenseModal
            status={license.status}
            validUntil={license.valid_until}
            onExtended={async (newDate) => {
              await refresh();
              setSuccess(
                `License extended successfully till ${newDate}`
              );
              setShowLicenseModal(false);
            }}
            onClose={() => setShowLicenseModal(false)}
          />
        )}

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">

          {/* Shiny Text Above Login Card */}
          <div className="text-center">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              <ShinyText
                text="Yatharthata LIMS"
                speed={3}
                shineColor="#ffffff"
                color="transparent"
                spread={130}
                direction="left"
                pauseOnHover={false}
                yoyo={true}
              />
            </div>
          </div>

          {/* Login Card */}
          <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Welcome Back
              </h2>

              <p className="mt-2 text-gray-600">
                Sign in to your account
              </p>
            </div>

            <form
              className="mt-8 space-y-6"
              onSubmit={handleSubmit}
            >
              {/* Email */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <Mail className="h-5 w-5" />
                </span>

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="Email address"
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                />
              </div>

              {/* Password */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                  <Lock className="h-5 w-5" />
                </span>

                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Password"
                  className="appearance-none block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>

              {/* Forgot Password */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={() =>
                    navigate("/forgot-password")
                  }
                  className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-500 transition-colors font-medium"
                >
                  <HelpCircle className="w-4 h-4 mr-1" />
                  Forgot password?
                </button>
              </div>

              {/* --- DYNAMIC CAPTCHA SECTION --- */}
              {isCaptchaRequired && (
                <div className="space-y-3 pt-2 border-t border-gray-100 animate-fadeIn">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Security Check Required
                  </label>
                  
                  <div className="flex items-center space-x-3">
                    {/* Captcha Display Box */}
                    <div 
                      className="flex-1 bg-gradient-to-r from-gray-100 via-indigo-50 to-gray-200 border border-gray-300 rounded-lg p-2.5 text-center select-none relative overflow-hidden"
                      onCopy={(e) => e.preventDefault()} // Prevent copying
                    >
                      {/* Strikethrough line for bot confusion */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-full h-0.5 bg-indigo-300/60 transform -rotate-3"></div>
                      </div>
                      <span className="font-mono text-xl font-bold tracking-[0.35em] text-indigo-900 italic drop-shadow-sm">
                        {captchaCode}
                      </span>
                    </div>

                    {/* Refresh Captcha Button */}
                    <button
                      type="button"
                      onClick={generateCaptcha}
                      title="Generate new code"
                      className="p-3 text-gray-500 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 rounded-lg border border-gray-200 transition-colors"
                    >
                      <RefreshCw className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Captcha Input */}
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                    <input
                      type="text"
                      required
                      value={captchaInput}
                      onChange={(e) => {
                        setCaptchaInput(e.target.value);
                        setError("");
                      }}
                      placeholder="Enter the code shown above"
                      className="appearance-none block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-red-800 text-sm">
                    {error}
                  </p>
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-green-800 text-sm">
                    {success}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={
                  loading ||
                  !form.email ||
                  !form.password ||
                  licenseExpired ||
                  (isCaptchaRequired && !captchaInput) // Disable if Captcha is required but empty
                }
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                      <ArrowRight className="h-5 w-5 text-indigo-300 group-hover:text-indigo-200" />
                    </span>
                    Sign In
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;