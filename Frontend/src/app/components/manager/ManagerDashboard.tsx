import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { getActualRole, getMyProfile, type UserProfile } from "../../api/authApi";
import { profileIsEbu } from "../../utils/departmentSegment";
import { getAllTickets, type TicketRecord } from "../../api/ticketApi";
import { getSlaHealthLabel } from "../../utils/sla";
import { getManagerVisits, type VisitRecord } from "../../api/visitApi";
import { getTeamLeads, type TeamLeadRecord } from "../../api/leadApi";
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
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "../ui-components";
import TicketVolumeChart from "../charts/TicketVolumeChart";
import { ThemeIcon } from "../theme-icon";
import { BreachedSlaBanner } from "../breached-sla-banner";
import usersIcon from "../../../assets/New Theme Icon/users-round.svg";
import inboxIcon from "../../../assets/New Theme Icon/inbox.svg";
import calendarIcon from "../../../assets/New Theme Icon/calendar-clock.svg";
import fileClockIcon from "../../../assets/New Theme Icon/file-clock.svg";
import starIcon from "../../../assets/New Theme Icon/star.svg";
import buildingIcon from "../../../assets/New Theme Icon/building-2-1.svg";
import ticketsIcon from "../../../assets/New Theme Icon/tickets-1.svg";
import arrowRightIcon from "../../../assets/New Theme Icon/arrow-right.svg";
import alertIcon from "../../../assets/New Theme Icon/triangle-alert.svg";
import {
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
  Trophy,
  Loader2,
  Search,
} from "lucide-react";

const EXEC_PAGE_SIZE = 8;

function toISODate(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
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
  typeLabel: "Visit" | "Ticket" | "Escalation" | "Lead" | "Account" | "Control Card";
};

function StatCard({
  label,
  value,
  sub,
  icon,
  iconClassName,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: string;
  iconClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <ThemeIcon src={icon} className={cn("h-4 w-4 text-slate-400", iconClassName)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-3xl font-normal text-slate-800 tabular-nums break-words">{value}</p>
        <p className="text-xs font-normal text-slate-500">{sub}</p>
      </div>
    </div>
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
    Lead: "bg-violet-50 text-violet-800 border-violet-100",
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
  const [teamLeads, setTeamLeads] = useState<TeamLeadRecord[]>([]);
  const [expiringContracts, setExpiringContracts] = useState<ExpiringContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [monthlySpendingTotal, setMonthlySpendingTotal] = useState("0.00");
  const [spendingTrend, setSpendingTrend] = useState<SpendingTrendRecord[]>([]);

  const loadDashboard = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) {
        setLoading(true);
        setError("");
      }
      const profileData = await getMyProfile();
      setProfile(profileData);
      const seesAll = getActualRole() === "super_admin";
      const managerId = profileData.roleProfileId ?? undefined;

      const [
        ticketsRes,
        visitsRes,
        execRes,
        corpRes,
        accRes,
        leadsRes,
        expContractsRes,
        spendingSummaryRes,
        spendingTrendRes,
      ] = await Promise.all([
        getAllTickets().catch(() => [] as TicketRecord[]),
        getManagerVisits().catch(() => [] as VisitRecord[]),
        getExecutives().catch(() => [] as ExecutiveRecord[]),
        managerId != null
          ? getCorporates(managerId).catch(() => [] as CorporateRecord[])
          : seesAll
            ? getCorporates().catch(() => [] as CorporateRecord[])
            : Promise.resolve([] as CorporateRecord[]),
        managerId != null
          ? getAccounts({ managerId }).catch(() => [] as AccountRecord[])
          : getAccounts().catch(() => [] as AccountRecord[]),
        profileIsEbu(profileData) || seesAll
          ? getTeamLeads().catch(() => [] as TeamLeadRecord[])
          : Promise.resolve([] as TeamLeadRecord[]),
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
      setTeamLeads(leadsRes);
      setExpiringContracts(expContractsRes);
      setMonthlySpendingTotal(spendingSummaryRes.total || "0.00");
      setSpendingTrend(spendingTrendRes);
    } catch (e: unknown) {
      if (!opts?.silent) setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useLiveRefresh(["tickets", "visits", "leads", "corporates", "dashboard"], () => {
    void loadDashboard({ silent: true });
  });

  const managerProfileId = profile?.roleProfileId ?? null;

  const teamExecutives = useMemo(() => {
    const scopeIds = new Set(
      [managerProfileId, profile?.personId].filter((id): id is number => typeof id === "number" && id > 0),
    );
    if (!scopeIds.size) return executives;
    const matched = executives.filter((e) => e.managerId != null && scopeIds.has(Number(e.managerId)));
    // The executives API is already limited to this manager's team, including legacy person-id links.
    return matched.length > 0 && matched.length === executives.length ? matched : executives;
  }, [executives, managerProfileId, profile?.personId]);

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
  const breachedCount = tickets.filter((t) => getSlaHealthLabel(t) === "Breached").length;

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
      counts[getSlaHealthLabel(t)] += 1;
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
      const leadCount = teamLeads.filter((lead) => lead.executive?.executiveId === ex.executiveId).length;
      const rated = exVisits.filter((v) => typeof v.customerRating === "number");
      const avgR = rated.length
        ? Math.round((rated.reduce((s, v) => s + Number(v.customerRating), 0) / rated.length) * 10) / 10
        : 0;
      const breached = exTickets.filter((t) => getSlaHealthLabel(t) === "Breached").length;
      const perf = performanceBadge(avgR || 4, breached);
      return {
        executiveId: ex.executiveId,
        name: `${ex.firstName} ${ex.lastName}`,
        corporates: exCorporates || new Set(exTickets.map((t) => t.corporateId).filter(Boolean)).size,
        lines: exAccounts.length,
        openTickets: openT,
        leads: leadCount,
        visitsMtd,
        avgRating: avgR,
        breached,
        perf,
      };
    });
  }, [teamExecutives, scopedTickets, scopedVisits, corporates, accounts, thisMonthKey, teamLeads]);

  const [execSearch, setExecSearch] = useState("");
  const [execPage, setExecPage] = useState(1);

  const filteredExecutiveRows = useMemo(() => {
    const q = execSearch.trim().toLowerCase();
    if (!q) return executiveRows;
    return executiveRows.filter((row) =>
      row.name.toLowerCase().includes(q) ||
      row.perf.label.toLowerCase().includes(q)
    );
  }, [executiveRows, execSearch]);

  const execTotalPages = Math.max(1, Math.ceil(filteredExecutiveRows.length / EXEC_PAGE_SIZE));
  const paginatedExecutiveRows = useMemo(() => {
    const start = (execPage - 1) * EXEC_PAGE_SIZE;
    return filteredExecutiveRows.slice(start, start + EXEC_PAGE_SIZE);
  }, [filteredExecutiveRows, execPage]);

  useEffect(() => {
    setExecPage(1);
  }, [execSearch]);

  useEffect(() => {
    if (execPage > execTotalPages) setExecPage(execTotalPages);
  }, [execPage, execTotalPages]);

  const isEbu = profileIsEbu(profile);

  const activityRows = useMemo((): ActivityRow[] => {
    const rows: ActivityRow[] = [];

    (isEbu ? [...teamLeads] : [])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20)
      .forEach((lead) => {
        const statusLabel = String(lead.status || "pending").replace(/_/g, " ");
        const fallbackExec = lead.executive?.executiveId
          ? teamExecutives.find((e) => e.executiveId === lead.executive?.executiveId)
          : undefined;
        const executiveLabel =
          lead.executive?.fullName ||
          (fallbackExec ? `${fallbackExec.firstName} ${fallbackExec.lastName}` : "-");

        rows.push({
          key: `l-${lead.leadId}`,
          date: toISODate(lead.createdAt),
          executive: executiveLabel,
          activityType: "Lead",
          corporate: lead.companyName || "-",
          outcome: `${lead.productInterest || "Opportunity"} - ${statusLabel}`,
          typeLabel: "Lead",
        });
      });

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
  }, [scopedVisits, scopedTickets, teamExecutives, teamLeads, isEbu]);

  const departmentSubtitle =
    profile?.department?.trim() ||
    profile?.manager?.department?.trim() ||
    "Your department";

  const slaPieTotal = slaBuckets.reduce((s, x) => s + x.value, 0);
  const slaHasBreakdown = slaBuckets.some((row) => row.name !== "No tickets" && row.value > 0);

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
    <div className="flex flex-col gap-7 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-normal text-slate-800">Overview</h1>
          <p className="text-xs text-slate-500">{departmentSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/tickets")}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
        >
          View tickets
          <ThemeIcon src={arrowRightIcon} className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-normal text-slate-800">Team operations</h3>
          <p className="text-xs text-slate-500">Tickets, visits & service quality</p>
        </div>
        <BreachedSlaBanner count={breachedCount} onReview={() => navigate("/sla-monitoring")} />
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Team Size" value={teamExecutives.length} sub="Active executives" icon={usersIcon} />
          <StatCard label="Open Tickets" value={openTicketsCount} sub="Across all executives" icon={inboxIcon} />
          <StatCard label="Visits This Month" value={visitsCompletedThisMonth} sub="Completed this month" icon={calendarIcon} />
          <StatCard
            label="Monthly Spending"
            value={`N$ ${Number(monthlySpendingTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub="Paid invoices this month"
            icon={ticketsIcon}
          />
          <StatCard
            label="Contracts Expiring"
            value={expiringContracts.length}
            sub={
              nextExpiringContract
                ? `${nextExpiringContract.corporateName || nextExpiringContract.accountName} in ${nextExpiringContract.daysRemaining} day(s)`
                : "No upcoming expiries"
            }
            icon={fileClockIcon}
            iconClassName={expiringContracts.length > 0 ? "text-yellow-700" : undefined}
          />
          <StatCard
            label="Avg Customer Rating"
            value={avgCustomerRating > 0 ? avgCustomerRating.toFixed(1) : "—"}
            sub={ratingTrend}
            icon={starIcon}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-normal text-slate-800">Organization & accounts</h3>
          <p className="text-xs text-slate-500">Portfolio overview</p>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Total Corporates" value={corporatesCount} sub={formatTrend(corporatesThisMonth, corporatesLastMonth)} icon={buildingIcon} />
          <StatCard label="Total Lines" value={totalLines} sub={formatTrend(accountsThisMonth, accountsLastMonth)} icon={usersIcon} />
          <StatCard
            label="Visit Completion Rate"
            value={visitCompletionRate ? `${visitCompletionRate}%` : "—"}
            sub={
              visitRateLastMonth
                ? `${visitCompletionRate >= visitRateLastMonth ? "+" : ""}${visitCompletionRate - visitRateLastMonth}% vs last month`
                : formatTrend(visitsCompletedThisMonth, visitsCompletedLastMonth)
            }
            icon={calendarIcon}
          />
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <TicketVolumeChart
            tickets={scopedTickets}
            title="Ticketing Volume"
            onViewTickets={() => navigate("/tickets")}
          />
        </div>
        <div className="flex min-h-full flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-base font-normal text-slate-800">SLA Health Distribution</h3>
          {!slaHasBreakdown ? (
            <>
              <div className="inline-flex items-center gap-1.5">
                <ThemeIcon src={alertIcon} className="h-4 w-4 text-yellow-700" />
                <p className="text-xs font-semibold text-yellow-700">Breakdown unavailable</p>
              </div>
              <div className="rounded-lg bg-orange-50 p-3.5">
                <p className="text-xs font-medium text-slate-800">“No open tickets with SLA status”</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {breachedCount > 0
                    ? `The summary reports ${breachedCount.toLocaleString()} breached SLAs, but no SLA breakdown is available. Review the underlying data before assessing SLA health.`
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
                      data={slaBuckets}
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
                      {slaBuckets.map((entry, index) => (
                        <Cell key={`sla-${entry.name}-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs text-slate-500">Tickets</span>
                  <span className="text-2xl font-normal text-slate-800 tabular-nums">{slaPieTotal}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                {slaBuckets.filter((row) => row.value > 0).map((row) => (
                  <span key={row.name} className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full" style={{ background: row.color }} />
                    {row.name} ({row.value})
                  </span>
                ))}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => navigate("/sla-monitoring")}
            className="mt-auto inline-flex items-center gap-1.5 pt-0.5 text-xs font-semibold text-sky-700"
          >
            Review SLA data
            <ThemeIcon src={arrowRightIcon} className="h-3.5 w-3.5 text-sky-700" />
          </button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-normal text-slate-800">Monthly Spending Trend</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[220px] sm:h-[280px]">
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

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0 border-b border-slate-100 pb-4">
          <div>
            <CardTitle className="text-base font-normal text-slate-800">Executive Performance Overview</CardTitle>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              value={execSearch}
              onChange={(e) => setExecSearch(e.target.value)}
              placeholder="Search executives..."
              className="pl-9"
            />
          </div>
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
                  {isEbu ? <TableHead className="text-right">Leads</TableHead> : null}
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
                    <td colSpan={isEbu ? 10 : 9} className="p-4 text-center text-slate-500 py-10">
                      No executives linked to your team yet.
                    </td>
                  </TableRow>
                ) : paginatedExecutiveRows.length === 0 ? (
                  <TableRow>
                    <td colSpan={isEbu ? 10 : 9} className="p-4 text-center text-slate-500 py-10">
                      No executives match your search.
                    </td>
                  </TableRow>
                ) : (
                  paginatedExecutiveRows.map((row) => (
                    <TableRow key={row.executiveId} className="border-slate-100">
                      <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.corporates}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.lines}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.openTickets}</TableCell>
                      {isEbu ? (
                        <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
                      ) : null}
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
                          className="text-xs font-semibold text-sky-700 hover:underline"
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
          {filteredExecutiveRows.length > 0 && (
            <div className="p-4 border-t border-slate-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-500">
                Showing {(execPage - 1) * EXEC_PAGE_SIZE + (paginatedExecutiveRows.length > 0 ? 1 : 0)}–
                {(execPage - 1) * EXEC_PAGE_SIZE + paginatedExecutiveRows.length} of {filteredExecutiveRows.length}
              </span>
              <div className="flex items-center gap-2 justify-between sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExecPage((p) => Math.max(1, p - 1))}
                  disabled={execPage === 1}
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500">Page {execPage} of {execTotalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExecPage((p) => Math.min(execTotalPages, p + 1))}
                  disabled={execPage >= execTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base font-normal text-slate-800">Recent Department Activities</CardTitle>
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
