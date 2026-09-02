import { useEffect, useState } from "react";
import { Navigate, Outlet, useOutletContext } from "react-router";
import Login from "../view/login";
import ChangePassword from "../view/change-password";
import Dashboard from "../components/dashboard";
import ExecutiveDashboard from "../components/executive/ExecutiveDashboard";
import ManagerDashboard from "../components/manager/ManagerDashboard";
import GmDashboard from "../components/gm/GmDashboard";
import { getMyProfile } from "../api/authApi";
import { profileIsEbu } from "../utils/departmentSegment";
import { isExecutiveRole, isGmRole, isManagerRole, isSupervisorRole } from "../utils/roleCapabilities";
import { hasValidSession, needsPasswordChange } from "./session";
import { useSessionWatch } from "./useSessionWatch";

const isAuthenticated = () => hasValidSession();

const getCurrentRole = (): string | null => {
  try {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");
    return user?.role ?? null;
  } catch {
    return null;
  }
};

export const RequireAuth = () => {
  const outletContext = useOutletContext();
  useSessionWatch();
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  if (needsPasswordChange()) {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet context={outletContext} />;
};

export const RequireRole = ({ allowed }: { allowed: string[] }) => {
  const outletContext = useOutletContext();
  const role = getCurrentRole();
  if (!role || !allowed.includes(role)) {
    return role === "customer"
      ? <Navigate to="/customerAccount" replace />
      : <Navigate to="/dashboard" replace />;
  }
  return <Outlet context={outletContext} />;
};

/** Leads are an EBU-only feature. Key Accounts staff are sent to the dashboard. */
export const RequireEbu = () => {
  const outletContext = useOutletContext();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((profile) => {
        if (!cancelled) setAllowed(profileIsEbu(profile));
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (allowed === null) return null;
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <Outlet context={outletContext} />;
};

export const LoginEntry = () => {
  if (isAuthenticated()) {
    if (needsPasswordChange()) {
      return <Navigate to="/change-password" replace />;
    }
    return getCurrentRole() === "customer"
      ? <Navigate to="/customerAccount" replace />
      : <Navigate to="/dashboard" replace />;
  }
  return <Login />;
};

export const ChangePasswordEntry = () => {
  useSessionWatch();
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  if (!needsPasswordChange()) {
    return getCurrentRole() === "customer"
      ? <Navigate to="/customerAccount" replace />
      : <Navigate to="/dashboard" replace />;
  }
  return <ChangePassword />;
};

export const StaffDashboardEntry = () => {
  const role = getCurrentRole();
  if (isGmRole(role)) return <GmDashboard />;
  if (isSupervisorRole(role) || isManagerRole(role)) return <ManagerDashboard />;
  if (isExecutiveRole(role)) return <ExecutiveDashboard />;
  return <Dashboard />;
};
