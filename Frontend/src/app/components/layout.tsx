import { Outlet, NavLink, useNavigate, useLocation } from "react-router";
import { 
  Building2, 
  LayoutDashboard, 
  Ticket, 
  CalendarCheck, 
  Timer, 
  Car, 
  Bell, 
  UserCircle,
  Menu,
  X,
   Star,
   CalendarDays,
   FileText,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "./ui-components";
import { ThemeIcon } from "./theme-icon";
import mtcLogo from "../../assets/logo.png";
import dashboardIcon from "../../assets/New Theme Icon/layout-dashboard.svg";
import corporatesIcon from "../../assets/New Theme Icon/building-2.svg";
import ticketsIcon from "../../assets/New Theme Icon/tickets.svg";
import bellIcon from "../../assets/New Theme Icon/bell.svg";
import profileIcon from "../../assets/New Theme Icon/circle-user-round.svg";
import logOutIcon from "../../assets/New Theme Icon/log-out.svg";
import chevronRightIcon from "../../assets/New Theme Icon/chevron-right.svg";
import chevronDownIcon from "../../assets/New Theme Icon/chevron-down.svg";
import { logoutUser, getActualRole, getCurrentUser, getMyProfile, setViewAsRole } from "../api/authApi";
import { getUnreadNotificationCount } from "../api/notificationsApi";
import { profileIsEbu } from "../utils/departmentSegment";
import { isExecutiveRole, isGmRole, isManagerRole, isPortalAdminRole, isSupervisorRole } from "../utils/roleCapabilities";
import { useSupervisorHybridBadges } from "../hooks/useSupervisorHybridBadges";
import { ExecutiveDataProvider } from "../hooks/useExecutiveData";
import { LiveUpdatesProvider } from "../realtime/LiveUpdatesProvider";

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [viewAsTick, setViewAsTick] = useState(0);
  const supervisorBadges = useSupervisorHybridBadges();
  const currentUser = getCurrentUser();
  void viewAsTick;
  const [showLeadsTab, setShowLeadsTab] = useState(false);
  const isCustomer = currentUser?.role === "customer";
  const isSupervisor = isSupervisorRole(currentUser?.role);
  const hasExecutiveScope = isExecutiveRole(currentUser?.role);
  const isExecutiveStaff = currentUser?.role === "executive_staff";
  const hasManagerScope = isManagerRole(currentUser?.role);
  const isGm = isGmRole(currentUser?.role);
  const isPortalAdmin = isPortalAdminRole(currentUser?.role);
  const signedInAsSuperAdmin = currentUser?.actualRole === "super_admin" || getActualRole() === "super_admin";

  useEffect(() => {
    getMyProfile().catch(() => {});
  }, []);

  useEffect(() => {
    const onViewAs = () => setViewAsTick((tick) => tick + 1);
    window.addEventListener("view-as-role", onViewAs);
    return () => window.removeEventListener("view-as-role", onViewAs);
  }, []);

  useEffect(() => {
    if (signedInAsSuperAdmin && (hasManagerScope || isExecutiveStaff)) {
      setShowLeadsTab(true);
      return;
    }
    if (isCustomer || (!hasManagerScope && !isExecutiveStaff)) {
      setShowLeadsTab(false);
      return;
    }
    let cancelled = false;
    getMyProfile()
      .then((profile) => {
        if (!cancelled) setShowLeadsTab(profileIsEbu(profile));
      })
      .catch(() => {
        if (!cancelled) setShowLeadsTab(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCustomer, hasManagerScope, isExecutiveStaff, signedInAsSuperAdmin]);
  const notificationsHref =
    hasExecutiveScope ? "/executive-notifications" : "/notifications";

  useEffect(() => {
    const run = async () => {
      try {
        const count = await getUnreadNotificationCount();
        setUnreadCount(count);
      } catch {
        setUnreadCount(0);
      }
    };
    void run();

    const handleNotificationsChanged = () => {
      void run();
    };
    const handleFocus = () => {
      void run();
    };
    window.addEventListener("notifications:changed", handleNotificationsChanged);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("notifications:changed", handleNotificationsChanged);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    navigate("/", { replace: true });
  };

  const profileHref =

    currentUser?.role === "super_admin" ? "/super-admin-profile" :
    currentUser?.role === "admin" ? "/admin-profile" :
    currentUser?.role === "customer" ? "/account-manager-profile" :
    isSupervisor ? "/supervisor-profile" :
    hasManagerScope ? "/management-profile" :
    currentUser?.role === "gm" ? "/gm-crm-profile" :
    hasExecutiveScope ? "/executive-profile" :
    "/dashboard";

  const navigation = isCustomer
    ? [
        { name: "Customer Account", href: "/customerAccount", icon: Star },
        { name: "Tickets", href: "/customerTickets", icon: Ticket },
        { name: "Visit Calendar", href: "/visitCalendar", icon: CalendarDays },
        { name: "Notifications", href: "/notifications", icon: Bell },
        { name: "My Profile", href: profileHref, icon: UserCircle },
      ]
    : [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        ...(showLeadsTab && hasManagerScope
          ? [{ name: "Leads", href: "/manager-leads", icon: FileText }]
          : []),
        ...(showLeadsTab && isExecutiveStaff
          ? [{ name: "Leads", href: "/executive-leads", icon: FileText }]
          : []),
        {
          name: isPortalAdmin ? "Admin Corporates" : "Corporates",
          href: isPortalAdmin ? "/admin-corporates" : "/corporates",
          icon: Building2,
        },
        { name: "Tickets", href: isSupervisor ? "/tickets" : hasExecutiveScope ? "/executive-tickets" : "/tickets", icon: Ticket },
        ...(!isPortalAdmin
          ? [{ name: "Visits", href: isGm || isSupervisor ? "/manager-visits" : hasExecutiveScope ? "/executive-visits" : hasManagerScope ? "/manager-visits" : "/visits", icon: CalendarCheck }]
          : []),
        ...(!hasExecutiveScope && !isPortalAdmin
          ? [{ name: "SLA Monitoring", href: "/sla-monitoring", icon: Timer }]
          : []),
        ...(!isPortalAdmin ? [{ name: "Vehicles", href: "/vehicles", icon: Car }] : []),
        { name: "Notifications", href: notificationsHref, icon: Bell },
        { name: "My Profile", href: profileHref, icon: UserCircle },
      ];

  const navIcons: Record<string, string> = {
    Dashboard: dashboardIcon,
    Corporates: corporatesIcon,
    "Admin Corporates": corporatesIcon,
    "Customer Account": corporatesIcon,
    Tickets: ticketsIcon,
    Notifications: bellIcon,
    "My Profile": profileIcon,
  };

  const pageName =
    navigation.find((item) => location.pathname.startsWith(item.href))?.name || "Dashboard";
  const roleLabel = currentUser?.role?.replace(/_/g, " ") ?? "—";
  const displayName = currentUser?.firstName ?? "User";
  const initial = displayName.trim().charAt(0).toUpperCase() || "U";

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans text-foreground">
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-mtc-dark/50 z-40 sm:hidden" 
          onClick={() => setMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <div className={`${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} sm:translate-x-0 fixed sm:static inset-y-0 left-0 z-50 w-60 flex-col bg-mtc-blue shadow-md flex transition-transform duration-200`}>
        <div className="flex h-16 shrink-0 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <img src={mtcLogo} alt="MTC Logo" className="h-7 w-7 rounded-md object-cover" />
            <span className="text-lg font-bold tracking-tight text-white">MTC Portal</span>
          </div>
          <button 
            className="sm:hidden text-slate-400 hover:text-white"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto px-3.5">
          <p className="px-3 pb-1.5 text-[10px] font-semibold tracking-wide text-white/70">WORKSPACE</p>
          <nav className="flex-1 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href) && (item.href !== "/" || location.pathname === "/");
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "group flex h-10 items-center gap-2.5 rounded-lg px-3 text-xs transition-colors",
                    isActive
                      ? "bg-white font-semibold text-mtc-blue"
                      : "font-medium text-white/85 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {navIcons[item.name] ? (
                    <ThemeIcon
                      src={navIcons[item.name]}
                      className={cn("h-4 w-4", isActive ? "text-mtc-blue" : "text-white")}
                    />
                  ) : (
                    <item.icon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        isActive ? "text-mtc-blue" : "text-white group-hover:text-white"
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex flex-1 items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{item.name}</span>
                    {isSupervisor && item.name === "Tickets" && supervisorBadges.ticketsNavDot && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                        title="Open or at-risk items on your tickets views"
                        aria-hidden
                      />
                    )}
                    {isSupervisor && item.name === "Visits" && supervisorBadges.visitsNavDot && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                        title="Open or at-risk items on your visits views"
                        aria-hidden
                      />
                    )}
                  </span>
                </NavLink>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-4 px-3.5 pb-5">
          <div className="h-px bg-white/25" />
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{displayName}</p>
              <p className="truncate text-xs font-normal capitalize text-white/75">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-normal text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ThemeIcon src={logOutIcon} className="h-4 w-4 text-white/80" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 sm:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2.5 text-xs text-slate-500">
              <span className="shrink-0">Workspace</span>
              <ThemeIcon src={chevronRightIcon} className="h-3 w-3 shrink-0 text-slate-500" />
              <span className="truncate font-semibold text-slate-800">{pageName}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-5">
            {signedInAsSuperAdmin && (
              <label className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
                View as
                <select
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
                  value={currentUser?.viewAsRole || ""}
                  onChange={(event) => {
                    const next = event.target.value || null;
                    setViewAsRole(next);
                    setViewAsTick((tick) => tick + 1);
                    navigate("/dashboard");
                  }}
                >
                  <option value="">Super Admin</option>
                  <option value="gm">GM</option>
                  <option value="manager">Manager</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="executive_staff">Executive</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            )}
            <span className="hidden rounded-md bg-indigo-50 px-2 py-[5px] text-xs font-semibold text-sky-700 sm:inline-flex">
              Role: <span className="ml-1 capitalize">{roleLabel}</span>
            </span>
            <button
              className="relative text-slate-500 hover:text-slate-800 focus:outline-none"
              onClick={() => navigate(notificationsHref)}
            >
              <span className="sr-only">View notifications</span>
              <ThemeIcon src={bellIcon} className="h-5 w-5 text-slate-500" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
              )}
            </button>
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <button
              type="button"
              onClick={() => navigate(profileHref)}
              className="flex items-center gap-2 text-left"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-sky-700">
                {initial}
              </span>
              <span className="hidden text-xs font-medium text-slate-800 md:inline">{displayName}</span>
              <ThemeIcon src={chevronDownIcon} className="hidden h-3.5 w-3.5 text-slate-500 md:block" />
            </button>
          </div>
        </header>

        {/* Main Content Scrollable Area */}
        <main className="flex-1 overflow-y-auto bg-slate-100 px-4 py-6 sm:px-8">
          <div className="mx-auto w-full">
             <LiveUpdatesProvider>
               <ExecutiveDataProvider>
                 <Outlet context={{ role: currentUser?.role ?? "", supervisorBadges }} />
               </ExecutiveDataProvider>
             </LiveUpdatesProvider>
          </div>
        </main>
      </div>
    </div>
  );
}