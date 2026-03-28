import { Outlet, NavLink, useNavigate, useLocation } from "react-router";
import { 
  Building2, 
  LayoutDashboard, 
  Ticket, 
  CalendarCheck, 
  Timer, 
  Car, 
  Bell, 
  LogOut,
  UserCircle,
  Menu,
  X,
   Star,
   CalendarDays,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "./ui-components";
import mtcLogo from "../../assets/logo.png";
import { logoutUser, getCurrentUser } from "../api/authApi";
import { getUnreadNotificationCount } from "../api/notificationsApi";

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const currentUser = getCurrentUser();
  const isCustomer = currentUser?.role === "customer";
  const notificationsHref =
    currentUser?.role === "executive_staff" ? "/executive-notifications" : "/notifications";

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
  }, [location.pathname]);

  const handleLogout = async () => {
    await logoutUser();
    navigate("/", { replace: true });
  };

  const profileHref =

    currentUser?.role === "admin" ? "/super-admin-profile" :
    currentUser?.role === "customer" ? "/account-manager-profile" :
    currentUser?.role === "manager" || currentUser?.role === "supervisor" ? "/management-profile" :
    currentUser?.role === "gm" ? "/gm-crm-profile" :
    currentUser?.role === "executive_staff" ? "/executive-profile" :
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
        { name: "Corporates", href: "/corporates", icon: Building2 },
        { name: "Tickets", href: currentUser?.role === "executive_staff" ? "/executive-tickets" : "/tickets", icon: Ticket },
        ...(currentUser?.role !== "admin"
          ? [{ name: "Visits", href: currentUser?.role === "executive_staff" ? "/executive-visits" : (currentUser?.role === "manager" || currentUser?.role === "supervisor") ? "/manager-visits" : "/visits", icon: CalendarCheck }]
          : []),
        ...(currentUser?.role !== "executive_staff" && currentUser?.role !== "admin"
          ? [{ name: "SLA Monitoring", href: "/sla-monitoring", icon: Timer }]
          : []),
        ...(currentUser?.role !== "admin" ? [{ name: "Vehicles", href: "/vehicles", icon: Car }] : []),
        { name: "Notifications", href: notificationsHref, icon: Bell },
        { name: "My Profile", href: profileHref, icon: UserCircle },
      ];

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
      <div className={`${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} sm:translate-x-0 fixed sm:static inset-y-0 left-0 z-50 w-64 flex-col bg-mtc-blue shadow-md flex transition-transform duration-200`}>
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src={mtcLogo} alt="MTC Logo" className="h-8 w-8 rounded object-cover" />
            <span className="text-xl font-bold tracking-tight text-white">MTC Portal</span>
          </div>
          <button 
            className="sm:hidden text-slate-400 hover:text-white"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto pt-4">
          <nav className="flex-1 space-y-1 px-3">
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href) && (item.href !== "/" || location.pathname === "/");
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white text-mtc-blue"
                      : "text-white hover:bg-white/10 hover:text-white"
                  )}
                >
                  <item.icon
                    className={cn(
                      "mr-3 h-5 w-5 flex-shrink-0",
                      isActive ? "text-mtc-blue" : "text-white group-hover:text-white"
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </NavLink>
              );
            })}
          </nav>
        </div>
        <div className="border-t border-white/10 p-4">
          <button 
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-50 hover:bg-white/40 hover:text-mtc-blue transition-colors  border-slate-400 border justify-center bg-white/20"
          >
            <LogOut className="h-5 w-5 text-gray-40" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              className="sm:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-slate-800">
              {navigation.find(n => location.pathname.startsWith(n.href))?.name || "Dashboard"}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative flex items-center gap-2 border-r border-slate-200 pr-4">
               <label className="text-xs font-medium text-slate-500">Role:</label>
               <span className="text-sm font-medium text-slate-700 capitalize">
                 {currentUser?.role?.replace(/_/g, " ") ?? "—"}
               </span>
            </div>
            
            <button className="relative rounded-full p-1 text-slate-400 hover:text-slate-600 focus:outline-none" onClick={() => navigate(notificationsHref)}>
              <span className="sr-only">View notifications</span>
              <Bell className="h-6 w-6" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"></span>
              )}
            </button>
            <div className="flex items-center gap-2 pl-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                <UserCircle className="h-8 w-8" />
              </div>
              <div className="hidden flex-col md:flex">
                <span className="text-sm font-medium text-slate-700">{currentUser?.firstName ?? "User"}</span>
                <span className="text-xs text-slate-500">{currentUser?.role ?? "—"}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Scrollable Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl">
             <Outlet context={{ role: currentUser?.role ?? "" }} />
          </div>
        </main>
      </div>
    </div>
  );
}