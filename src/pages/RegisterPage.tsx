import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import {
  EnvelopeIcon,
  KeyIcon,
  UserIcon,
  PhoneIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitType, setSubmitType] = useState<"success" | "error" | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derived state to control modal visibility
  const showSuccessModal = submitType === "success";

  const registerStudent = async () => {
    if (isSubmitting) return;

    setSubmitMessage("");
    setSubmitType("");
    setIsSubmitting(true);

    try {
      if (!code.trim() || !fullName.trim() || !phone.trim() || !email.trim() || !password.trim()) {
        throw new Error("Please fill out all fields including enrollment code, name, phone, email, and password.");
      }

      setSubmitMessage("Creating your account...");

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            enrollment_code: code.trim(),
          },
        },
      });

      if (error) {
        console.error("Supabase signUp error:", error);
        throw error;
      }

      if (!data?.user) {
        throw new Error("User creation failed. Please check your email and try again.");
      }

      // Clear form
      setCode("");
      setFullName("");
      setPhone("");
      setEmail("");
      setPassword("");
      // Set success state – this will trigger the modal
      setSubmitMessage("Registration successful! Please check your email for confirmation.");
      setSubmitType("success");
    } catch (err: any) {
      console.error("CRITICAL REGISTRATION ERROR:", err);
      setSubmitMessage(err.message || "Something went wrong. Please try again.");
      setSubmitType("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex justify-center items-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10 animate-pulse" />

      <div className="w-full max-w-md px-4 relative z-10">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8 space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <img
              src="/cyberlogo.png"
              alt="CyberBill Academy Logo"
              className="h-45 w-auto drop-shadow-lg"
            />
          </div>

          <h1 className="text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
            Create Account
          </h1>
          <p className="text-sm text-center text-gray-300">
            Join CyberBill Academy today
          </p>

          {/* Error message (only shown for errors, success is modal) */}
          {submitMessage && submitType === "error" && (
            <div className="bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
              <span className="inline-block w-1.5 h-1.5 bg-red-400 rounded-full" />
              {submitMessage}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              registerStudent();
            }}
            className="space-y-4"
          >
            {/* Enrollment Code */}
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-200 mb-1">
                Enrollment Code
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="code"
                  type="text"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition"
                  placeholder="e.g. CBA-2025-001"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-200 mb-1">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="full_name"
                  type="text"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition"
                  placeholder="Ifeanyi Barth"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="phone_number" className="block text-sm font-medium text-gray-200 mb-1">
                Phone Number
              </label>
              <div className="relative">
                <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="phone_number"
                  type="text"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition"
                  placeholder="+234 801 234 5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-200 mb-1">
                Email Address
              </label>
              <div className="relative">
                <EnvelopeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="text"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-200 mb-1">
                Password
              </label>
              <div className="relative">
                <KeyIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="w-full pl-10 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold py-3 px-4 rounded-xl transition duration-200 ease-in-out shadow-lg hover:shadow-cyan-500/30 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Registering...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <p className="text-sm text-gray-400 text-center">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-cyan-400 hover:text-cyan-300 hover:underline font-semibold transition"
            >
              Login here
            </Link>
          </p>
        </div>
      </div>

      {/* ✅ SUCCESS MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center space-y-6">
            <div className="flex justify-center">
              <CheckCircleIcon className="h-20 w-20 text-emerald-400 drop-shadow-lg" />
            </div>
            <h2 className="text-2xl font-bold text-white">Congratulations!</h2>
            <p className="text-gray-300 text-sm">
              Your registration was successful. Please Proceed to Slog in to your account.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-500 hover:to-cyan-600 text-white font-semibold py-3 px-4 rounded-xl transition duration-200 ease-in-out shadow-lg hover:shadow-emerald-500/30"
            >
              Log in now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}