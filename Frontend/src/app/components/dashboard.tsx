import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { getTicketDetailPath } from "../utils/ticketNavigation";
import { getCurrentUser } from "../api/authApi";
import { getAllTickets, type TicketRecord } from "../api/ticketApi";
import { getAllVisits, type VisitRecord } from "../api/visitApi";
import { getSystemHealth, type SystemHealth } from "../api/adminApi";
import { getSlaHealthLabel, getSlaState } from "../utils/sla";
import { isExecutiveRole } from "../utils/roleCapabilities";
import TicketVolumeChart from "./charts/TicketVolumeChart";
import { ThemeIcon } from "./theme-icon";
import { BreachedSlaBanner } from "./breached-sla-banner";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import inboxIcon from "../../assets/New Theme Icon/inbox.svg";
import calendarIcon from "../../assets/New Theme Icon/calendar-clock.svg";
import ticketsMonthIcon from "../../assets/New Theme Icon/tickets-1.svg";
import starIcon from "../../assets/New Theme Icon/star.svg";
import buildingIcon from "../../assets/New Theme Icon/building-2-1.svg";
import usersIcon from "../../assets/New Theme Icon/users-round.svg";
import fileClockIcon from "../../assets/New Theme Icon/file-clock.svg";
import arrowRightIcon from "../../assets/New Theme Icon/arrow-right.svg";
import alertIcon from "../../assets/New Theme Icon/triangle-alert.svg";
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

function MetricCard({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: string;
  caption: string;
  icon: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3.5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <ThemeIcon src={icon} className="h-4 w-4 text-slate-400" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-3xl font-normal text-slate-800 tabular-nums">{value}</p>
        <p className="text-xs font-normal text-slate-500">{caption}</p>
      </div>
    </div>
  );
}

function ActionLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700">
      {label}
      <ThemeIcon src={arrowRightIcon} className="h-3.5 w-3.5 text-sky-700" />
    </button>
  );
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

  const loadDashboard = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setLoadError("");
    }
    try {
      const [tickets, visits, overview] = await Promise.all([
        getAllTickets().catch(() => [] as TicketRecord[]),
        getAllVisits().catch(() => [] as VisitRecord[]),
        getSystemHealth().catch(() => null),
      ]);
      setAllTickets(tickets);
      setAllVisits(visits);
      setHealth(overview);
    } catch (e: unknown) {
      if (!opts?.silent) {
        setLoadError(e instanceof Error ? e.message : "Failed to load dashboard");
        setAllTickets([]);
        setAllVisits([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useLiveRefresh(["tickets", "visits", "dashboard"], () => {
    void loadDashboard({ silent: true });
  });

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
  const now = new Date();
  const createdThisMonth = health?.tickets.createdThisMonth ?? allTickets.filter((ticket) => {
    const created = new Date(ticket.createdAt);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  const resolvedMtd = health?.tickets.resolvedMtd ?? 0;
  const createdToday = health?.tickets.createdToday ?? 0;
  const unassigned = health?.tickets.unassigned ?? openTickets.filter((ticket) => !ticket.assignedTo).length;
  const ticketsHref =
    currentUser?.role === "customer"
      ? "/customerTickets"
      : isExecutiveRole(currentUser?.role)
        ? "/executive-tickets"
        : "/tickets";
  const corporatesHref = currentUser?.role === "admin" || currentUser?.role === "super_admin" ? "/admin-corporates" : "/corporates";
  const slaHref = currentUser?.role === "admin" || currentUser?.role === "super_admin" || isExecutiveRole(currentUser?.role) ? ticketsHref : "/sla-monitoring";

  return (
    <div className="flex flex-col gap-7 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-3xl font-normal text-slate-800">Overview</h2>
          <p className="text-xs font-normal text-slate-500">Live platform metrics from the database</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(ticketsHref)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
        >
          View tickets
          <ThemeIcon src={arrowRightIcon} className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {loadError && (
        <p className="text-sm text-red-600">{loadError}</p>
      )}

      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-normal text-slate-800">Service operations</h3>
          <p className="text-xs text-slate-500">Tickets, visits & service quality</p>
        </div>

        <BreachedSlaBanner count={breached} loading={loading} onReview={() => navigate(slaHref)} />

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Open Tickets"
            icon={inboxIcon}
            value={loading ? "—" : openCount.toLocaleString()}
            caption={health ? `${unassigned} unassigned · ${ticketTrend}` : "Open request and complaint tickets"}
          />
          <MetricCard
            label="Pending Visits"
            icon={calendarIcon}
            value={loading ? "—" : pendingVisits.toLocaleString()}
            caption={
              nextVisit
                ? `Next: ${nextVisit.accountName} on ${new Date(`${nextVisit.visitDate}T12:00:00`).toLocaleDateString()}`
                : "No upcoming scheduled visits"
            }
          />
          <MetricCard
            label="Tickets this month"
            icon={ticketsMonthIcon}
            value={loading ? "—" : createdThisMonth.toLocaleString()}
            caption={`${resolvedMtd.toLocaleString()} resolved · ${createdToday} today`}
          />
          <MetricCard
            label="Avg Rating"
            icon={starIcon}
            value={loading ? "—" : avgRating != null ? avgRating.toFixed(1) : "—"}
            caption={ratingCount > 0 ? `Based on ${ratingCount.toLocaleString()} visit reviews` : "No customer ratings yet"}
          />
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tickets...
            </div>
          ) : (
            <TicketVolumeChart
              tickets={allTickets}
              title="Ticketing Volume"
              onViewTickets={() => navigate(ticketsHref)}
            />
          )}
        </div>

        <div className="flex min-h-full flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-base font-normal text-slate-800">SLA Health Distribution</h3>
          {loading ? (
            <p className="text-xs text-slate-500">Loading SLA data...</p>
          ) : slaTotal === 0 ? (
            <>
              <div className="inline-flex items-center gap-1.5">
                <ThemeIcon src={alertIcon} className="h-4 w-4 text-yellow-700" />
                <p className="text-xs font-semibold text-yellow-700">Breakdown unavailable</p>
              </div>
              <div className="rounded-lg bg-orange-50 p-3.5">
                <p className="text-xs font-medium text-slate-800">“No open tickets with SLA status”</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {breached > 0
                    ? `The summary reports ${breached.toLocaleString()} breached SLAs, but no SLA breakdown is available. Review the underlying data before assessing SLA health.`
                    : "There are no open tickets with an SLA status to chart."}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="relative h-52 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      id="sla-pie"
                      data={slaData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={72}
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
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs text-slate-500">Open</span>
                  <span className="text-2xl font-normal text-slate-800 tabular-nums">{slaTotal}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                {slaData.map((row) => (
                  <span key={row.name} className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full" style={{ background: row.color }} />
                    {row.name} ({row.value})
                  </span>
                ))}
              </div>
            </>
          )}
          <div className="mt-auto pt-0.5">
            <ActionLink label="Review SLA data" onClick={() => navigate(slaHref)} />
          </div>
        </div>
      </div>

      {health && (
        <section className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-normal text-slate-800">Organization & accounts</h3>
            <p className="text-xs text-slate-500">Portfolio overview</p>
          </div>
          <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-3">
            <div className="flex flex-col gap-2.5 border-slate-200 p-4 md:border-r">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">Corporates</p>
                <ThemeIcon src={buildingIcon} className="h-4 w-4 text-slate-400" />
              </div>
              <p className="text-2xl font-normal text-slate-800 tabular-nums">{health.corporates.total.toLocaleString()}</p>
              <p className="text-xs text-slate-500">
                {health.corporates.approved.toLocaleString()} approved · {health.corporates.waitingApproval} awaiting approval
              </p>
              <ActionLink label="View corporates" onClick={() => navigate(corporatesHref)} />
            </div>
            <div className="flex flex-col gap-2.5 border-slate-200 p-4 md:border-r">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">Active Accounts</p>
                <ThemeIcon src={usersIcon} className="h-4 w-4 text-slate-400" />
              </div>
              <p className="text-2xl font-normal text-slate-800 tabular-nums">{health.accounts.active.toLocaleString()}</p>
              <p className="text-xs text-slate-500">{health.accounts.total.toLocaleString()} accounts in total</p>
              <ActionLink label="View accounts" onClick={() => navigate(corporatesHref)} />
            </div>
            <div className="flex flex-col gap-2.5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">Contracts expiring</p>
                <ThemeIcon src={fileClockIcon} className="h-4 w-4 text-yellow-700" />
              </div>
              <p className="text-2xl font-normal text-slate-800 tabular-nums">{health.contracts.expiringWithin6Months.toLocaleString()}</p>
              <p className="text-xs text-slate-500">
                Within 6 months · {health.visits.completedMtd} visits completed MTD
              </p>
              <ActionLink label="Review contracts" onClick={() => navigate(corporatesHref)} />
            </div>
          </div>
        </section>
      )}

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
