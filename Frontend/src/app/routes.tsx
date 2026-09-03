import { createBrowserRouter, Navigate } from "react-router";
import Layout from "./components/layout";
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
import ExecutiveLeads from "./components/executive/ExecutiveLeads";
import ManagementProfile from "./profiles/management-profile";
import SupervisorProfile from "./profiles/supervisor-profile";
import CustomerTickets from "./components/customer/CustomerTickets";
import ExecutiveTickets from "./components/executive/ExecutiveTickets";
import ExecutiveVisits from "./components/executive/ExecutiveVisits";
import ManagerVisits from "./components/manager/ManagerVisits";
import ManagerLeads from "./components/manager/ManagerLeads";
import ForgotPassword from "./view/forgot-password";
import AdminCorporate from "./components/admin/adminCorporate";
import {
  ChangePasswordEntry,
  LoginEntry,
  RequireAuth,
  RequireEbu,
  RequireRole,
  StaffDashboardEntry,
} from "./auth/routeGuards";

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
    path: "/change-password",
    element: <ChangePasswordEntry />,
  },
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      {
        Component: Layout,
        children: [
          {
            element: (
              <RequireRole
                allowed={["customer", "admin", "executive_staff", "manager", "supervisor", "gm"]}
              />
            ),
            children: [{ path: "notifications", Component: Notifications }],
          },
          {
            element: <RequireRole allowed={["customer", "admin"]} />,
            children: [
              { path: "customerAccount", Component: CustomerAccount },
              { path: "customerTickets", Component: CustomerTickets },
              { path: "visitCalendar", Component: VisitCalendar },
              { path: "account-manager-profile", Component: AccountManagerProfile },
            ],
          },
          {
            element: <RequireRole allowed={["admin"]} />,
            children: [{ path: "admin-corporates", Component: AdminCorporate }],
          },
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
          {
            element: <RequireRole allowed={["gm", "manager", "supervisor"]} />,
            children: [
              { path: "sla-monitoring", Component: SLAMonitoring },
            ],
          },
          {
            element: <RequireRole allowed={["executive_staff", "manager", "supervisor", "gm"]} />,
            children: [
              { path: "visits", Component: Visits },
              { path: "vehicles", Component: Vehicles },
            ],
          },
          {
            element: <RequireRole allowed={["admin", "manager", "supervisor", "gm"]} />,
            children: [
              { path: "management-profile", Component: ManagementProfile },
              { path: "manager-visits", Component: ManagerVisits },
            ],
          },
          {
            element: <RequireRole allowed={["admin", "manager", "supervisor", "gm"]} />,
            children: [
              {
                element: <RequireEbu />,
                children: [{ path: "manager-leads", Component: ManagerLeads }],
              },
            ],
          },
          {
            element: <RequireRole allowed={["admin", "executive_staff", "supervisor"]} />,
            children: [
              { path: "executive-profile", Component: ExecutiveProfile },
              { path: "executive-tickets", Component: ExecutiveTickets },
              { path: "executive-tickets/:id", Component: TicketDetails },
              { path: "executive-visits", Component: ExecutiveVisits },
              { path: "executive-notifications", Component: Notifications },
            ],
          },
          {
            element: <RequireRole allowed={["admin", "executive_staff", "supervisor"]} />,
            children: [
              {
                element: <RequireEbu />,
                children: [{ path: "executive-leads", Component: ExecutiveLeads }],
              },
            ],
          },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);
