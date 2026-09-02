import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getTicketDetailPath } from "../utils/ticketNavigation";
import { getCurrentUser } from "../api/authApi";
import { getAllTickets, type TicketRecord } from "../api/ticketApi";
import { getAllVisits, type VisitRecord } from "../api/visitApi";
import { getSystemHealth, type SystemHealth } from "../api/adminApi";
import { getSlaHealthLabel, getSlaState } from "../utils/sla";
import TicketVolumeChart from "./charts/TicketVolumeChart";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  Badge,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./ui-components";
import { 
  PieChart, 
  Pie, 
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Loader2 } from "lucide-react";

const PRIORITY_FILTER_OPTIONS = ["critical", "high", "medium", "low"] as const;
const STATUS_FILTER_OPTIONS = ["assigned", "inprogress", "completed"] as const;

const SLA_COLORS: Record<string, string> = {
  Healthy: "#22c55e",
  Warning: "#60a5fa",
  "At Risk": "#ef4444",
  Breached: "#0A1628",
};

const OPEN_TICKET_STATUSES = new Set(["new", "assigned", "in_progress", "escalated"]);

function formatTrend(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "New this period" : "No prior-month tickets";
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}% vs last month`;
}

function slaBadgeForTicket(ticket: TicketRecord): { label: string; variant: "success" | "warning" | "breached" | "neutral" } {
  const state = getSlaState(ticket);
  if (state.key === "closed" || !ticket.slaDeadline) return { label: "No SLA", variant: "neutral" };
  if (state.key === "breached") return { label: "Breached", variant: "breached" };
  if (state.key === "at_risk") return { label: "At Risk", variant: "warning" };
  if (state.key === "warning") return { label: "Warning", variant: "warning" };
  return { label: "Healthy", variant: "success" };
}

export default function Dashboard() {
  const currentUser = getCurrentUser();
  const navigate = useNavigate();
  const [allTickets, setAllTickets] = useState<TicketRecord[]>([]);
  const [allVisits, setAllVisits] = useState<VisitRecord[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [tickets, visits, overview] = await Promise.all([
          getAllTickets().catch(() => [] as TicketRecord[]),
          getAllVisits().catch(() => [] as VisitRecord[]),
          getSystemHealth().catch(() => null),
        ]);
        if (cancelled) return;
        setAllTickets(tickets);
        setAllVisits(visits);
        setHealth(overview);
      } catch (e: unknown) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load dashboard");
          setAllTickets([]);
          setAllVisits([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const averageRatingsByAccount = useMemo(() => {
    const grouped = new Map<number, { total: number; count: number }>();
    allVisits.forEach((visit) => {
      if (visit.customerRating == null || !visit.accountId) return;
      const current = grouped.get(visit.accountId) ?? { total: 0, count: 0 };
      current.total += visit.customerRating;
      current.count += 1;
      grouped.set(visit.accountId, current);
    });
    const averageMap = new Map<number, number>();
    grouped.forEach((value, key) => {
      averageMap.set(key, value.total / value.count);
    });
    return averageMap;
  }, [allVisits]);

  const openTickets = useMemo(
    () => allTickets.filter((t) => OPEN_TICKET_STATUSES.has(t.status)),
    [allTickets]
  );

  const slaData = useMemo(() => {
    const counts = { Healthy: 0, Warning: 0, "At Risk": 0, Breached: 0 };
    openTickets.forEach((ticket) => {
      counts[getSlaHealthLabel(ticket)] += 1;
    });
    return (Object.entries(counts) as [keyof typeof counts, number][])
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value, color: SLA_COLORS[name] }));
  }, [openTickets]);

  const slaTotal = slaData.reduce((sum, row) => sum + row.value, 0);

  const filteredRecentTickets = useMemo(() => {
    const normalizeStatus = (status: string): "assigned" | "inprogress" | "completed" | "other" => {
      const normalized = status.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
      if (normalized === "assigned") return "assigned";
      if (normalized === "inprogress") return "inprogress";
      if (normalized === "completed" || normalized === "resolved" || normalized === "closed") return "completed";
      return "other";
    };

    return allTickets
      .filter((ticket) => categoryFilter === "all" || ticket.category === categoryFilter)
      .filter((ticket) => priorityFilter === "all" || ticket.priority === priorityFilter)
      .filter((ticket) => statusFilter === "all" || normalizeStatus(ticket.status) === statusFilter)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }, [allTickets, categoryFilter, priorityFilter, statusFilter]);

  const categoryOptions = useMemo(
    () => [...new Set(allTickets.map((ticket) => ticket.category).filter(Boolean))],
    [allTickets]
  );

  const openCount = health?.tickets.open ?? openTickets.length;
  const pendingVisits = health?.visits.pending ?? allVisits.filter((v) =>
    ["pending", "approved", "confirmed", "rescheduled"].includes(v.status)
  ).length;
  const avgRating = health?.visits.avgRating;
  const ratingCount = health?.visits.ratingCount ?? 0;
  const breached = health?.tickets.breachedSla ?? openTickets.filter((t) => getSlaHealthLabel(t) === "Breached").length;
  const nextVisit = health?.visits.nextVisit;
  const ticketTrend = health
    ? formatTrend(health.tickets.createdThisMonth, health.tickets.createdLastMonth)
    : "";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Overview</h2>
          <p className="text-sm text-slate-500">Live platform metrics from the database</p>
        </div>
        {health?.database && (
          <Badge variant={health.database.status === "ok" ? "success" : "danger"}>
            Database {health.database.status === "ok" ? "connected" : "unreachable"}
          </Badge>
        )}
      </div>

      {loadError && (
        <p className="text-sm text-red-600">{loadError}</p>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{loading ? "—" : openCount.toLocaleString()}</div>
            <p className="text-xs text-slate-500">
              {health ? `${health.tickets.unassigned} unassigned · ${ticketTrend}` : "Open request and complaint tickets"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Visits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{loading ? "—" : pendingVisits.toLocaleString()}</div>
            <p className="text-xs text-slate-500">
              {nextVisit
                ? `Next: ${nextVisit.accountName} on ${new Date(`${nextVisit.visitDate}T12:00:00`).toLocaleDateString()}`
                : "No upcoming scheduled visits"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-mtc-blue tabular-nums">
              {loading ? "—" : avgRating != null ? avgRating.toFixed(1) : "—"}
            </div>
            <p className="text-xs text-slate-500">
              {ratingCount > 0 ? `Based on ${ratingCount.toLocaleString()} visit reviews` : "No customer ratings yet"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Breached SLAs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">{loading ? "—" : breached.toLocaleString()}</div>
            <p className={`text-xs font-medium ${breached > 0 ? "text-red-500" : "text-slate-500"}`}>
              {breached > 0 ? "Open tickets past their SLA deadline" : "No open SLA breaches"}
            </p>
          </CardContent>
        </Card>
      </div>

      {health && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-sm font-medium text-slate-500">Corporates</p>
              <div className="text-2xl font-bold mt-1 tabular-nums">{health.corporates.total.toLocaleString()}</div>
              <p className="text-xs text-slate-400 mt-1">
                {health.corporates.approved.toLocaleString()} approved · {health.corporates.waitingApproval} awaiting approval
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-sm font-medium text-slate-500">Active Accounts</p>
              <div className="text-2xl font-bold mt-1 tabular-nums">{health.accounts.active.toLocaleString()}</div>
              <p className="text-xs text-slate-400 mt-1">{health.accounts.total.toLocaleString()} accounts in total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-sm font-medium text-slate-500">Tickets this month</p>
              <div className="text-2xl font-bold mt-1 tabular-nums">{health.tickets.createdThisMonth.toLocaleString()}</div>
              <p className="text-xs text-slate-400 mt-1">
                {health.tickets.resolvedMtd.toLocaleString()} resolved · {health.tickets.createdToday} today
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-sm font-medium text-slate-500">Contracts expiring</p>
              <div className="text-2xl font-bold mt-1 tabular-nums">{health.contracts.expiringWithin6Months.toLocaleString()}</div>
              <p className="text-xs text-slate-400 mt-1">
                Within 6 months · {health.visits.completedMtd} visits completed MTD
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Ticketing Volume</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {loading ? (
              <div className="h-[220px] sm:h-[300px] flex items-center justify-center text-slate-500 text-sm gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading tickets...
              </div>
            ) : (
              <TicketVolumeChart tickets={allTickets} />
            )}
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>SLA Health Distribution</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="h-[220px] sm:h-[300px] flex items-center justify-center relative w-full min-w-0">
              {loading ? (
                <p className="text-sm text-slate-500">Loading SLA data...</p>
              ) : slaTotal === 0 ? (
                <p className="text-sm text-slate-500">No open tickets with SLA status</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        id="sla-pie"
                        data={slaData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {slaData.map((entry, index) => (
                          <Cell key={`sla-cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-sm text-slate-500">Open</span>
                    <span className="text-2xl font-bold tabular-nums">{slaTotal}</span>
                  </div>
                </>
              )}
            </div>
            {slaData.length > 0 && (
              <div className="flex flex-wrap justify-center gap-3 text-xs text-slate-500 mt-2">
                {slaData.map((row) => (
                  <span key={row.name} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
                    {row.name} ({row.value})
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Tickets & Ratings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </Select>
            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="all">All Priorities</option>
              {PRIORITY_FILTER_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              {STATUS_FILTER_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "inprogress"
                    ? "In Progress"
                    : status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Corporate / Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Request Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-6 text-center text-slate-500">
                    Loading recent tickets...
                  </TableCell>
                </TableRow>
              ) : filteredRecentTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-6 text-center text-slate-500">
                    No tickets found for selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecentTickets.map((ticket) => {
                  const slaBadge = slaBadgeForTicket(ticket);
                  const rating = averageRatingsByAccount.get(ticket.accountId);
                  return (
                    <TableRow key={ticket.ticketId}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => navigate(getTicketDetailPath(currentUser?.role, ticket.ticketId))}
                          className="font-medium text-blue-600 hover:underline text-left"
                        >
                          {ticket.ticketNumber}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="truncate">{ticket.corporateName || ticket.accountName || "N/A"}</div>
                        {typeof rating === "number" && (
                          <div className="text-xs text-amber-600">{`Rating ${rating.toFixed(1)}/5`}</div>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{ticket.category}</TableCell>
                      <TableCell>{ticket.type || "N/A"}</TableCell>
                      <TableCell className="max-w-[280px] truncate">{ticket.title || ticket.type}</TableCell>
                      <TableCell>{ticket.priority || "N/A"}</TableCell>
                      <TableCell>{ticket.status}</TableCell>
                      <TableCell>
                        <Badge variant={slaBadge.variant}>{slaBadge.label}</Badge>
                      </TableCell>
                      <TableCell>{ticket.assignedTo || "Unassigned"}</TableCell>
                      <TableCell>{ticket.slaDeadline ? new Date(ticket.slaDeadline).toLocaleDateString() : "N/A"}</TableCell>
                      <TableCell className="text-right">
                        <button
                          className="text-mtc-blue hover:underline text-sm font-medium"
                          onClick={() => navigate(getTicketDetailPath(currentUser?.role, ticket.ticketId))}
                        >
                          View
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
