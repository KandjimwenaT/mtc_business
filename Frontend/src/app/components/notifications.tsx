import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Card,
  CardContent,
  Button,
  Input,
  cn,
} from "./ui-components";
import {
  Bell,
  BellOff,
  Search,
  Ticket,
  AlertTriangle,
  CalendarCheck,
  Star,
  Car,
  Clock,
  CheckCircle2,
  ChevronRight,
  MailOpen,
  Loader2,
} from "lucide-react";
import { getCurrentUser } from "../api/authApi";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
} from "../api/notificationsApi";

type NotifType = "ticket" | "sla" | "escalation" | "visit" | "rating" | "vehicle";
type NotifFilter = "all" | NotifType;

const typeConfig: Record<NotifType, { icon: typeof Bell; label: string; color: string }> = {
  ticket: { icon: Ticket, label: "Tickets", color: "text-mtc-blue" },
  sla: { icon: Clock, label: "SLA Warnings", color: "text-blue-500" },
  escalation: { icon: AlertTriangle, label: "Escalations", color: "text-red-500" },
  visit: { icon: CalendarCheck, label: "Visits", color: "text-emerald-500" },
  rating: { icon: Star, label: "Ratings", color: "text-purple-500" },
  vehicle: { icon: Car, label: "Vehicles", color: "text-slate-500" },
};

export default function Notifications() {
  const [filter, setFilter] = useState<NotifFilter>("all");
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const data = await getNotifications();
        setNotifications(data);
      } catch (err: any) {
        setError(err.message || "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const filtered = useMemo(
    () =>
      notifications.filter((n) => {
        const type = String(n.type) as NotifType;
        const matchesFilter = filter === "all" || type === filter;
        const matchesSearch =
          search === "" ||
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          n.message.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
      }),
    [notifications, filter, search]
  );

  const markAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markAsRead = async (id: number) => {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.notificationId === id ? { ...n, read: true } : n))
    );
  };

  const visitRouteByRole = () => {
    if (currentUser?.role === "customer") return "/visitCalendar";
    if (currentUser?.role === "executive_staff") return "/executive-visits";
    if (currentUser?.role === "manager" || currentUser?.role === "supervisor") return "/manager-visits";
    return "/visits";
  };

  const handleNotifClick = async (notif: NotificationRecord) => {
    if (!notif.read) {
      await markAsRead(notif.notificationId);
    }

    const metadata = (notif.metadata || {}) as Record<string, unknown>;
    const ticketId = Number(metadata.ticketId);
    const visitId = Number(metadata.visitId);

    if ((notif.type === "ticket" || notif.type === "escalation" || notif.type === "sla") && Number.isFinite(ticketId)) {
      navigate(`/tickets/${ticketId}`);
      return;
    }
    if (notif.type === "visit" && Number.isFinite(visitId)) {
      navigate(visitRouteByRole());
      return;
    }
    if (notif.type === "visit" || notif.type === "rating") {
      navigate(visitRouteByRole());
      return;
    }
    if (notif.type === "vehicle") {
      navigate("/vehicles");
      return;
    }

    if (currentUser?.role === "customer") {
      navigate("/customerTickets");
      return;
    }
    navigate("/dashboard");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading notifications...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="py-12">
        <CardContent className="flex flex-col items-center justify-center text-center">
          <BellOff className="h-10 w-10 text-slate-300 mb-3" />
          <h3 className="text-lg font-semibold text-slate-700">Unable to load notifications</h3>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Notification Center</h2>
          <p className="text-sm text-slate-500">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
              : "All caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Mark All Read
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            className="pl-9"
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              filter === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            All ({notifications.length})
          </button>
          {(Object.keys(typeConfig) as NotifType[]).map((type) => {
            const count = notifications.filter((n) => String(n.type) === type).length;
            return (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                  filter === type
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                {typeConfig[type].label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <BellOff className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-500">No notifications found</h3>
              <p className="text-sm text-slate-400 mt-1">
                {search ? "Try adjusting your search." : "You're all caught up!"}
              </p>
            </CardContent>
          </Card>
        )}

        {filtered.map((notif) => {
          const notifType = String(notif.type) as NotifType;
          const config = typeConfig[notifType] || typeConfig.ticket;
          const Icon = config.icon;
          return (
            <div
              key={notif.notificationId}
              onClick={() => void handleNotifClick(notif)}
              className={cn(
                "flex items-start gap-4 p-4 rounded-lg border transition-colors cursor-pointer group",
                notif.read
                  ? "bg-white border-slate-200 hover:bg-slate-50"
                  : "bg-mtc-blue-50/40 border-mtc-blue-100 hover:bg-mtc-blue-50/60",
                notif.priority === "critical" && !notif.read && "border-l-4 border-l-red-500",
                notif.priority === "high" && !notif.read && "border-l-4 border-l-blue-500"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  notif.priority === "critical"
                    ? "bg-red-100"
                    : notif.priority === "high"
                    ? "bg-blue-100"
                    : "bg-slate-100"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    notif.priority === "critical"
                      ? "text-red-500"
                      : notif.priority === "high"
                      ? "text-blue-500"
                      : config.color
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "text-sm",
                      notif.read ? "font-medium text-slate-700" : "font-semibold text-slate-900"
                    )}
                  >
                    {notif.title}
                  </span>
                  {!notif.read && (
                    <span className="h-2 w-2 rounded-full bg-mtc-blue shrink-0" />
                  )}
                </div>
                <p className="text-sm text-slate-500 line-clamp-2">{notif.message}</p>
                <span className="text-xs text-slate-400 mt-1 block">
                  {formatDistanceToNowStrict(new Date(notif.createdAt), { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!notif.read) {
                      await markAsRead(notif.notificationId);
                    }
                  }}
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                  title="Mark read"
                >
                  <MailOpen className="h-4 w-4" />
                </button>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}