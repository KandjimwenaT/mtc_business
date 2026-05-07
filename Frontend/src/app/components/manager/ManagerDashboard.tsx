import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router";
import { getMyProfile, type UserProfile } from "../../api/authApi";
import { getAllTickets, type TicketRecord } from "../../api/ticketApi";
import { getManagerVisits, type VisitRecord } from "../../api/visitApi";
import {
  getExecutives,
  getCorporates,
  getAccounts,
  getExpiringContracts,
  getManagerMonthlySpendingSummary,
  getManagerMonthlySpendingTrend,
  type ExecutiveRecord,
  type CorporateRecord,
  type AccountRecord,
  type ExpiringContractRecord,
  type SpendingTrendRecord,
} from "../../api/adminApi";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "../ui-components";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Users,
  Headphones,
  CalendarDays,
  AlertCircle,
  Clock,
  TrendingUp,
  List,
  Trophy,
  Loader2,
} from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

function toISODate(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function getSlaStatus(ticket: TicketRecord): "Healthy" | "Warning" | "At Risk" | "Breached" {
  if (!ticket.slaDeadline || ["resolved", "closed", "rejected"].includes(ticket.status)) {
    return "Healthy";
  }
  const now = Date.now();
  const deadline = new Date(ticket.slaDeadline).getTime();
  const created = new Date(ticket.createdAt).getTime();
  const diff = deadline - now;
  const total = deadline - created;
  const pctRemaining = total > 0 ? diff / total : 0;
  if (diff <= 0) return "Breached";
  if (pctRemaining <= 0.15) return "At Risk";
  if (pctRemaining <= 0.35) return "Warning";
  return "Healthy";
}

function monthKey(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 7);
}

/** AVR submitted or visit fully closed — counts as “held” for KPIs. */
function visitExecutedWithReport(v: Pick<VisitRecord, "status">) {
  return v.status === "completed" || v.status === "follow_up_pending";
}

function recordCreatedAt(r: { created_at?: string; createdAt?: string }): string {
  return r.created_at || r.createdAt || "";
}

function formatTrend(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "New this period" : "No prior data";
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}% vs last month`;
}

type ActivityRow = {
  key: string;
  date: string;
  executive: string;
  activityType: string;
  corporate: string;
  outcome: string;
  typeLabel: "Visit" | "Ticket" | "Escalation" | "Account" | "Control Card";
};

function StatCard({
  label,
  value,
  sub,
  subClassName,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: string | number;
  sub: string;
  subClassName?: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
}) {
  return (
    <Card className="rounded-xl border border-slate-200/90 shadow-sm bg-white">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex justify-between items-start gap-2">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <Icon className={cn("h-5 w-5 shrink-0 text-slate-400", iconClassName)} />
        </div>
        <div className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">{value}</div>
        <p className={cn("text-xs mt-1", subClassName ?? "text-slate-400")}>{sub}</p>
      </CardContent>
    </Card>
  );
}

function TrendStatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <Card className="rounded-xl border border-slate-200/90 shadow-sm bg-white">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex justify-between items-start gap-2">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <TrendingUp className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        </div>
        <div className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">{value}</div>
        <p className="text-xs mt-1 font-medium text-emerald-600">{sub}</p>
      </CardContent>
    </Card>
  );
}

function performanceBadge(rating: number, breached: number): { label: string; className: string } {
  if (breached > 2 || rating < 3.5) {
    return { label: "Needs Improvement", className: "bg-slate-100 text-slate-700 border border-slate-200" };
  }
  if (rating >= 4.2 && breached === 0) {
    return { label: "Excellent", className: "bg-emerald-50 text-emerald-800 border border-emerald-100" };
  }
  return { label: "Good", className: "bg-sky-50 text-sky-800 border border-sky-100" };
}

function activityTypeBadge(type: ActivityRow["typeLabel"]) {
  const map: Record<ActivityRow["typeLabel"], string> = {
    Visit: "bg-emerald-50 text-emerald-800 border-emerald-100",
    Ticket: "bg-blue-50 text-blue-800 border-blue-100",
    Escalation: "bg-white text-slate-700 border border-slate-200",
    Account: "bg-sky-50 text-sky-800 border-sky-100",
    "Control Card": "bg-slate-50 text-slate-700 border border-slate-200",
  };
  return map[type];
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [executives, setExecutives] = useState<ExecutiveRecord[]>([]);
  const [corporates, setCorporates] = useState<CorporateRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [expiringContracts, setExpiringContracts] = useState<ExpiringContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [monthlySpendingTotal, setMonthlySpendingTotal] = useState("0.00");
  const [spendingTrend, setSpendingTrend] = useState<SpendingTrendRecord[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const profileData = await getMyProfile();
        setProfile(profileData);
        const managerId = profileData.roleProfileId ?? undefined;

        const [ticketsRes, visitsRes, execRes, corpRes, accRes, expContractsRes, spendingSummaryRes, spendingTrendRes] = await Promise.all([
          getAllTickets().catch(() => [] as TicketRecord[]),
          getManagerVisits().catch(() => [] as VisitRecord[]),
          getExecutives().catch(() => [] as ExecutiveRecord[]),
          managerId != null
            ? getCorporates(managerId).catch(() => [] as CorporateRecord[])
            : Promise.resolve([] as CorporateRecord[]),
          managerId != null
            ? getAccounts({ managerId }).catch(() => [] as AccountRecord[])
            : getAccounts().catch(() => [] as AccountRecord[]),
          getExpiringContracts(6).catch(() => [] as ExpiringContractRecord[]),
          getManagerMonthlySpendingSummary().catch(() => ({
            total: "0.00",
            currency: "NAD",
            byCorporate: {},
            byAccount: {},
          })),
          getManagerMonthlySpendingTrend(6).catch(() => [] as SpendingTrendRecord[]),
        ]);

        setTickets(ticketsRes);
        setVisits(visitsRes);
        setExecutives(execRes);
        setCorporates(corpRes);
        setAccounts(accRes);
        setExpiringContracts(expContractsRes);
        setMonthlySpendingTotal(spendingSummaryRes.total || "0.00");
        setSpendingTrend(spendingTrendRes);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const managerProfileId = profile?.roleProfileId ?? null;

  const teamExecutives = useMemo(() => {
    if (managerProfileId == null) return executives;
    return executives.filter((e) => e.managerId === managerProfileId);
  }, [executives, managerProfileId]);

  const teamExecIds = useMemo(
    () => new Set(teamExecutives.map((e) => e.executiveId)),
    [teamExecutives],
  );

  const scopedTickets = useMemo(() => {
    if (managerProfileId == null || teamExecIds.size === 0) return tickets;
    return tickets.filter((t) => t.executiveId != null && teamExecIds.has(t.executiveId));
  }, [tickets, managerProfileId, teamExecIds]);

  const scopedVisits = visits;

  const openStatuses = new Set(["new", "assigned", "in_progress", "escalated"]);

  const openTicketsCount = scopedTickets.filter((t) => openStatuses.has(t.status)).length;
  const breachedCount = scopedTickets.filter((t) => getSlaStatus(t) === "Breached").length;

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const visitsCompletedThisMonth = scopedVisits.filter(
    (v) => visitExecutedWithReport(v) && monthKey(v.visitDate) === thisMonthKey,
  ).length;

  const visitsCompletedLastMonth = scopedVisits.filter(
    (v) => visitExecutedWithReport(v) && monthKey(v.visitDate) === lastMonthKey,
  ).length;

  const visitsScheduledThisMonth = scopedVisits.filter((v) => monthKey(v.visitDate) === thisMonthKey).length;
  const visitCompletionRate =
    visitsScheduledThisMonth > 0
      ? Math.round((visitsCompletedThisMonth / visitsScheduledThisMonth) * 100)
      : scopedVisits.length
        ? Math.round(
            (scopedVisits.filter((v) => visitExecutedWithReport(v)).length / Math.max(scopedVisits.length, 1)) * 100,
          )
        : 0;

  const ratedVisits = scopedVisits.filter((v) => typeof v.customerRating === "number");
  const avgCustomerRating = ratedVisits.length
    ? Math.round((ratedVisits.reduce((s, v) => s + Number(v.customerRating), 0) / ratedVisits.length) * 10) / 10
    : 0;

  const corporatesCount = corporates.length || new Set(scopedTickets.map((t) => t.corporateId).filter(Boolean)).size;
  const totalLines = accounts.length;
  const nextExpiringContract = expiringContracts[0] || null;

  const corporatesThisMonth = corporates.filter((c) => monthKey(recordCreatedAt(c)) === thisMonthKey).length;
  const corporatesLastMonth = corporates.filter((c) => monthKey(recordCreatedAt(c)) === lastMonthKey).length;

  const accountsThisMonth = accounts.filter((a) => monthKey(recordCreatedAt(a)) === thisMonthKey).length;
  const accountsLastMonth = accounts.filter((a) => monthKey(recordCreatedAt(a)) === lastMonthKey).length;

  const ratedThisMonth = scopedVisits.filter(
    (v) => typeof v.customerRating === "number" && monthKey(v.visitDate) === thisMonthKey,
  );
  const ratedLastMonth = scopedVisits.filter(
    (v) => typeof v.customerRating === "number" && monthKey(v.visitDate) === lastMonthKey,
  );
  const avgThisMonth =
    ratedThisMonth.length > 0
      ? ratedThisMonth.reduce((s, v) => s + Number(v.customerRating), 0) / ratedThisMonth.length
      : 0;
  const avgLastMonth =
    ratedLastMonth.length > 0
      ? ratedLastMonth.reduce((s, v) => s + Number(v.customerRating), 0) / ratedLastMonth.length
      : 0;
  const ratingTrend =
    avgLastMonth > 0 ? `${avgThisMonth >= avgLastMonth ? "+" : ""}${(avgThisMonth - avgLastMonth).toFixed(1)} vs last month` : "— vs last month";

  const visitsDoneLastMonthCount = scopedVisits.filter(
    (v) => visitExecutedWithReport(v) && monthKey(v.visitDate) === lastMonthKey,
  ).length;
  const visitRateLastMonth = (() => {
    const sched = scopedVisits.filter((v) => monthKey(v.visitDate) === lastMonthKey).length;
    if (!sched) return 0;
    return Math.round((visitsDoneLastMonthCount / sched) * 100);
  })();

  const slaBuckets = useMemo(() => {
    const counts = { Healthy: 0, Warning: 0, "At Risk": 0, Breached: 0 };
    scopedTickets.forEach((t) => {
      counts[getSlaStatus(t)] += 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) {
      return [{ name: "No tickets", value: 1, color: "#e2e8f0" }];
    }
    return [
      { name: "Healthy", value: counts.Healthy, color: "#22c55e" },
      { name: "Warning", value: counts.Warning, color: "#60a5fa" },
      { name: "At Risk", value: counts["At Risk"], color: "#f97316" },
      { name: "Breached", value: counts.Breached, color: "#ef4444" },
    ].filter((x) => x.value > 0);
  }, [scopedTickets]);

  const ticketsChartData = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const byDay: Record<string, { new: number; resolved: number }> = {};
    DAY_LABELS.forEach((d) => {
      byDay[d] = { new: 0, resolved: 0 };
    });
    scopedTickets.forEach((t) => {
      const ts = new Date(t.createdAt).getTime();
      if (ts < cutoff) return;
      const day = new Date(t.createdAt).toLocaleDateString("en-US", { weekday: "short" }) as (typeof DAY_LABELS)[number];
      if (!byDay[day]) return;
      byDay[day].new += 1;
      if (["resolved", "closed"].includes(t.status)) byDay[day].resolved += 1;
    });
    return DAY_LABELS.map((name) => ({ name, new: byDay[name].new, resolved: byDay[name].resolved }));
  }, [scopedTickets]);

  const executiveRows = useMemo(() => {
    return teamExecutives.map((ex) => {
      const exTickets = scopedTickets.filter((t) => t.executiveId === ex.executiveId);
      const exVisits = scopedVisits.filter((v) => v.executiveId === ex.executiveId);
      const exCorporates = corporates.filter((c) => c.executiveId === ex.executiveId).length;
      const corpIds = new Set(
        corporates.filter((c) => c.executiveId === ex.executiveId).map((c) => c.corporateId),
      );
      const exAccounts = accounts.filter((a) => a.corporateId != null && corpIds.has(a.corporateId));
      const openT = exTickets.filter((t) => openStatuses.has(t.status)).length;
      const visitsMtd = exVisits.filter((v) => monthKey(v.visitDate) === thisMonthKey).length;
      const rated = exVisits.filter((v) => typeof v.customerRating === "number");
      const avgR = rated.length
        ? Math.round((rated.reduce((s, v) => s + Number(v.customerRating), 0) / rated.length) * 10) / 10
        : 0;
      const breached = exTickets.filter((t) => getSlaStatus(t) === "Breached").length;
      const perf = performanceBadge(avgR || 4, breached);
      return {
        executiveId: ex.executiveId,
        name: `${ex.firstName} ${ex.lastName}`,
        corporates: exCorporates || new Set(exTickets.map((t) => t.corporateId).filter(Boolean)).size,
        lines: exAccounts.length,
        openTickets: openT,
        visitsMtd,
        avgRating: avgR,
        breached,
        perf,
      };
    });
  }, [teamExecutives, scopedTickets, scopedVisits, corporates, accounts, thisMonthKey]);

  const activityRows = useMemo((): ActivityRow[] => {
    const rows: ActivityRow[] = [];

    [...scopedVisits]
      .sort((a, b) => (a.visitDate < b.visitDate ? 1 : a.visitDate > b.visitDate ? -1 : 0))
      .slice(0, 20)
      .forEach((v) => {
      rows.push({
        key: `v-${v.visitId}`,
        date: toISODate(v.visitDate),
        executive: v.executiveName,
        activityType: "Visit",
        corporate: v.corporateName || v.accountName,
        outcome:
          v.status === "completed"
            ? "Visit closed (AVR complete)"
            : v.status === "follow_up_pending"
              ? "Meeting report filed — AVR sections 6–7 pending"
              : v.status === "pending"
              ? "Awaiting customer response"
              : `${v.purpose || "Visit update"}`.slice(0, 80),
        typeLabel: "Visit",
      });
    });

    [...scopedTickets]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20)
      .forEach((t) => {
      const isEsc = t.status === "escalated";
      const exec = t.executiveId ? teamExecutives.find((e) => e.executiveId === t.executiveId) : undefined;
      const executiveLabel = exec ? `${exec.firstName} ${exec.lastName}` : "—";
      rows.push({
        key: `t-${t.ticketId}`,
        date: toISODate(t.createdAt),
        executive: executiveLabel,
        activityType: isEsc ? "Escalation" : "Ticket",
        corporate: t.corporateName || t.accountName || "—",
        outcome:
          t.status === "resolved"
            ? "Issue resolved within SLA"
            : `${t.title} — ${t.status.replace(/_/g, " ")}`.slice(0, 90),
        typeLabel: isEsc ? "Escalation" : "Ticket",
      });
    });

    return rows
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 12);
  }, [scopedVisits, scopedTickets, teamExecutives]);

  const departmentSubtitle =
    profile?.department?.trim() ||
    profile?.manager?.department?.trim() ||
    "Your department";

  const slaPieTotal = slaBuckets.reduce((s, x) => s + x.value, 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
        <p className="text-sm">Loading management dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Management Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">{departmentSubtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Team Size"
          value={teamExecutives.length}
          sub="Active executives"
          icon={Users}
        />
        <StatCard
          label="Open Tickets"
          value={openTicketsCount}
          sub="Across all executives"
          icon={Headphones}
        />
        <StatCard
          label="Visits This Month"
          value={visitsCompletedThisMonth}
          sub="Completed this month"
          icon={CalendarDays}
        />
        <StatCard
          label="Breached SLAs"
          value={breachedCount}
          sub="Requires attention"
          subClassName="text-red-600 font-medium"
          icon={AlertCircle}
          iconClassName="text-red-500"
        />
        <StatCard
          label="Monthly Spending"
          value={`N$ ${Number(monthlySpendingTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub="Paid invoices this month"
          icon={TrendingUp}
          iconClassName="text-emerald-500"
        />
        <StatCard
          label="Contracts Expiring (6M)"
          value={expiringContracts.length}
          sub={
            nextExpiringContract
              ? `${nextExpiringContract.corporateName || nextExpiringContract.accountName} in ${nextExpiringContract.daysRemaining} day(s)`
              : "No upcoming expiries"
          }
          subClassName={expiringContracts.length > 0 ? "text-amber-700 font-medium" : "text-slate-400"}
          icon={Clock}
          iconClassName={expiringContracts.length > 0 ? "text-amber-500" : "text-slate-400"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TrendStatCard
          label="Total Corporates"
          value={corporatesCount}
          sub={formatTrend(corporatesThisMonth, corporatesLastMonth)}
        />
        <TrendStatCard
          label="Total Lines"
          value={totalLines}
          sub={formatTrend(accountsThisMonth, accountsLastMonth)}
        />
        <TrendStatCard
          label="Avg Customer Rating"
          value={avgCustomerRating > 0 ? avgCustomerRating.toFixed(1) : "—"}
          sub={ratingTrend}
        />
        <TrendStatCard
          label="Visit Completion Rate"
          value={visitCompletionRate ? `${visitCompletionRate}%` : "—"}
          sub={
            visitRateLastMonth
              ? `${visitCompletionRate >= visitRateLastMonth ? "+" : ""}${visitCompletionRate - visitRateLastMonth}% vs last month`
              : formatTrend(visitsCompletedThisMonth, visitsCompletedLastMonth)
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="lg:col-span-4 rounded-xl border border-slate-200/90 shadow-sm">
          <CardHeader>
            <CardTitle>Ticketing Volume</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketsChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(226, 232, 240, 0.4)" }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Bar dataKey="new" name="New Tickets" fill="#0072CE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resolved" name="Resolved" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 rounded-xl border border-slate-200/90 shadow-sm">
          <CardHeader>
            <CardTitle>SLA Health Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center relative min-h-[300px] min-w-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slaBuckets}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={88}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {slaBuckets.map((entry, index) => (
                      <Cell key={`sla-${entry.name}-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center pointer-events-none">
                <span className="text-sm text-slate-500">Tickets</span>
                <span className="text-2xl font-bold text-slate-800">{slaPieTotal || "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border border-slate-200/90 shadow-sm">
        <CardHeader>
          <CardTitle>Monthly Spending Trend</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spendingTrend.map((p) => ({ month: p.month, total: Number(p.total || 0) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Spending (NAD)"
                  stroke="#16a34a"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-slate-100 bg-white pb-4">
          <Users className="h-5 w-5 text-mtc-blue shrink-0" />
          <CardTitle className="text-lg">Executive Performance Overview</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead>Executive</TableHead>
                  <TableHead className="text-right">Corporates</TableHead>
                  <TableHead className="text-right">Total Lines</TableHead>
                  <TableHead className="text-right">Open Tickets</TableHead>
                  <TableHead className="text-right">Visits (MTD)</TableHead>
                  <TableHead className="text-right">Avg Rating</TableHead>
                  <TableHead className="text-right">Breached SLA</TableHead>
                  <TableHead>Performance</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executiveRows.length === 0 ? (
                  <TableRow>
                    <td colSpan={9} className="p-4 text-center text-slate-500 py-10">
                      No executives linked to your team yet.
                    </td>
                  </TableRow>
                ) : (
                  executiveRows.map((row) => (
                    <TableRow key={row.executiveId} className="border-slate-100">
                      <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.corporates}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.lines}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.openTickets}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.visitsMtd}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center justify-end gap-1 tabular-nums">
                          <Trophy
                            className={cn(
                              "h-4 w-4 shrink-0",
                              row.avgRating >= 4.2 ? "text-amber-500" : "text-slate-300",
                            )}
                          />
                          {row.avgRating > 0 ? row.avgRating.toFixed(1) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-800 px-2">
                          {row.breached}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                            row.perf.className,
                          )}
                        >
                          {row.perf.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          className="text-mtc-blue hover:underline text-sm font-medium"
                          onClick={() => navigate("/tickets")}
                        >
                          View
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-slate-100 bg-white pb-4">
          <List className="h-5 w-5 text-mtc-blue shrink-0" />
          <CardTitle className="text-lg">Recent Department Activities</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead>Date</TableHead>
                  <TableHead>Executive</TableHead>
                  <TableHead>Activity Type</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activityRows.length === 0 ? (
                  <TableRow>
                    <td colSpan={6} className="p-4 text-center text-slate-500 py-10">
                      No recent activities.
                    </td>
                  </TableRow>
                ) : (
                  activityRows.map((row) => (
                    <TableRow key={row.key} className="border-slate-100">
                      <TableCell className="whitespace-nowrap text-slate-600">{row.date}</TableCell>
                      <TableCell className="text-slate-800">{row.executive}</TableCell>
                      <TableCell className="text-slate-600">{row.activityType}</TableCell>
                      <TableCell className="text-slate-800">{row.corporate}</TableCell>
                      <TableCell className="text-slate-600 max-w-[280px]">{row.outcome}</TableCell>
                      <TableCell>
                        <Badge
                          variant="neutral"
                          className={cn("font-medium border", activityTypeBadge(row.typeLabel))}
                        >
                          {row.typeLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
