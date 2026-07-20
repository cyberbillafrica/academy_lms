import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

interface ProtectedRouteProps {
  children: ReactNode;
  /**
   * Optional role gate. When provided, a signed-in user whose role is not in
   * this list is redirected to /dashboard (where DashboardPage renders the
   * correct view for their role). Omit it to allow any authenticated user.
   */
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const loading = useAuthStore((s) => s.loading);

  // Wait for initialize()/fetchProfile() to settle before deciding.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D1B4B]">
        <div className="h-10 w-10 rounded-full border-4 border-[#3AAA35] border-t-[#F47920] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(profile?.role ?? "")) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
