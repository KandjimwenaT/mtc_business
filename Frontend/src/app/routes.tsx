import { createBrowserRouter, Navigate, Outlet, useOutletContext } from "react-router";
import Layout from "./components/layout";
import Dashboard from "./components/dashboard";
import Login from "./view/login";
import Tickets from "./components/tickets";
import TicketDetails from "./components/ticket-details";
import Visits from "./components/visits";
import SLAMonitoring from "./components/sla-monitoring";
import Corporates from "./components/corporates";
import Vehicles from "./components/vehicles";
import Notifications from "./components/notifications";
import NotFound from "./components/not-found";
import { CustomerAccount } from "./components/customer/customerAccount";
import { VisitCalendar } from "./components/customer/VisitCalendar";
import SuperAdminProfile from "./profiles/super-admin-profile";
import AccountManagerProfile from "./profiles/account-manager-profile";
import GMCRMProfile from "./profiles/gm-crm-profile";
import BackOfficeProfile from "./profiles/back-office-profile";
import ExecutiveProfile from "./profiles/executive-profile";
import ManagementProfile from "./profiles/management-profile";
import SupervisorProfile from "./profiles/supervisor-profile";
import CustomerTickets from "./components/customer/CustomerTickets";
import ExecutiveTickets from "./components/executive/ExecutiveTickets";
import ExecutiveVisits from "./components/executive/ExecutiveVisits";
import ExecutiveDashboard from "./components/executive/ExecutiveDashboard";
import ManagerVisits from "./components/manager/ManagerVisits";
import ManagerDashboard from "./components/manager/ManagerDashboard";
import GmDashboard from "./components/gm/GmDashboard";
import ForgotPassword from "./view/forgot-password";
import AdminCorporate from "./components/admin/adminCorporate";
import { isExecutiveRole, isGmRole, isManagerRole, isSupervisorRole } from "./utils/roleCapabilities";
import { hasValidSession } from "./auth/session";
import { useSessionWatch } from "./auth/useSessionWatch";

const isAuthenticated = () => hasValidSession();

const getCurrentRole = (): string | null => {
  try {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");
    return user?.role ?? null;
  } catch {
    return null;
  }
};

const RequireAuth = () => {
  const outletContext = useOutletContext();
  useSessionWatch();
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <Outlet context={outletContext} />;
};

const RequireRole = ({ allowed }: { allowed: string[] }) => {
  const outletContext = useOutletContext();
  const role = getCurrentRole();
  if (!role || !allowed.includes(role)) {
    return role === "customer"
      ? <Navigate to="/customerAccount" replace />
      : <Navigate to="/dashboard" replace />;
  }
  return <Outlet context={outletContext} />;
};

const LoginEntry = () => {
  if (isAuthenticated()) {
    return getCurrentRole() === "customer"
      ? <Navigate to="/customerAccount" replace />
      : <Navigate to="/dashboard" replace />;
  }
  return <Login />;
};

const StaffDashboardEntry = () => {
  const role = getCurrentRole();
  if (isGmRole(role)) return <GmDashboard />;
  if (isSupervisorRole(role) || isManagerRole(role)) return <ManagerDashboard />;
  if (isExecutiveRole(role)) return <ExecutiveDashboard />;
  return <Dashboard />;
};

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LoginEntry />,
  },
  {
    path: "/login",
    element: <Navigate to="/" replace />,
  },
  {
    path: "/forgot-password",
    element: <ForgotPassword />,
  },
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      {
        Component: Layout,
        children: [
          // Shared inbox — single route so executive_staff is not caught by the customer-only branch first
          {
            element: (
              <RequireRole
                allowed={["customer", "admin", "executive_staff", "manager", "supervisor", "gm"]}
              />
            ),
            children: [{ path: "notifications", Component: Notifications }],
          },
          // Customer-only routes
          {
            element: <RequireRole allowed={["customer", "admin"]} />,
            children: [
              { path: "customerAccount", Component: CustomerAccount },
              { path: "customerTickets", Component: CustomerTickets },
              { path: "visitCalendar", Component: VisitCalendar },
              { path: "account-manager-profile", Component: AccountManagerProfile },
            ],
          },
          // Admin-only corporates route (separate page)
          {
            element: <RequireRole allowed={["admin"]} />,
            children: [{ path: "admin-corporates", Component: AdminCorporate }],
          },
          // Staff / admin routes
          {
            element: <RequireRole allowed={["admin", "executive_staff", "manager", "supervisor", "gm"]} />,
            children: [
              { path: "dashboard", Component: StaffDashboardEntry },
              { path: "corporates", Component: Corporates },
              { path: "tickets", Component: Tickets },
              { path: "tickets/:id", Component: TicketDetails },
              { path: "control-cards", element: <Navigate to="/visits" replace /> },
              { path: "super-admin-profile", Component: SuperAdminProfile },
              { path: "account-manager-profile", Component: AccountManagerProfile },
              { path: "gm-crm-profile", Component: GMCRMProfile },
              { path: "back-office-profile", Component: BackOfficeProfile },
              { path: "executive-profile", Component: ExecutiveProfile },
              { path: "supervisor-profile", Component: SupervisorProfile },
            ],
          },
          // SLA & Admin — not for executive_staff
          {
            element: <RequireRole allowed={["gm", "manager", "supervisor"]} />,
            children: [
              { path: "sla-monitoring", Component: SLAMonitoring },
            ],
          },
          // Visits and Vehicles — not for admin
          {
            element: <RequireRole allowed={["executive_staff", "manager", "supervisor", "gm"]} />,
            children: [
              { path: "visits", Component: Visits },
              { path: "vehicles", Component: Vehicles },
            ],
          },
          // Manager / Super Admin only
          {
            element: <RequireRole allowed={["admin", "manager", "supervisor", "gm"]} />,
            children: [
              { path: "management-profile", Component: ManagementProfile },
              { path: "manager-visits", Component: ManagerVisits },
           
            ],
          },

          // exucutive staff only
          {
            element: <RequireRole allowed={["admin", "executive_staff", "supervisor"]} />,
            children: [

              { path: "executive-profile", Component: ExecutiveProfile },
              { path: "executive-tickets", Component: ExecutiveTickets },
              { path: "executive-visits", Component: ExecutiveVisits },
              { path: "executive-notifications", Component: Notifications },

            ],
          },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);
