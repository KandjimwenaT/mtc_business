import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui-components";
import {
  Calendar,
  CheckCircle,
  Search,
  Star,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  FileText,
  MessageSquare,
  Users,
  Eye,
  AlertTriangle,
  Download,
  Navigation,
  ClipboardList,
  Video,
  Lock,
} from "lucide-react";
import {
  getManagerVisits,
  getManagerControlCards,
  getPendingReschedules,
  approveReschedule,
  openStreetMapMeetingStartLink,
  type VisitRecord,
  type ControlCardRecord,
} from "../../api/visitApi";
import { getCurrentUser } from "../../api/authApi";
import { isGmRole, isSupervisorRole } from "../../utils/roleCapabilities";
import ExecutiveVisits from "../executive/ExecutiveVisits";
import type { StaffLayoutOutletContext } from "../../layoutOutletContext";
import { defaultSupervisorBadges } from "../../hooks/useSupervisorHybridBadges";

type Tab = "schedule" | "previous" | "reschedules" | "feedback" | "controlCards";

// Status badge styling
const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  declined: { label: "Declined", variant: "danger" },
  confirmed: { label: "Confirmed", variant: "success" },
  in_progress: { label: "In Progress", variant: "default" },
  follow_up_pending: { label: "AVR follow-up", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "danger" },
  rescheduled: { label: "Rescheduled", variant: "warning" },
};

const healthColor: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

/** Sequelize DECIMAL / JSON numbers often arrive as strings; normalize for maps & comparisons. */
function parseNumericCoord(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Calendar helpers
function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}

function getMonthDays(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const days: Date[] = [];
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }
  for (let i = 1; i <= last.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  while (days.length % 7 !== 0) {
    const d = new Date(last);
    d.setDate(d.getDate() + (days.length - (startDay + last.getDate()) + 1));
    days.push(d);
  }
  return days;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// Assign a stable color per executive name
const EXEC_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
];
function execColor(name: string, names: string[]): string {
  const idx = names.indexOf(name);
  return EXEC_COLORS[idx % EXEC_COLORS.length];
}

const PAGE_SIZE = 10;

export default function ManagerVisits() {
  const outletCtx = useOutletContext<StaffLayoutOutletContext | undefined>();
  const supervisorBadges = outletCtx?.supervisorBadges ?? defaultSupervisorBadges();
  const refreshBadges = supervisorBadges.refresh;
  const currentUser = getCurrentUser();
  const isSupervisor = isSupervisorRole(currentUser?.role);
  const isGm = isGmRole(currentUser?.role);
  const [scopeView, setScopeView] = useState<"executive" | "manager">("executive");
  const [activeTab, setActiveTab] = useState<Tab>("schedule");
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [controlCards, setControlCards] = useState<ControlCardRecord[]>([]);
  const [reschedules, setReschedules] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [execFilter, setExecFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [previousExecFilter, setPreviousExecFilter] = useState("");
  const [previousDateFrom, setPreviousDateFrom] = useState("");
  const [previousDateTo, setPreviousDateTo] = useState("");

  // Calendar
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<"week" | "month">("month");

  // Modals
  const [selectedVisit, setSelectedVisit] = useState<VisitRecord | null>(null);
  const [selectedCard, setSelectedCard] = useState<ControlCardRecord | null>(null);
  const [focusedFeedbackVisitId, setFocusedFeedbackVisitId] = useState<number | null>(null);
  const [focusedControlCardVisitId, setFocusedControlCardVisitId] = useState<number | null>(null);
  const [previousPage, setPreviousPage] = useState(1);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [controlCardsPage, setControlCardsPage] = useState(1);

  // Load manager-scoped data when needed (supervisor skips until "Manager Oversight")
  useEffect(() => {
    if (isSupervisor && scopeView === "executive") {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const [v, cc, r] = await Promise.all([
          getManagerVisits(),
          getManagerControlCards(),
          getPendingReschedules(),
        ]);
        setVisits(v);
        setControlCards(cc);
        setReschedules(r);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load data";
        toast.error(message);
      } finally {
        setLoading(false);
        if (isSupervisor) void refreshBadges();
      }
    };
    void load();
  }, [isSupervisor, scopeView, refreshBadges]);

  // Derived data
  const executiveNames = useMemo(() => {
    const names = new Set<string>();
    visits.forEach((v) => names.add(v.executiveName));
    return Array.from(names).sort();
  }, [visits]);

  const pendingCount = reschedules.filter((r) => r.execRescheduleStatus === "pending_approval").length;
  const isOverdueVisit = (visit: VisitRecord) => {
    const start = new Date(`${visit.visitDate}T${visit.startTime}`);
    return start < new Date() && ["pending", "approved", "confirmed", "rescheduled"].includes(visit.status);
  };
  const previousVisits = useMemo(
    () =>
      visits
        .filter((v) => new Date(`${v.visitDate}T${v.startTime}`) < new Date())
        .sort((a, b) => new Date(`${b.visitDate}T${b.startTime}`).getTime() - new Date(`${a.visitDate}T${a.startTime}`).getTime()),
    [visits]
  );
  const filteredPreviousVisits = useMemo(() => {
    return previousVisits.filter((v) => {
      if (previousExecFilter && v.executiveName !== previousExecFilter) return false;
      if (previousDateFrom) {
        const from = new Date(`${previousDateFrom}T00:00:00`);
        if (new Date(`${v.visitDate}T${v.startTime}`) < from) return false;
      }
      if (previousDateTo) {
        const to = new Date(`${previousDateTo}T23:59:59`);
        if (new Date(`${v.visitDate}T${v.startTime}`) > to) return false;
      }
      return true;
    });
  }, [previousVisits, previousExecFilter, previousDateFrom, previousDateTo]);
  const overdueCount = previousVisits.filter(isOverdueVisit).length;
  const previousTotalPages = Math.max(1, Math.ceil(filteredPreviousVisits.length / PAGE_SIZE));
  const paginatedPreviousVisits = useMemo(() => {
    const start = (previousPage - 1) * PAGE_SIZE;
    return filteredPreviousVisits.slice(start, start + PAGE_SIZE);
  }, [filteredPreviousVisits, previousPage]);

  // Calendar days
  const calendarDays = calendarView === "week" ? getWeekDays(calendarDate) : getMonthDays(calendarDate);

  // Visits grouped by date for calendar
  const visitsByDate = useMemo(() => {
    const map = new Map<string, VisitRecord[]>();
    visits.forEach((v) => {
      const key = v.visitDate;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    });
    return map;
  }, [visits]);

  // Filtered visits for schedule list
  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      if (searchQuery && !v.accountName.toLowerCase().includes(searchQuery.toLowerCase()) && !v.executiveName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (execFilter && v.executiveName !== execFilter) return false;
      if (statusFilter && v.status !== statusFilter) return false;
      return true;
    });
  }, [visits, searchQuery, execFilter, statusFilter]);

  // Completed visits with ratings for feedback tab
  const feedbackVisits = useMemo(() => {
    let filtered = visits.filter(
      (v) => (v.status === "completed" || v.status === "follow_up_pending") && v.customerRating !== null,
    );
    if (execFilter) filtered = filtered.filter((v) => v.executiveName === execFilter);
    if (ratingFilter === "low") filtered = filtered.filter((v) => (v.customerRating ?? 0) <= 2);
    else if (ratingFilter === "high") filtered = filtered.filter((v) => (v.customerRating ?? 0) >= 4);
    if (searchQuery) filtered = filtered.filter((v) => v.accountName.toLowerCase().includes(searchQuery.toLowerCase()) || v.executiveName.toLowerCase().includes(searchQuery.toLowerCase()));
    return filtered;
  }, [visits, execFilter, ratingFilter, searchQuery]);

  // Feedback stats
  const feedbackStats = useMemo(() => {
    const rated = visits.filter((v) => v.customerRating !== null);
    const total = rated.length;
    const avg = total > 0 ? rated.reduce((s, v) => s + (v.customerRating ?? 0), 0) / total : 0;
    const low = rated.filter((v) => (v.customerRating ?? 0) <= 2).length;
    // Per-executive averages
    const byExec = new Map<string, { sum: number; count: number }>();
    rated.forEach((v) => {
      const e = byExec.get(v.executiveName) || { sum: 0, count: 0 };
      e.sum += v.customerRating ?? 0;
      e.count++;
      byExec.set(v.executiveName, e);
    });
    return { total, avg, low, byExec };
  }, [visits]);
  const feedbackTotalPages = Math.max(1, Math.ceil(feedbackVisits.length / PAGE_SIZE));
  const paginatedFeedbackVisits = useMemo(() => {
    const start = (feedbackPage - 1) * PAGE_SIZE;
    return feedbackVisits.slice(start, start + PAGE_SIZE);
  }, [feedbackVisits, feedbackPage]);

  // Filtered control cards
  const filteredCards = useMemo(() => {
    let filtered = [...controlCards];
    if (execFilter) {
      const execIds = visits.filter((v) => v.executiveName === execFilter).map((v) => v.executiveId);
      filtered = filtered.filter((cc) => execIds.includes(cc.executiveId));
    }
    if (healthFilter) filtered = filtered.filter((cc) => cc.accountHealth === healthFilter);
    if (searchQuery) filtered = filtered.filter((cc) => cc.accountName.toLowerCase().includes(searchQuery.toLowerCase()));
    return filtered;
  }, [controlCards, execFilter, healthFilter, searchQuery, visits]);
  const controlCardsTotalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const paginatedControlCards = useMemo(() => {
    const start = (controlCardsPage - 1) * PAGE_SIZE;
    return filteredCards.slice(start, start + PAGE_SIZE);
  }, [filteredCards, controlCardsPage]);

  const controlCardLinkedVisit = useMemo(() => {
    if (!selectedCard) return null;
    return visits.find((v) => v.visitId === selectedCard.visitId) ?? null;
  }, [selectedCard, visits]);

  // Helper: find exec name for a control card
  const execNameForCard = (cc: ControlCardRecord): string => {
    const visit = visits.find((v) => v.visitId === cc.visitId);
    return visit?.executiveName ?? "Unknown";
  };

  // Reschedule handlers
  const handleApprove = async (visitId: number) => {
    try {
      await approveReschedule(visitId, "approved");
      setReschedules((prev) => prev.filter((r) => r.visitId !== visitId));
      // Refresh visits
      const updated = await getManagerVisits();
      setVisits(updated);
      toast.success("Reschedule approved");
      if (isSupervisor) void refreshBadges();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to approve";
      toast.error(message);
    }
  };

  const handleReject = async (visitId: number) => {
    try {
      await approveReschedule(visitId, "rejected");
      setReschedules((prev) => prev.filter((r) => r.visitId !== visitId));
      toast.success("Reschedule rejected");
      if (isSupervisor) void refreshBadges();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reject";
      toast.error(message);
    }
  };

  // Calendar nav
  const navCalendar = (dir: -1 | 1) => {
    const d = new Date(calendarDate);
    if (calendarView === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCalendarDate(d);
  };

  const exportPreviousVisits = () => {
    if (filteredPreviousVisits.length === 0) {
      toast("No previous visits to export for selected filters.");
      return;
    }
    const rows = [
      ["Visit ID", "Visit Number", "Executive", "Corporate", "Visit Date", "Start Time", "End Time", "Status", "Meeting Type"],
      ...filteredPreviousVisits.map((v) => [
        String(v.visitId),
        v.visitNumber ?? "",
        v.executiveName,
        v.accountName,
        v.visitDate,
        v.startTime,
        v.endTime,
        v.status,
        v.meetingType,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const execLabel = previousExecFilter ? previousExecFilter.replace(/\s+/g, "_") : "all_executives";
    const fromLabel = previousDateFrom || "start";
    const toLabel = previousDateTo || "today";
    link.href = url;
    link.setAttribute("download", `previous_visits_${execLabel}_${fromLabel}_to_${toLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Previous visits exported successfully.");
  };

  useEffect(() => {
    setPreviousPage(1);
  }, [previousExecFilter, previousDateFrom, previousDateTo]);

  useEffect(() => {
    setFeedbackPage(1);
  }, [searchQuery, execFilter, ratingFilter, activeTab]);

  useEffect(() => {
    setControlCardsPage(1);
  }, [searchQuery, execFilter, healthFilter, activeTab]);

  const handleViewFeedbackForVisit = (visit: VisitRecord) => {
    setFocusedFeedbackVisitId(visit.visitId);
    setFocusedControlCardVisitId(null);
    setSelectedCard(null);
    setActiveTab("feedback");
    setSearchQuery(visit.accountName);
    setExecFilter(visit.executiveName);
    setStatusFilter("");
    setHealthFilter("");
    setRatingFilter("");
    if (visit.customerRating === null) {
      toast("No customer feedback submitted for this visit yet.");
    }
  };

  const handleViewControlCardForVisit = (visit: VisitRecord) => {
    const matchingCard = controlCards.find((card) => card.visitId === visit.visitId) ?? null;
    setFocusedControlCardVisitId(visit.visitId);
    setFocusedFeedbackVisitId(null);
    setActiveTab("controlCards");
    setSearchQuery(visit.accountName);
    setExecFilter(visit.executiveName);
    setStatusFilter("");
    setHealthFilter("");
    setRatingFilter("");
    if (!matchingCard) {
      setSelectedCard(null);
      toast("No control card submitted for this visit yet.");
      return;
    }
    setSelectedCard(matchingCard);
  };

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "schedule", label: "Executive Visit Schedule" },
    { key: "reschedules", label: "Pending Reschedules", badge: pendingCount },
    { key: "previous", label: "Previous Visits", badge: overdueCount },
    { key: "feedback", label: "Customer Feedback" },
    { key: "controlCards", label: "Control Cards" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mtc-blue" />
      </div>
    );
  }

  if (isSupervisor && scopeView === "executive") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setScopeView("executive")} className="inline-flex items-center gap-2">
            My Executive Work
            {supervisorBadges.executiveSideDot && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Your executive queue needs attention" />
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setScopeView("manager")} className="inline-flex items-center gap-2">
            Manager Oversight
          </Button>
        </div>
        <ExecutiveVisits />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      {isSupervisor && (
        <div className="flex items-center gap-2">
          <Button
            variant={scopeView === "executive" ? "primary" : "outline"}
            size="sm"
            onClick={() => setScopeView("executive")}
            className="inline-flex items-center gap-2"
          >
            My Executive Work
            {supervisorBadges.executiveSideDot && scopeView === "executive" && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Your executive queue needs attention" />
            )}
          </Button>
          <Button
            variant={scopeView === "manager" ? "primary" : "outline"}
            size="sm"
            onClick={() => setScopeView("manager")}
            className="inline-flex items-center gap-2"
          >
            Manager Oversight
            {supervisorBadges.managerSideDot && scopeView === "manager" && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Team oversight queue needs attention" />
            )}
          </Button>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Visits & Engagements</h2>
          <p className="text-sm text-slate-500">
            {isGm
              ? "Oversight — visits under your managers (read-only)."
              : "Oversee executive visit schedules, reschedule requests, customer feedback, and control cards."}
          </p>
        </div>
      </div>

      {/* Pending Reschedules Summary (always visible if there are any) */}
      {pendingCount > 0 && activeTab !== "reschedules" && (
        <Card className="border-amber-200 bg-amber-50/30 cursor-pointer hover:bg-amber-50/50 transition-colors" onClick={() => setActiveTab("reschedules")}>
          <CardContent className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                {pendingCount} pending reschedule request{pendingCount > 1 ? "s" : ""}{isGm ? " in your hierarchy" : " require your attention"}
              </span>
            </div>
            <Badge variant="warning">{pendingCount}</Badge>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setSearchQuery("");
              setExecFilter("");
              setStatusFilter("");
              setHealthFilter("");
              setRatingFilter("");
              setFocusedFeedbackVisitId(null);
              setFocusedControlCardVisitId(null);
            }}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab.key ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <Badge variant="warning" className="text-xs px-1.5 py-0">{tab.badge}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* ============= TAB 1: EXECUTIVE VISIT SCHEDULE ============= */}
      {activeTab === "schedule" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input className="pl-9" placeholder="Search by corporate or executive..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select className="w-full sm:w-48" value={execFilter} onChange={(e) => setExecFilter(e.target.value)}>
              <option value="">All Executives</option>
              {executiveNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Select className="w-full sm:w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <div className="flex items-center gap-1 sm:ml-auto">
              <Button variant={calendarView === "week" ? "primary" : "outline"} size="sm" onClick={() => setCalendarView("week")}>Week</Button>
              <Button variant={calendarView === "month" ? "primary" : "outline"} size="sm" onClick={() => setCalendarView("month")}>Month</Button>
            </div>
          </div>

          {/* Calendar */}
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => navCalendar(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <CardTitle className="text-base">
                {calendarView === "week"
                  ? `${formatDate(calendarDays[0])} — ${formatDate(calendarDays[6])}`
                  : calendarDate.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
                }
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navCalendar(1)}><ChevronRight className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="min-w-[560px]">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-slate-200">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7">
                {calendarDays.map((day, idx) => {
                  const dateStr = day.toISOString().split("T")[0];
                  const dayVisits = visitsByDate.get(dateStr) || [];
                  const isToday = isSameDay(day, new Date());
                  const isCurrentMonth = day.getMonth() === calendarDate.getMonth();
                  return (
                    <div
                      key={idx}
                      className={`min-h-[70px] border-b border-r border-slate-100 p-1 ${
                        !isCurrentMonth && calendarView === "month" ? "bg-slate-50/50" : ""
                      } ${isToday ? "bg-blue-50/50" : ""}`}
                    >
                      <span className={`text-xs font-medium ${isToday ? "text-mtc-blue font-bold" : isCurrentMonth ? "text-slate-700" : "text-slate-300"}`}>
                        {day.getDate()}
                      </span>
                      <div className="space-y-0.5 mt-0.5">
                        {dayVisits.slice(0, 3).map((v) => (
                          <button
                            key={v.visitId}
                            onClick={() => setSelectedVisit(v)}
                            className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate text-white ${execColor(v.executiveName, executiveNames)}`}
                            title={`${v.executiveName} — ${v.accountName}`}
                          >
                            {v.startTime} {v.accountName}
                          </button>
                        ))}
                        {dayVisits.length > 3 && (
                          <span className="text-[10px] text-slate-400 px-1">+{dayVisits.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Executive legend */}
          {executiveNames.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {executiveNames.map((name) => (
                <div key={name} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${execColor(name, executiveNames)}`} />
                  {name}
                </div>
              ))}
            </div>
          )}

          {/* Visit list */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVisits.length === 0 ? (
                  <TableRow>
                    <td colSpan={7} className="text-center py-8 text-slate-400 p-4">No visits found.</td>
                  </TableRow>
                ) : (
                  filteredVisits.map((v) => {
                    const sc = statusConfig[v.status] || { label: v.status, variant: "default" as const };
                    return (
                      <TableRow key={v.visitId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${execColor(v.executiveName, executiveNames)}`} />
                            <span className="font-medium text-slate-900">{v.executiveName}</span>
                          </div>
                        </TableCell>
                        <TableCell>{v.accountName}</TableCell>
                        <TableCell>{new Date(v.visitDate).toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                        <TableCell className="text-slate-500">{v.startTime} – {v.endTime}</TableCell>
                        <TableCell className="capitalize">{v.meetingType.replace("_", " ")}</TableCell>
                        <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedVisit(v)}>
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {activeTab === "previous" && (
        <div className="space-y-4">
          {overdueCount > 0 && (
            <Card className="border-red-200 bg-red-50/40">
              <CardContent className="py-3 flex items-center justify-between">
                <span className="text-sm text-red-700 font-medium">
                  {overdueCount} overdue visit{overdueCount > 1 ? "s" : ""} were not started/completed on time.
                </span>
                <Badge variant="danger">{overdueCount} Overdue</Badge>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="w-full sm:min-w-[220px] sm:w-auto">
                  <label className="text-xs text-slate-500 mb-1 block">Executive</label>
                  <Select value={previousExecFilter} onChange={(e) => setPreviousExecFilter(e.target.value)}>
                    <option value="">All Executives</option>
                    {executiveNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </div>
                <div className="w-full sm:w-auto">
                  <label className="text-xs text-slate-500 mb-1 block">From</label>
                  <Input type="date" value={previousDateFrom} onChange={(e) => setPreviousDateFrom(e.target.value)} />
                </div>
                <div className="w-full sm:w-auto">
                  <label className="text-xs text-slate-500 mb-1 block">To</label>
                  <Input type="date" value={previousDateTo} onChange={(e) => setPreviousDateTo(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setPreviousExecFilter(""); setPreviousDateFrom(""); setPreviousDateTo(""); }}>
                    Clear
                  </Button>
                  <Button size="sm" onClick={exportPreviousVisits}>
                    <Download className="h-4 w-4 mr-1" /> Export
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPreviousVisits.length === 0 ? (
                  <TableRow>
                    <td colSpan={6} className="text-center py-8 text-slate-400 p-4">No previous visits found.</td>
                  </TableRow>
                ) : (
                  paginatedPreviousVisits.map((v) => {
                    const sc = statusConfig[v.status] || { label: v.status, variant: "default" as const };
                    return (
                      <TableRow key={v.visitId}>
                        <TableCell className="font-medium text-slate-900">{v.executiveName}</TableCell>
                        <TableCell>{v.accountName}</TableCell>
                        <TableCell>{new Date(v.visitDate).toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                        <TableCell className="text-slate-500">{v.startTime} – {v.endTime}</TableCell>
                        <TableCell>
                          {isOverdueVisit(v) ? <Badge variant="danger">Overdue</Badge> : <Badge variant={sc.variant}>{sc.label}</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col sm:flex-row sm:justify-end gap-1 sm:gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleViewFeedbackForVisit(v)}>
                              <MessageSquare className="h-3.5 w-3.5 mr-1" /> View Customer Feedback
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleViewControlCardForVisit(v)}>
                              <FileText className="h-3.5 w-3.5 mr-1" /> View Control Card
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <div className="p-4 border-t border-slate-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-500">
                Showing {(previousPage - 1) * PAGE_SIZE + (paginatedPreviousVisits.length > 0 ? 1 : 0)}-
                {(previousPage - 1) * PAGE_SIZE + paginatedPreviousVisits.length} of {filteredPreviousVisits.length}
              </span>
              <div className="flex items-center gap-2 justify-between sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => setPreviousPage((p) => Math.max(1, p - 1))} disabled={previousPage === 1}>
                  Previous
                </Button>
                <span className="text-xs text-slate-500">Page {previousPage} of {previousTotalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPreviousPage((p) => Math.min(previousTotalPages, p + 1))} disabled={previousPage >= previousTotalPages}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ============= TAB 2: PENDING RESCHEDULES ============= */}
      {activeTab === "reschedules" && (
        <div className="space-y-4">
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-600" />
                Pending Reschedule Requests
                {pendingCount > 0 && <Badge variant="warning" className="ml-2">{pendingCount} Pending</Badge>}
              </CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Original Date</TableHead>
                  <TableHead>Requested Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Motivation</TableHead>
                  {!isGm && <TableHead className="text-right">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {reschedules.filter((r) => r.execRescheduleStatus === "pending_approval").length === 0 ? (
                  <TableRow>
                    <td colSpan={isGm ? 6 : 7} className="text-center py-8 text-slate-400 p-4">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-300" />
                      No pending reschedule requests. All clear!
                    </td>
                  </TableRow>
                ) : (
                  reschedules
                    .filter((r) => r.execRescheduleStatus === "pending_approval")
                    .map((req) => (
                      <TableRow key={req.visitId}>
                        <TableCell className="font-medium text-slate-900">{req.executiveName}</TableCell>
                        <TableCell>{req.accountName}</TableCell>
                        <TableCell className="text-slate-500">
                          {new Date(req.visitDate).toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" })}
                          <span className="block text-xs">{req.startTime}</span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {req.execRescheduleNewDate ? new Date(req.execRescheduleNewDate).toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          {req.execRescheduleNewTime && <span className="block text-xs text-slate-500">{req.execRescheduleNewTime}</span>}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 max-w-[180px] truncate" title={req.execRescheduleReason ?? ""}>{req.execRescheduleReason || "—"}</TableCell>
                        <TableCell className="text-sm text-slate-500 max-w-[180px] truncate" title={req.execRescheduleMotivation ?? ""}>{req.execRescheduleMotivation || "—"}</TableCell>
                        {!isGm && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-700 border-green-300 hover:bg-green-50 text-xs"
                                onClick={() => handleApprove(req.visitId)}
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-700 border-red-300 hover:bg-red-50 text-xs"
                                onClick={() => handleReject(req.visitId)}
                              >
                                <X className="h-3.5 w-3.5 mr-1" /> Reject
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* ============= TAB 3: CUSTOMER FEEDBACK ============= */}
      {activeTab === "feedback" && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 text-center">
                <span className="text-2xl font-bold text-mtc-blue">{feedbackStats.total}</span>
                <p className="text-xs text-slate-500 mt-1">Total Reviews</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <span className="text-2xl font-bold text-slate-900">{feedbackStats.avg.toFixed(1)}</span>
                <div className="flex justify-center mt-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(feedbackStats.avg) ? "fill-blue-400 text-blue-400" : "text-slate-200"}`} />
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">Avg Rating</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <span className="text-2xl font-bold text-red-600">{feedbackStats.low}</span>
                <p className="text-xs text-slate-500 mt-1">Low Ratings (1-2)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <span className="text-2xl font-bold text-green-600">{feedbackStats.total - feedbackStats.low}</span>
                <p className="text-xs text-slate-500 mt-1">Positive (3-5)</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-executive averages */}
          {feedbackStats.byExec.size > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-mtc-blue" /> Rating by Executive</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {Array.from(feedbackStats.byExec.entries()).map(([name, data]) => {
                    const avg = data.sum / data.count;
                    return (
                      <div key={name} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${execColor(name, executiveNames)}`} />
                          <span className="text-sm font-medium text-slate-900">{name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-bold ${avg <= 2 ? "text-red-600" : avg >= 4 ? "text-green-600" : "text-slate-900"}`}>
                            {avg.toFixed(1)}
                          </span>
                          <Star className={`h-3.5 w-3.5 ${avg >= 4 ? "fill-blue-400 text-blue-400" : avg <= 2 ? "fill-red-400 text-red-400" : "fill-blue-300 text-blue-300"}`} />
                          <span className="text-xs text-slate-400">({data.count})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input className="pl-9" placeholder="Search by corporate..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select className="w-48" value={execFilter} onChange={(e) => setExecFilter(e.target.value)}>
              <option value="">All Executives</option>
              {executiveNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Select className="w-40" value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)}>
              <option value="">All Ratings</option>
              <option value="low">Low (1-2)</option>
              <option value="high">High (4-5)</option>
            </Select>
          </div>

          {/* Feedback table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Visit Date</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Rated At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedFeedbackVisits.length === 0 ? (
                  <TableRow>
                    <td colSpan={6} className="text-center py-8 text-slate-400 p-4">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      No feedback found.
                    </td>
                  </TableRow>
                ) : (
                  paginatedFeedbackVisits.map((v) => (
                    <TableRow
                      key={v.visitId}
                      className={
                        focusedFeedbackVisitId === v.visitId
                          ? "bg-blue-50/70"
                          : v.customerRating !== null && v.customerRating <= 2
                          ? "bg-red-50/50"
                          : ""
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${execColor(v.executiveName, executiveNames)}`} />
                          <span className="font-medium text-slate-900">{v.executiveName}</span>
                        </div>
                      </TableCell>
                      <TableCell>{v.accountName}</TableCell>
                      <TableCell>{new Date(v.visitDate).toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className={`font-bold ${(v.customerRating ?? 0) <= 2 ? "text-red-600" : (v.customerRating ?? 0) >= 4 ? "text-green-600" : "text-slate-900"}`}>
                            {v.customerRating}/5
                          </span>
                          <Star className={`h-4 w-4 ${(v.customerRating ?? 0) >= 4 ? "fill-blue-400 text-blue-400" : (v.customerRating ?? 0) <= 2 ? "fill-red-400 text-red-400" : "fill-blue-300 text-blue-300"}`} />
                        </div>
                        {v.customerRating !== null && v.customerRating <= 2 && (
                          <span className="text-[10px] text-red-600 font-medium">LOW RATING</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-xs truncate" title={v.customerRatingComment ?? ""}>
                        {v.customerRatingComment || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {v.customerRatedAt ? new Date(v.customerRatedAt).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="p-4 border-t border-slate-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-500">
                Showing {(feedbackPage - 1) * PAGE_SIZE + (paginatedFeedbackVisits.length > 0 ? 1 : 0)}-
                {(feedbackPage - 1) * PAGE_SIZE + paginatedFeedbackVisits.length} of {feedbackVisits.length}
              </span>
              <div className="flex items-center gap-2 justify-between sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => setFeedbackPage((p) => Math.max(1, p - 1))} disabled={feedbackPage === 1}>
                  Previous
                </Button>
                <span className="text-xs text-slate-500">Page {feedbackPage} of {feedbackTotalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setFeedbackPage((p) => Math.min(feedbackTotalPages, p + 1))} disabled={feedbackPage >= feedbackTotalPages}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ============= TAB 4: CONTROL CARDS ============= */}
      {activeTab === "controlCards" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input className="pl-9" placeholder="Search by corporate..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select className="w-full sm:w-48" value={execFilter} onChange={(e) => setExecFilter(e.target.value)}>
              <option value="">All Executives</option>
              {executiveNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Select className="w-full sm:w-44" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)}>
              <option value="">All Health Statuses</option>
              <option value="green">Green</option>
              <option value="amber">Amber</option>
              <option value="red">Red</option>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Visit Date</TableHead>
                  <TableHead>Account Health</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedControlCards.length === 0 ? (
                  <TableRow>
                    <td colSpan={6} className="text-center py-8 text-slate-400 p-4">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      No control cards found.
                    </td>
                  </TableRow>
                ) : (
                  paginatedControlCards.map((cc) => (
                    <TableRow key={cc.controlCardId} className={focusedControlCardVisitId === cc.visitId ? "bg-blue-50/70" : ""}>
                      <TableCell className="font-medium text-slate-900">{execNameForCard(cc)}</TableCell>
                      <TableCell>{cc.accountName}</TableCell>
                      <TableCell>{new Date(cc.visitDate).toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                      <TableCell>
                        {cc.accountHealth ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${healthColor[cc.accountHealth]}`} />
                            <span className="text-sm capitalize">{cc.accountHealth}</span>
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400">Not set</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {new Date(cc.submittedAt).toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedCard(cc)}>
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="p-4 border-t border-slate-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-500">
                Showing {(controlCardsPage - 1) * PAGE_SIZE + (paginatedControlCards.length > 0 ? 1 : 0)}-
                {(controlCardsPage - 1) * PAGE_SIZE + paginatedControlCards.length} of {filteredCards.length}
              </span>
              <div className="flex items-center gap-2 justify-between sm:justify-end">
                <Button variant="outline" size="sm" onClick={() => setControlCardsPage((p) => Math.max(1, p - 1))} disabled={controlCardsPage === 1}>
                  Previous
                </Button>
                <span className="text-xs text-slate-500">Page {controlCardsPage} of {controlCardsTotalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setControlCardsPage((p) => Math.min(controlCardsTotalPages, p + 1))} disabled={controlCardsPage >= controlCardsTotalPages}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ============= VISIT DETAIL MODAL ============= */}
      {selectedVisit && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setSelectedVisit(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle className="text-base">Visit Details — {selectedVisit.visitNumber}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedVisit(null)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block mb-1">Executive</span>
                  <span className="font-medium text-slate-900">{selectedVisit.executiveName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Corporate</span>
                  <span className="font-medium text-slate-900">{selectedVisit.accountName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Visit Date</span>
                  <span className="font-medium text-slate-900">{new Date(selectedVisit.visitDate).toLocaleDateString("en-ZA", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Time</span>
                  <span className="font-medium text-slate-900 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400" /> {selectedVisit.startTime} – {selectedVisit.endTime}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Meeting Type</span>
                  <span className="font-medium text-slate-900 capitalize">{selectedVisit.meetingType.replace("_", " ")}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Status</span>
                  <Badge variant={(statusConfig[selectedVisit.status] || { variant: "default" as const }).variant}>
                    {(statusConfig[selectedVisit.status] || { label: selectedVisit.status }).label}
                  </Badge>
                </div>
                {selectedVisit.location && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block mb-1">Location</span>
                    <span className="font-medium text-slate-900 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" /> {selectedVisit.location}
                    </span>
                  </div>
                )}
                {(() => {
                  const sl = selectedVisit.startGeoLatitude != null ? Number(selectedVisit.startGeoLatitude) : NaN;
                  const sg = selectedVisit.startGeoLongitude != null ? Number(selectedVisit.startGeoLongitude) : NaN;
                  if (!Number.isFinite(sl) || !Number.isFinite(sg)) return null;
                  return (
                    <div className="col-span-2 rounded-md border border-sky-200 bg-sky-50/80 p-3">
                      <span className="text-slate-500 block mb-1 flex items-center gap-1.5">
                        <Navigation className="h-3.5 w-3.5 text-sky-600" aria-hidden />
                        Meeting start (GPS)
                      </span>
                      {selectedVisit.meetingStartedAt && (
                        <p className="text-xs text-slate-600 mb-1">
                          {new Date(selectedVisit.meetingStartedAt).toLocaleString("en-ZA", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      )}
                      <p className="text-xs font-mono text-slate-800 mb-2">
                        {sl.toFixed(6)}, {sg.toFixed(6)}
                      </p>
                      <a
                        href={openStreetMapMeetingStartLink(sl, sg)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-sky-800 underline hover:text-sky-950"
                      >
                        Open in map
                      </a>
                    </div>
                  );
                })()}
                <div className="col-span-2">
                  <span className="text-slate-500 block mb-1">Purpose</span>
                  <span className="font-medium text-slate-900">{selectedVisit.purpose}</span>
                </div>
                {selectedVisit.agenda && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block mb-1">Agenda</span>
                    <span className="text-slate-700 text-sm">{selectedVisit.agenda}</span>
                  </div>
                )}
                {selectedVisit.attendees && selectedVisit.attendees.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block mb-1">Attendees</span>
                    <span className="text-slate-700 text-sm">{selectedVisit.attendees.join(", ")}</span>
                  </div>
                )}
                {selectedVisit.customerRating !== null && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block mb-1">Customer Rating</span>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-900">{selectedVisit.customerRating}/5</span>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-4 w-4 ${s <= (selectedVisit.customerRating ?? 0) ? "fill-blue-400 text-blue-400" : "text-slate-200"}`} />
                      ))}
                    </div>
                    {selectedVisit.customerRatingComment && (
                      <p className="text-sm text-slate-600 mt-1">{selectedVisit.customerRatingComment}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-end pt-4 border-t border-slate-200">
                <Button variant="outline" onClick={() => setSelectedVisit(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============= CONTROL CARD DETAIL MODAL (full manager brief) ============= */}
      {selectedCard && (() => {
        const v = controlCardLinkedVisit;
        const avrLat = parseNumericCoord(selectedCard.geoLatitude);
        const avrLng = parseNumericCoord(selectedCard.geoLongitude);
        const startLat = v ? parseNumericCoord(v.startGeoLatitude) : null;
        const startLng = v ? parseNumericCoord(v.startGeoLongitude) : null;
        const hasStartGps = startLat !== null && startLng !== null;
        const hasAvrGps = avrLat !== null && avrLng !== null;
        const customerRated =
          v && v.customerRating != null && Number(v.customerRating) > 0;

        return (
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
            onClick={() => setSelectedCard(null)}
          >
            <Card
              className="w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border-slate-200/90 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="shrink-0 border-b border-mtc-blue-dark/25 bg-mtc-blue text-white py-5 px-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/75">Account visit report · Manager view</p>
                    <CardTitle className="text-xl sm:text-2xl text-white mt-1 font-semibold tracking-tight truncate">
                      {selectedCard.accountName}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2 mt-3 text-xs">
                      {v?.visitNumber && (
                        <span className="rounded-full bg-white/20 px-2.5 py-1 font-medium text-white">{v.visitNumber}</span>
                      )}
                      <span className="rounded-full bg-white/15 px-2.5 py-1 text-white/95">
                        AVR submitted{" "}
                        {new Date(selectedCard.submittedAt).toLocaleString("en-ZA", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      {selectedCard.updatedAt && selectedCard.createdAt !== selectedCard.updatedAt && (
                        <span className="rounded-full bg-white/15 px-2.5 py-1 text-white/95">
                          Last updated{" "}
                          {new Date(selectedCard.updatedAt).toLocaleString("en-ZA", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 shrink-0 h-9 w-9 p-0" onClick={() => setSelectedCard(null)}>
                     <X className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="flex-1 min-h-0 overflow-y-auto p-0 bg-slate-50/40">
                <div className="p-6 space-y-6">
                  {/* Snapshot strip */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Executive</span>
                      <p className="mt-1 font-semibold text-slate-900">{execNameForCard(selectedCard)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Visit date</span>
                      <p className="mt-1 font-semibold text-slate-900">
                        {new Date(selectedCard.visitDate).toLocaleDateString("en-ZA", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      {v && (
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" aria-hidden />
                          {v.startTime} – {v.endTime}
                        </p>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">CSR manager</span>
                      <p className="mt-1 font-semibold text-slate-900">{selectedCard.csrManager || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Account health</span>
                      {selectedCard.accountHealth ? (
                        <p className="mt-1 inline-flex items-center gap-2 font-semibold text-slate-900 capitalize">
                          <span className={`h-2.5 w-2.5 rounded-full ${healthColor[selectedCard.accountHealth]}`} />
                          {selectedCard.accountHealth}
                        </p>
                      ) : (
                        <p className="mt-1 text-slate-400 text-sm">Not set</p>
                      )}
                    </div>
                  </div>

                  {/* Scheduled visit context */}
                  {v && (
                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-600" aria-hidden />
                        <h3 className="text-sm font-semibold text-slate-900">Scheduled meeting</h3>
                        <Badge variant={(statusConfig[v.status] || { variant: "default" as const }).variant} className="ml-auto text-[10px]">
                          {(statusConfig[v.status] || { label: v.status }).label}
                        </Badge>
                      </div>
                      <div className="p-4 grid gap-4 sm:grid-cols-2 text-sm">
                        <div className="sm:col-span-2">
                          <span className="text-slate-500 block text-xs font-medium uppercase tracking-wide mb-1">Purpose</span>
                          <p className="font-medium text-slate-900">{v.purpose}</p>
                        </div>
                        {v.agenda && (
                          <div className="sm:col-span-2">
                            <span className="text-slate-500 block text-xs font-medium uppercase tracking-wide mb-1">Agenda</span>
                            <p className="text-slate-700 whitespace-pre-wrap">{v.agenda}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-500 block text-xs font-medium uppercase tracking-wide mb-1">Format</span>
                          <p className="font-medium text-slate-900 capitalize flex items-center gap-1.5">
                            {v.meetingType === "online" ? <Video className="h-3.5 w-3.5 text-slate-400" /> : <MapPin className="h-3.5 w-3.5 text-slate-400" />}
                            {v.meetingType.replace("_", " ")}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-xs font-medium uppercase tracking-wide mb-1">Location / link</span>
                          <p className="font-medium text-slate-900">
                            {v.meetingType === "online" ? v.onlineLink || "—" : v.location || "—"}
                          </p>
                        </div>
                        {v.attendees && v.attendees.length > 0 && (
                          <div className="sm:col-span-2">
                            <span className="text-slate-500 block text-xs font-medium uppercase tracking-wide mb-1 flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" /> Portal attendees
                            </span>
                            <p className="text-slate-700">{v.attendees.join(", ")}</p>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Customer portal rating (post-visit) */}
                  {v && (
                    <section className="rounded-xl border border-violet-200 bg-violet-50/40 shadow-sm overflow-hidden">
                      <div className="border-b border-violet-100 bg-violet-100/50 px-4 py-3 flex items-center gap-2">
                        <Star className="h-4 w-4 text-violet-700 fill-violet-400/30" aria-hidden />
                        <h3 className="text-sm font-semibold text-violet-950">Customer rating (portal)</h3>
                      </div>
                      <div className="p-4">
                        {customerRated ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-lg font-bold text-slate-900">{v.customerRating}/5</span>
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star
                                    key={s}
                                    className={`h-5 w-5 ${s <= (v.customerRating ?? 0) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                                  />
                                ))}
                              </div>
                              {v.customerRatedAt && (
                                <span className="text-xs text-slate-500">
                                  {new Date(v.customerRatedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                                </span>
                              )}
                            </div>
                            {v.customerRatingComment ? (
                              <p className="text-sm text-slate-700 rounded-lg bg-white/80 border border-violet-100 p-3">{v.customerRatingComment}</p>
                            ) : (
                              <p className="text-xs text-slate-500">No written comment.</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-600">No customer rating submitted yet for this visit.</p>
                        )}
                      </div>
                    </section>
                  )}

                  {/* GPS: meeting start vs AVR capture */}
                  <section className="rounded-xl border border-sky-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-sky-100 bg-sky-50/80 px-4 py-3 flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-sky-700" aria-hidden />
                      <h3 className="text-sm font-semibold text-sky-950">GPS & location captures</h3>
                    </div>
                    <div className="p-4 grid gap-4 md:grid-cols-2">
                      <div className={`rounded-lg border p-4 ${hasStartGps ? "border-sky-200 bg-sky-50/40" : "border-dashed border-slate-200 bg-slate-50/50"}`}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-900 mb-2">Meeting start (executive)</p>
                        {hasStartGps && startLat !== null && startLng !== null ? (
                          <>
                            {v?.meetingStartedAt && (
                              <p className="text-xs text-slate-600 mb-2">
                                {new Date(v.meetingStartedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                              </p>
                            )}
                            <p className="text-xs font-mono text-slate-800 mb-3">
                              {startLat.toFixed(6)}, {startLng.toFixed(6)}
                            </p>
                            <a
                              href={openStreetMapMeetingStartLink(startLat, startLng)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-sky-800 underline hover:text-sky-950"
                            >
                              Open in OpenStreetMap
                            </a>
                          </>
                        ) : (
                          <p className="text-sm text-slate-500">No meeting-start GPS recorded.</p>
                        )}
                      </div>
                      <div className={`rounded-lg border p-4 ${hasAvrGps ? "border-teal-200 bg-teal-50/40" : "border-dashed border-slate-200 bg-slate-50/50"}`}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-teal-900 mb-2">AVR / control card capture</p>
                        {hasAvrGps && avrLat !== null && avrLng !== null ? (
                          <>
                            <p className="text-xs font-mono text-slate-800 mb-3">
                              {avrLat.toFixed(6)}, {avrLng.toFixed(6)}
                            </p>
                            <a
                              href={openStreetMapMeetingStartLink(avrLat, avrLng)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-teal-900 underline hover:text-teal-950"
                            >
                              Open in OpenStreetMap
                            </a>
                          </>
                        ) : (
                          <p className="text-sm text-slate-500">No GPS stored on the control card submission.</p>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* AVR narrative sections */}
                  <div className="space-y-4">
                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-2 bg-emerald-50/60">
                        <ClipboardList className="h-4 w-4 text-emerald-800" aria-hidden />
                        <h3 className="text-sm font-semibold text-slate-900">Meeting summary & participants</h3>
                      </div>
                      <div className="p-4 space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Visit objective</h4>
                          <p className="text-sm text-slate-800 whitespace-pre-wrap">{selectedCard.visitObjective || "—"}</p>
                        </div>
                        {selectedCard.customerParticipants && (
                          <div>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                              <Users className="h-3 w-3" /> Participants (AVR)
                            </h4>
                            <p className="text-sm text-slate-800 whitespace-pre-wrap">{selectedCard.customerParticipants}</p>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-2 bg-amber-50/50">
                        <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
                        <h3 className="text-sm font-semibold text-slate-900">SLA & service performance</h3>
                      </div>
                      <div className="p-4 grid gap-3 sm:grid-cols-3 text-sm">
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">SLA compliance</span>
                          <p className="mt-1 font-medium text-slate-900">{selectedCard.slaCompliance || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Open tickets</span>
                          <p className="mt-1 font-medium text-slate-900">{selectedCard.openTickets || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Critical incidents</span>
                          <p className="mt-1 font-medium text-slate-900">{selectedCard.criticalIncidents || "—"}</p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-indigo-200 bg-indigo-50/30 shadow-sm overflow-hidden">
                      <div className="border-b border-indigo-100 px-4 py-3 flex items-center gap-2 bg-indigo-50/80">
                        <Lock className="h-4 w-4 text-indigo-800" aria-hidden />
                        <h3 className="text-sm font-semibold text-indigo-950">Executive notes (internal)</h3>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-indigo-700 ml-auto hidden sm:inline">Not shown on customer portal</span>
                      </div>
                      <div className="p-4">
                        <div className="flex items-start gap-2 mb-2">
                          <MessageSquare className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" aria-hidden />
                          <p className="text-xs text-indigo-900 font-medium">Section 3 · Customer feedback field (internal use)</p>
                        </div>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap rounded-lg bg-white/90 border border-indigo-100 p-4">
                          {selectedCard.customerFeedback?.trim() ? selectedCard.customerFeedback : "—"}
                        </p>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 bg-slate-50/90">
                        <h3 className="text-sm font-semibold text-slate-900">Risks identified</h3>
                      </div>
                      <div className="p-4 grid gap-3 text-sm">
                        <div className="rounded-lg border border-slate-100 p-3">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Operational</span>
                          <p className="mt-1 text-slate-800 whitespace-pre-wrap">{selectedCard.risksOperational || "—"}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 p-3">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Commercial</span>
                          <p className="mt-1 text-slate-800 whitespace-pre-wrap">{selectedCard.risksCommercial || "—"}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 p-3">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Competitive</span>
                          <p className="mt-1 text-slate-800 whitespace-pre-wrap">{selectedCard.risksCompetitive || "—"}</p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 bg-violet-50/50">
                        <h3 className="text-sm font-semibold text-slate-900">Opportunities</h3>
                      </div>
                      <div className="p-4 grid gap-3 sm:grid-cols-2 text-sm">
                        <div className="rounded-lg border border-violet-100 bg-violet-50/30 p-3">
                          <span className="text-xs font-semibold text-violet-800 uppercase tracking-wide">Upsell</span>
                          <p className="mt-1 text-slate-800 whitespace-pre-wrap">{selectedCard.opportunitiesUpsell || "—"}</p>
                        </div>
                        <div className="rounded-lg border border-violet-100 bg-violet-50/30 p-3">
                          <span className="text-xs font-semibold text-violet-800 uppercase tracking-wide">Process improvement</span>
                          <p className="mt-1 text-slate-800 whitespace-pre-wrap">{selectedCard.opportunitiesProcess || "—"}</p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 bg-slate-50/90 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-700" aria-hidden />
                        <h3 className="text-sm font-semibold text-slate-900">Action items</h3>
                      </div>
                      <div className="p-4 overflow-x-auto">
                        {selectedCard.actionItems && selectedCard.actionItems.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[180px]">Item / action</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Owner</TableHead>
                                <TableHead>Due</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedCard.actionItems.map((item, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="align-top">
                                    <div className="font-medium text-slate-900">{item.item || item.action || "—"}</div>
                                    {item.notes && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{item.notes}</p>}
                                  </TableCell>
                                  <TableCell className="align-top text-sm">{item.quantity || "—"}</TableCell>
                                  <TableCell className="align-top text-sm">{item.category || "—"}</TableCell>
                                  <TableCell className="align-top text-sm">{item.requestType || "—"}</TableCell>
                                  <TableCell className="align-top text-sm">{item.owner || "—"}</TableCell>
                                  <TableCell className="align-top text-sm whitespace-nowrap">{item.dueDate || item.deadline || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <p className="text-sm text-slate-400">No action items recorded.</p>
                        )}
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 bg-slate-50/90">
                        <h3 className="text-sm font-semibold text-slate-900">Overall account health (AVR)</h3>
                      </div>
                      <div className="p-4">
                        {selectedCard.accountHealth ? (
                          <div className="flex flex-wrap items-center gap-3">
                            {(["green", "amber", "red"] as const).map((h) => (
                              <div
                                key={h}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                                  selectedCard.accountHealth === h
                                    ? "border-slate-800 bg-slate-900 text-white shadow-md"
                                    : "border-slate-200 bg-slate-50 text-slate-400"
                                }`}
                              >
                                <span className={`h-3 w-3 rounded-full ${healthColor[h]}`} />
                                <span className="text-sm font-medium capitalize">{h}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">Not assessed.</span>
                        )}
                      </div>
                    </section>
                  </div>
                </div>

                <div className="sticky bottom-0 border-t border-slate-200 bg-white px-6 py-4 flex justify-end gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                  <Button variant="outline" onClick={() => setSelectedCard(null)}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
