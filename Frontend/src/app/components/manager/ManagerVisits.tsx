import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import {
  getManagerVisits,
  getManagerControlCards,
  getPendingReschedules,
  approveReschedule,
  type VisitRecord,
  type ControlCardRecord,
} from "../../api/visitApi";

type Tab = "schedule" | "reschedules" | "feedback" | "controlCards";

// Status badge styling
const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  declined: { label: "Declined", variant: "danger" },
  confirmed: { label: "Confirmed", variant: "success" },
  in_progress: { label: "In Progress", variant: "default" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "danger" },
  rescheduled: { label: "Rescheduled", variant: "warning" },
};

const healthColor: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

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

export default function ManagerVisits() {
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

  // Calendar
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<"week" | "month">("month");

  // Modals
  const [selectedVisit, setSelectedVisit] = useState<VisitRecord | null>(null);
  const [selectedCard, setSelectedCard] = useState<ControlCardRecord | null>(null);

  // Load data
  useEffect(() => {
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
      }
    };
    load();
  }, []);

  // Derived data
  const executiveNames = useMemo(() => {
    const names = new Set<string>();
    visits.forEach((v) => names.add(v.executiveName));
    return Array.from(names).sort();
  }, [visits]);

  const pendingCount = reschedules.filter((r) => r.execRescheduleStatus === "pending_approval").length;

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
    let filtered = visits.filter((v) => v.status === "completed" && v.customerRating !== null);
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

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "schedule", label: "Executive Visit Schedule" },
    { key: "reschedules", label: "Pending Reschedules", badge: pendingCount },
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Visits & Engagements</h2>
          <p className="text-sm text-slate-500">Oversee executive visit schedules, reschedule requests, customer feedback, and control cards.</p>
        </div>
      </div>

      {/* Pending Reschedules Summary (always visible if there are any) */}
      {pendingCount > 0 && activeTab !== "reschedules" && (
        <Card className="border-amber-200 bg-amber-50/30 cursor-pointer hover:bg-amber-50/50 transition-colors" onClick={() => setActiveTab("reschedules")}>
          <CardContent className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                {pendingCount} pending reschedule request{pendingCount > 1 ? "s" : ""} require your attention
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
            onClick={() => { setActiveTab(tab.key); setSearchQuery(""); setExecFilter(""); setStatusFilter(""); setHealthFilter(""); setRatingFilter(""); }}
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
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input className="pl-9" placeholder="Search by corporate or executive..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select className="w-48" value={execFilter} onChange={(e) => setExecFilter(e.target.value)}>
              <option value="">All Executives</option>
              {executiveNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Select className="w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <div className="flex items-center gap-1 ml-auto">
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
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reschedules.filter((r) => r.execRescheduleStatus === "pending_approval").length === 0 ? (
                  <TableRow>
                    <td colSpan={7} className="text-center py-8 text-slate-400 p-4">
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
                {feedbackVisits.length === 0 ? (
                  <TableRow>
                    <td colSpan={6} className="text-center py-8 text-slate-400 p-4">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      No feedback found.
                    </td>
                  </TableRow>
                ) : (
                  feedbackVisits.map((v) => (
                    <TableRow key={v.visitId} className={v.customerRating !== null && v.customerRating <= 2 ? "bg-red-50/50" : ""}>
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
          </Card>
        </div>
      )}

      {/* ============= TAB 4: CONTROL CARDS ============= */}
      {activeTab === "controlCards" && (
        <div className="space-y-6">
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
            <Select className="w-44" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)}>
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
                {filteredCards.length === 0 ? (
                  <TableRow>
                    <td colSpan={6} className="text-center py-8 text-slate-400 p-4">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      No control cards found.
                    </td>
                  </TableRow>
                ) : (
                  filteredCards.map((cc) => (
                    <TableRow key={cc.controlCardId}>
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

      {/* ============= CONTROL CARD DETAIL MODAL ============= */}
      {selectedCard && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setSelectedCard(null)}>
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="sticky top-0 bg-white border-b border-slate-200 z-10 flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base">Control Card — {selectedCard.accountName}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCard(null)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Header info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block mb-1">Executive</span>
                  <span className="font-medium text-slate-900">{execNameForCard(selectedCard)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Visit Date</span>
                  <span className="font-medium text-slate-900">{new Date(selectedCard.visitDate).toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">CSR Manager</span>
                  <span className="font-medium text-slate-900">{selectedCard.csrManager || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Account Health</span>
                  {selectedCard.accountHealth ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${healthColor[selectedCard.accountHealth]}`} />
                      <span className="font-medium capitalize">{selectedCard.accountHealth}</span>
                    </span>
                  ) : <span className="text-slate-400">Not set</span>}
                </div>
              </div>

              {/* Section 1: Visit Objective */}
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-mtc-blue text-white text-[10px] font-bold">1</span>
                  Visit Objective
                </h4>
                <p className="text-sm text-slate-700 pl-7">{selectedCard.visitObjective || "—"}</p>
              </div>

              {/* Section 2: SLA & Service Performance */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-mtc-blue text-white text-[10px] font-bold">2</span>
                  SLA & Service Performance
                </h4>
                <div className="grid grid-cols-3 gap-3 pl-7 text-sm">
                  <div><span className="text-slate-500">SLA Compliance:</span> <span className="font-medium">{selectedCard.slaCompliance || "—"}</span></div>
                  <div><span className="text-slate-500">Open Tickets:</span> <span className="font-medium">{selectedCard.openTickets || "—"}</span></div>
                  <div><span className="text-slate-500">Critical Incidents:</span> <span className="font-medium">{selectedCard.criticalIncidents || "—"}</span></div>
                </div>
              </div>

              {/* Section 3: Customer Feedback */}
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-mtc-blue text-white text-[10px] font-bold">3</span>
                  Customer Feedback
                </h4>
                <p className="text-sm text-slate-700 pl-7">{selectedCard.customerFeedback || "—"}</p>
              </div>

              {/* Section 4: Risks */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-mtc-blue text-white text-[10px] font-bold">4</span>
                  Risks Identified
                </h4>
                <div className="grid gap-3 pl-7 text-sm">
                  <div><span className="text-slate-500">Operational:</span> <span className="ml-1">{selectedCard.risksOperational || "—"}</span></div>
                  <div><span className="text-slate-500">Commercial:</span> <span className="ml-1">{selectedCard.risksCommercial || "—"}</span></div>
                  <div><span className="text-slate-500">Competitive:</span> <span className="ml-1">{selectedCard.risksCompetitive || "—"}</span></div>
                </div>
              </div>

              {/* Section 5: Opportunities */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-mtc-blue text-white text-[10px] font-bold">5</span>
                  Opportunities
                </h4>
                <div className="grid gap-3 pl-7 text-sm">
                  <div><span className="text-slate-500">Upsell:</span> <span className="ml-1">{selectedCard.opportunitiesUpsell || "—"}</span></div>
                  <div><span className="text-slate-500">Process Improvement:</span> <span className="ml-1">{selectedCard.opportunitiesProcess || "—"}</span></div>
                </div>
              </div>

              {/* Section 6: Action Items */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-mtc-blue text-white text-[10px] font-bold">6</span>
                  Action Items
                </h4>
                {selectedCard.actionItems && selectedCard.actionItems.length > 0 ? (
                  <div className="pl-7">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Owner</TableHead>
                          <TableHead>Deadline</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedCard.actionItems.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{item.action}</TableCell>
                            <TableCell>{item.owner}</TableCell>
                            <TableCell>{item.deadline}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 pl-7">No action items recorded.</p>
                )}
              </div>

              {/* Section 7: Account Health */}
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-mtc-blue text-white text-[10px] font-bold">7</span>
                  Overall Account Health
                </h4>
                <div className="pl-7">
                  {selectedCard.accountHealth ? (
                    <div className="flex items-center gap-3">
                      {["green", "amber", "red"].map((h) => (
                        <div key={h} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border ${selectedCard.accountHealth === h ? "border-slate-400 bg-slate-50 font-medium" : "border-slate-100 text-slate-300"}`}>
                          <span className={`h-3 w-3 rounded-full ${healthColor[h]}`} />
                          <span className="text-sm capitalize">{h}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">Not assessed</span>
                  )}
                </div>
              </div>

              {/* Geolocation */}
              {(selectedCard.geoLatitude || selectedCard.geoLongitude) && (
                <div className="pl-7 text-xs text-slate-400 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  GPS: {selectedCard.geoLatitude}, {selectedCard.geoLongitude}
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-slate-200">
                <Button variant="outline" onClick={() => setSelectedCard(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
