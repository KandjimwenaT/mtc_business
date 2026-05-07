import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Badge,
  cn,
} from "./ui-components";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
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
  Megaphone,
} from "lucide-react";
import { getCurrentUser } from "../api/authApi";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  broadcastManagerNotification,
  resolveNotificationAttachmentUrl,
  type NotificationRecord,
} from "../api/notificationsApi";

type NotifType = "ticket" | "sla" | "escalation" | "visit" | "rating" | "vehicle" | "broadcast";
type NotifFilter = "all" | NotifType;

function broadcastAudienceLabel(meta: Record<string, unknown>): string {
  const a = String(meta.audience || "").toLowerCase();
  if (a === "customers") return "Customers";
  if (a === "executives") return "Executives";
  return "Announcement";
}

function normalizedNotificationType(raw: unknown): string {
  return String(raw ?? "").toLowerCase();
}

const typeConfig: Record<NotifType, { icon: typeof Bell; label: string; color: string }> = {
  ticket: { icon: Ticket, label: "Tickets", color: "text-mtc-blue" },
  sla: { icon: Clock, label: "SLA Warnings", color: "text-blue-500" },
  escalation: { icon: AlertTriangle, label: "Escalations", color: "text-red-500" },
  visit: { icon: CalendarCheck, label: "Visits", color: "text-emerald-500" },
  rating: { icon: Star, label: "Ratings", color: "text-purple-500" },
  vehicle: { icon: Car, label: "Vehicles", color: "text-slate-500" },
  broadcast: { icon: Megaphone, label: "Announcements", color: "text-amber-600" },
};

export default function Notifications() {
  const [filter, setFilter] = useState<NotifFilter>("all");
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState<"customers" | "executives">("customers");
  const [broadcastFile, setBroadcastFile] = useState<File | null>(null);
  const [broadcastSubmitting, setBroadcastSubmitting] = useState(false);
  const [broadcastFeedback, setBroadcastFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastDetailOpen, setBroadcastDetailOpen] = useState(false);
  const [broadcastDetailNotif, setBroadcastDetailNotif] = useState<NotificationRecord | null>(null);
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const isManager = currentUser?.role === "manager";

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
        const type = normalizedNotificationType(n.type) as NotifType;
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
    window.dispatchEvent(new Event("notifications:changed"));
  };

  const markAsRead = async (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.notificationId === id ? { ...n, read: true } : n))
    );
    window.dispatchEvent(new Event("notifications:changed"));
    await markNotificationRead(id);
  };

  const visitRouteByRole = () => {
    if (currentUser?.role === "customer") return "/visitCalendar";
    if (currentUser?.role === "executive_staff") return "/executive-visits";
    if (currentUser?.role === "manager" || currentUser?.role === "supervisor") return "/manager-visits";
    return "/visits";
  };

  const resolveNotificationPath = (notif: NotificationRecord) => {
    if (normalizedNotificationType(notif.type) === "broadcast") {
      return currentUser?.role === "executive_staff" ? "/executive-notifications" : "/notifications";
    }
    const metadata = (notif.metadata || {}) as Record<string, unknown>;
    const ticketId = Number(metadata.ticketId);
    const visitId = Number(metadata.visitId);

    if ((notif.type === "ticket" || notif.type === "escalation" || notif.type === "sla") && Number.isFinite(ticketId)) {
      return `/tickets/${ticketId}`;
    }

    if ((notif.type === "visit" || notif.type === "rating") && Number.isFinite(visitId)) {
      return `${visitRouteByRole()}?visitId=${visitId}`;
    }

    if (notif.type === "visit" || notif.type === "rating") {
      return visitRouteByRole();
    }

    if (notif.type === "vehicle") {
      return "/vehicles";
    }

    if (notif.type === "role") {
      return "/management-profile";
    }

    if (currentUser?.role === "customer") {
      return "/customerTickets";
    }
    return "/dashboard";
  };

  const handleNotifClick = async (notif: NotificationRecord) => {
    if (normalizedNotificationType(notif.type) === "broadcast") {
      if (!notif.read) {
        try {
          await markAsRead(notif.notificationId);
        } catch {
          // still open detail
        }
      }
      setBroadcastDetailNotif({ ...notif, read: true });
      setBroadcastDetailOpen(true);
      return;
    }
    if (!notif.read) {
      try {
        await markAsRead(notif.notificationId);
      } catch {
        // Do not block navigation if read-status update fails.
      }
    }
    navigate(resolveNotificationPath(notif));
  };

  const submitBroadcast = async () => {
    setBroadcastFeedback(null);
    const title = broadcastTitle.trim();
    const message = broadcastMessage.trim();
    if (!title || !message) {
      setBroadcastFeedback({ type: "err", text: "Title and message are required." });
      return;
    }
    try {
      setBroadcastSubmitting(true);
      const { recipientCount, message: apiMessage } = await broadcastManagerNotification({
        title,
        message,
        audience: broadcastAudience,
        attachment: broadcastFile,
      });
      setBroadcastTitle("");
      setBroadcastMessage("");
      setBroadcastAudience("customers");
      setBroadcastFile(null);
      const data = await getNotifications();
      setNotifications(data);
      window.dispatchEvent(new Event("notifications:changed"));
      setBroadcastModalOpen(false);
      setBroadcastFeedback(null);
      if (recipientCount === 0) {
        toast.warning("No recipients matched", {
          description:
            apiMessage ||
            "Ensure corporates are assigned to you, each corporate has an account manager contact, and that contact has a customer portal login. A copy was saved under Announcements.",
        });
      } else {
        toast.success("Announcement sent", {
          description: `Delivered to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}. A copy was added to your notifications.`,
        });
      }
    } catch (err: unknown) {
      setBroadcastFeedback({
        type: "err",
        text: err instanceof Error ? err.message : "Failed to send announcement",
      });
    } finally {
      setBroadcastSubmitting(false);
    }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Notification Center</h2>
          <p className="text-sm text-slate-500">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
              : "All caught up!"}
          </p>
        </div>
        {(isManager || unreadCount > 0) && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllRead} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Mark All Read
              </Button>
            )}
            {isManager && (
              <Button
                size="sm"
                onClick={() => {
                  setBroadcastFeedback(null);
                  setBroadcastModalOpen(true);
                }}
                className="flex items-center gap-2 bg-mtc-blue hover:bg-mtc-blue-light text-white"
              >
                <Megaphone className="h-4 w-4" />
                Create notification
              </Button>
            )}
          </div>
        )}
      </div>

      {isManager && (
        <Dialog
          open={broadcastModalOpen}
          onOpenChange={(open) => {
            setBroadcastModalOpen(open);
            if (!open) setBroadcastFeedback(null);
          }}
        >
          <DialogContent className="sm:max-w-lg max-h-[min(90vh,640px)] overflow-y-auto bg-white text-slate-900 border-slate-200">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <Megaphone className="h-5 w-5 text-mtc-blue" />
                Send announcement
              </DialogTitle>
              <DialogDescription className="text-slate-500">
                Broadcast to all portal customers on your corporates, or to all executives on your team.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <Label htmlFor="broadcast-title">Title</Label>
                <Input
                  id="broadcast-title"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="Short headline"
                  disabled={broadcastSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="broadcast-message">Message</Label>
                <textarea
                  id="broadcast-message"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Your message"
                  disabled={broadcastSubmitting}
                  rows={4}
                  className={cn(
                    "flex w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400",
                    "focus:outline-none focus:ring-2 focus:ring-mtc-blue disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Audience</Label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="broadcast-audience-modal"
                      checked={broadcastAudience === "customers"}
                      onChange={() => setBroadcastAudience("customers")}
                      disabled={broadcastSubmitting}
                      className="text-mtc-blue"
                    />
                    All customers (my corporates)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="broadcast-audience-modal"
                      checked={broadcastAudience === "executives"}
                      onChange={() => setBroadcastAudience("executives")}
                      disabled={broadcastSubmitting}
                      className="text-mtc-blue"
                    />
                    All executives (my team)
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="broadcast-file">Attachment (optional image)</Label>
                <Input
                  id="broadcast-file"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  disabled={broadcastSubmitting}
                  onChange={(e) => setBroadcastFile(e.target.files?.[0] ?? null)}
                  className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm"
                />
              </div>
              {broadcastFeedback && (
                <p
                  className={cn(
                    "text-sm",
                    broadcastFeedback.type === "ok" ? "text-emerald-700" : "text-red-600"
                  )}
                >
                  {broadcastFeedback.text}
                </p>
              )}
              <Button type="button" onClick={() => void submitBroadcast()} disabled={broadcastSubmitting} className="w-full sm:w-auto">
                {broadcastSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending…
                  </>
                ) : (
                  "Send announcement"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={broadcastDetailOpen}
        onOpenChange={(open) => {
          setBroadcastDetailOpen(open);
          if (!open) setBroadcastDetailNotif(null);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[min(90vh,720px)] overflow-y-auto bg-white text-slate-900 border-slate-200">
          {broadcastDetailNotif &&
            (() => {
              const meta = (broadcastDetailNotif.metadata || {}) as Record<string, unknown>;
              const detailAttachment = resolveNotificationAttachmentUrl(
                typeof meta.attachmentUrl === "string" ? meta.attachmentUrl : null
              );
              const sentByManager = meta.sentByManager === true;
              const sentRecipientCount = Number(meta.recipientCount);
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-slate-900 pr-8 text-left">{broadcastDetailNotif.title}</DialogTitle>
                    <div className="flex flex-wrap gap-2 items-center pt-1">
                      <Badge variant="neutral">{broadcastAudienceLabel(meta)}</Badge>
                      {sentByManager && <Badge variant="default">Sent by you</Badge>}
                      {sentByManager && Number.isFinite(sentRecipientCount) && (
                        <span className="text-xs text-slate-500">
                          {sentRecipientCount} recipient{sentRecipientCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </DialogHeader>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{broadcastDetailNotif.message}</div>
                  {detailAttachment && (
                    <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                      <img
                        src={detailAttachment}
                        alt=""
                        className="w-full max-h-[50vh] object-contain mx-auto"
                      />
                    </div>
                  )}
                  <p className="text-xs text-slate-400">
                    {formatDistanceToNowStrict(new Date(broadcastDetailNotif.createdAt), { addSuffix: true })}
                  </p>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>

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
            const count = notifications.filter((n) => normalizedNotificationType(n.type) === type).length;
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
          const notifType = normalizedNotificationType(notif.type) as NotifType;
          const config = typeConfig[notifType] || typeConfig.ticket;
          const Icon = config.icon;
          const meta = (notif.metadata || {}) as Record<string, unknown>;
          const attachmentSrc = resolveNotificationAttachmentUrl(
            typeof meta.attachmentUrl === "string" ? meta.attachmentUrl : null
          );
          const isBroadcast = normalizedNotificationType(notif.type) === "broadcast";
          return (
            <div
              key={notif.notificationId}
              onClick={() => void handleNotifClick(notif)}
              className={cn(
                "flex items-start gap-4 p-4 rounded-lg border transition-colors group",
                "cursor-pointer",
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
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={cn(
                      "text-sm",
                      notif.read ? "font-medium text-slate-700" : "font-semibold text-slate-900"
                    )}
                  >
                    {notif.title}
                  </span>
                  {isBroadcast && meta.sentByManager === true && (
                    <Badge variant="default" className="text-[10px] py-0">
                      Sent by you
                    </Badge>
                  )}
                  {!notif.read && (
                    <span className="h-2 w-2 rounded-full bg-mtc-blue shrink-0" />
                  )}
                </div>
                <p className="text-sm text-slate-500 line-clamp-2">{notif.message}</p>
                {attachmentSrc &&
                  (isBroadcast ? (
                    <div className="mt-2">
                      <img
                        src={attachmentSrc}
                        alt=""
                        className="max-h-20 rounded-md border border-slate-200 object-contain"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="mt-2 block max-w-full text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(attachmentSrc, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <img
                        src={attachmentSrc}
                        alt=""
                        className="max-h-24 rounded-md border border-slate-200 object-contain"
                      />
                    </button>
                  ))}
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