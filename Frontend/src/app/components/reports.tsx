import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { getCurrentUser } from "../api/authApi";
import { getAllTickets, getAssignedTickets, getMyTickets, type TicketRecord } from "../api/ticketApi";
import { getAllVisits, getCustomerVisits, getManagerVisits, getMyVisits, type VisitRecord } from "../api/visitApi";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { getSlaHealthLabel } from "../utils/sla";
import { getTicketDetailPath, getTicketsListPath } from "../utils/ticketNavigation";
import { isSupervisorRole } from "../utils/roleCapabilities";
import { ThemeIcon } from "./theme-icon";
import TicketVolumeChart from "./charts/TicketVolumeChart";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui-components";
import inboxIcon from "../../assets/New Theme Icon/inbox.svg";
import calendarIcon from "../../assets/New Theme Icon/calendar-clock.svg";
import ticketsMonthIcon from "../../assets/New Theme Icon/tickets-1.svg";
import starIcon from "../../assets/New Theme Icon/star.svg";
import alertIcon from "../../assets/New Theme Icon/triangle-alert.svg";
import arrowRightIcon from "../../assets/New Theme Icon/arrow-right.svg";

type Period = "month" | "30" | "90" | "ytd" | "all";
type ReportScope = "customer" | "executive" | "oversight";

const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
];

const OPEN_TICKET_STATUSES = new Set(["new", "assigned", "in_progress", "escalated"]);
const RESOLVED_TICKET_STATUSES = new Set(["resolved", "closed", "completed"]);
const PREVIEW_LIMIT = 8;

function labelize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inPeriod(value: string | null | undefined, period: Period): boolean {
  if (period === "all") return true;
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  if (period === "month") {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }
  if (period === "ytd") return date.getFullYear() === now.getFullYear();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (period === "30" ? 30 : 90));
  return date >= start;
}

function formatWhen(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusVariant(status: string): "success" | "warning" | "danger" | "neutral" | "default" {
  const key = status.toLowerCase();
  if (["completed", "resolved", "closed", "approved", "confirmed"].includes(key)) return "success";
  if (["declined", "cancelled", "canceled", "rejected", "breached"].includes(key)) return "danger";
  if (["pending", "rescheduled", "follow_up_pending", "escalated", "in_progress"].includes(key)) return "warning";
  if (!status) return "neutral";
  return "default";
}

function countBy<T>(items: T[], keyOf: (item: T) => string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = keyOf(item) || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function csvCell(value: string | number | null | undefined): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, sections: { title: string; headers: string[]; rows: (string | number | null | undefined)[][] }[]) {
  const lines: string[] = [];
  sections.forEach((section, index) => {
    if (index > 0) lines.push("");
    lines.push(csvCell(section.title));
    lines.push(section.headers.map(csvCell).join(","));
    section.rows.forEach((row) => lines.push(row.map(csvCell).join(",")));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isMissingAccount(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /no accounts linked/i.test(message);
}

async function loadReport(scope: ReportScope, role: string): Promise<{ tickets: TicketRecord[]; visits: VisitRecord[]; notice: string }> {
  if (scope === "customer") {
    const [ticketsResult, visitsResult] = await Promise.allSettled([getMyTickets(), getCustomerVisits()]);
    const missingAccount =
      (ticketsResult.status === "rejected" && isMissingAccount(ticketsResult.reason)) ||
      (visitsResult.status === "rejected" && isMissingAccount(visitsResult.reason));
    const ticketError = ticketsResult.status === "rejected" && !isMissingAccount(ticketsResult.reason);
    const visitError = visitsResult.status === "rejected" && !isMissingAccount(visitsResult.reason);
    if (ticketError) throw ticketsResult.reason;
    if (visitError) throw visitsResult.reason;
    return {
      tickets: ticketsResult.status === "fulfilled" ? ticketsResult.value : [],
      visits: visitsResult.status === "fulfilled" ? visitsResult.value : [],
      notice: missingAccount ? "No corporate account is linked to your profile yet." : "",
    };
  }

  if (scope === "executive") {
    const [tickets, visits] = await Promise.all([getAssignedTickets(), getMyVisits()]);
    return { tickets, visits, notice: "" };
  }

  const visitsForRole = role === "manager" || role === "supervisor" ? getManagerVisits() : getAllVisits();
  const [tickets, visits] = await Promise.all([getAllTickets(), visitsForRole]);
  return { tickets, visits, notice: "" };
}

function scopeCopy(role: string, scope: ReportScope): string {
  if (role === "customer") return "Tickets and visits for your corporate account.";
  if (scope === "executive") return "Tickets and visits on the accounts assigned to you.";
  if (role === "gm") return "Tickets and visits for the managers who report to you.";
  if (role === "admin") return "Tickets and visits in your department.";
  if (role === "super_admin") return "Tickets and visits across the portal.";
  return "Tickets and visits across your team.";
}

function visitsHref(role: string, scope: ReportScope): string | null {
  if (role === "customer") return "/visitCalendar";
  if (scope === "executive") return "/executive-visits";
  if (role === "admin" || role === "super_admin") return null;
  return "/manager-visits";
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
    <div className="flex flex-col gap-3.5 rounded-xl border border-slate-200 bg-white p-4">
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

function Breakdown({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  const max = rows.reduce((highest, row) => Math.max(highest, row.count), 0);
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-normal text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">Nothing in this period.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.name} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2rem] items-center gap-3">
              <span className="truncate text-xs text-slate-600">{labelize(row.name)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-sky-600"
                  style={{ width: `${max > 0 ? Math.max(8, (row.count / max) * 100) : 0}%` }}
                />
              </span>
              <span className="text-right text-xs tabular-nums text-slate-500">{row.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const role = currentUser?.role ?? "";
  const isSupervisor = isSupervisorRole(role);
  const [period, setPeriod] = useState<Period>("month");
  const [supervisorView, setSupervisorView] = useState<"accounts" | "team">("team");
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const scope: ReportScope = role === "customer"
    ? "customer"
    : role === "executive_staff" || (isSupervisor && supervisorView === "accounts")
      ? "executive"
      : "oversight";

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError("");
    }
    try {
      const data = await loadReport(scope, role);
      setTickets(data.tickets);
      setVisits(data.visits);
      setNotice(data.notice);
    } catch (err: unknown) {
      if (!opts?.silent) {
        setError(err instanceof Error ? err.message : "Failed to load report");
        setTickets([]);
        setVisits([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [scope, role]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(["tickets", "visits"], () => {
    void load({ silent: true });
  });

  const periodTickets = useMemo(
    () => tickets.filter((ticket) => inPeriod(ticket.createdAt, period)),
    [tickets, period],
  );
  const periodVisits = useMemo(
    () => visits.filter((visit) => inPeriod(visit.visitDate || visit.createdAt, period)),
    [visits, period],
  );

  const openTickets = periodTickets.filter((ticket) => OPEN_TICKET_STATUSES.has(ticket.status));
  const resolvedTickets = periodTickets.filter((ticket) => RESOLVED_TICKET_STATUSES.has(ticket.status));
  const completedVisits = periodVisits.filter((visit) => visit.status === "completed" || visit.status === "follow_up_pending");
  const ratedVisits = periodVisits.filter((visit) => visit.customerRating != null);
  const averageRating = ratedVisits.length
    ? ratedVisits.reduce((sum, visit) => sum + (visit.customerRating ?? 0), 0) / ratedVisits.length
    : null;
  const breached = scope === "customer"
    ? 0
    : openTickets.filter((ticket) => getSlaHealthLabel(ticket) === "Breached").length;

  const ticketStatuses = useMemo(() => countBy(periodTickets, (ticket) => ticket.status), [periodTickets]);
  const visitStatuses = useMemo(() => countBy(periodVisits, (visit) => visit.status), [periodVisits]);
  const recentTickets = [...periodTickets]
    .sort((a, b) => (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0))
    .slice(0, PREVIEW_LIMIT);
  const recentVisits = [...periodVisits]
    .sort((a, b) => (parseDate(b.visitDate)?.getTime() ?? 0) - (parseDate(a.visitDate)?.getTime() ?? 0))
    .slice(0, PREVIEW_LIMIT);

  const ticketsPath = isSupervisor ? "/tickets" : getTicketsListPath(role);
  const visitsPath = visitsHref(role, scope);
  const showSla = scope !== "customer";

  const exportReport = () => {
    const periodLabel = PERIODS.find((option) => option.value === period)?.label ?? "report";
    downloadCsv(`mtc-report-${period}.csv`, [
      {
        title: `Tickets (${periodLabel})`,
        headers: ["Ticket", "Title", "Category", "Priority", "Status", "Account", "Created"],
        rows: periodTickets.map((ticket) => [
          ticket.ticketNumber,
          ticket.title,
          ticket.category,
          ticket.priority,
          ticket.status,
          ticket.accountName || ticket.corporateName || "",
          formatWhen(ticket.createdAt),
        ]),
      },
      {
        title: `Visits (${periodLabel})`,
        headers: ["Visit", "Account", "Purpose", "Date", "Status", "Executive", "Rating"],
        rows: periodVisits.map((visit) => [
          visit.visitNumber,
          visit.accountName,
          visit.purpose,
          formatWhen(visit.visitDate),
          visit.status,
          visit.executiveName,
          visit.customerRating ?? "",
        ]),
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-7 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-3xl font-normal text-slate-800">Reports</h2>
          <p className="text-xs font-normal text-slate-500">{scopeCopy(role, scope)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSupervisor && (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              {([
                ["team", "My team"],
                ["accounts", "My accounts"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSupervisorView(value)}
                  className={`h-8 rounded-md px-3 text-xs font-semibold ${
                    supervisorView === value ? "bg-sky-700 text-white" : "text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <select
            aria-label="Report period"
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
          >
            {PERIODS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportReport}
            disabled={loading || (periodTickets.length === 0 && periodVisits.length === 0)}
            className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && !error && <p className="text-sm text-slate-600">{notice}</p>}

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Tickets"
          icon={ticketsMonthIcon}
          value={loading ? "—" : periodTickets.length.toLocaleString()}
          caption={`${loading ? "—" : resolvedTickets.length.toLocaleString()} resolved in this period`}
        />
        <MetricCard
          label="Open tickets"
          icon={inboxIcon}
          value={loading ? "—" : openTickets.length.toLocaleString()}
          caption="Still open from tickets opened in this period"
        />
        <MetricCard
          label="Visits"
          icon={calendarIcon}
          value={loading ? "—" : periodVisits.length.toLocaleString()}
          caption={`${loading ? "—" : completedVisits.length.toLocaleString()} completed or follow-up pending`}
        />
        <MetricCard
          label="Avg rating"
          icon={starIcon}
          value={loading ? "—" : averageRating != null ? averageRating.toFixed(1) : "—"}
          caption={ratedVisits.length > 0 ? `From ${ratedVisits.length.toLocaleString()} rated visits` : "No ratings in this period"}
        />
        {showSla && (
          <MetricCard
            label="Breached SLA"
            icon={alertIcon}
            value={loading ? "—" : breached.toLocaleString()}
            caption="Open tickets in this period that missed SLA"
          />
        )}
        {showSla && (
          <MetricCard
            label="Requests vs complaints"
            icon={ticketsMonthIcon}
            value={loading ? "—" : periodTickets.filter((ticket) => ticket.category === "complaint").length.toLocaleString()}
            caption={`${periodTickets.filter((ticket) => ticket.category === "request").length.toLocaleString()} requests in this period`}
          />
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tickets...
            </div>
          ) : (
            <TicketVolumeChart
              tickets={periodTickets}
              title="Ticket volume"
              onViewTickets={() => navigate(ticketsPath)}
            />
          )}
        </div>
        <Breakdown title="Ticket status" rows={ticketStatuses} />
      </div>

      <Breakdown title="Visit status" rows={visitStatuses} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-normal text-slate-800">Tickets in this period</h3>
          <button
            type="button"
            onClick={() => navigate(ticketsPath)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700"
          >
            View tickets
            <ThemeIcon src={arrowRightIcon} className="h-3.5 w-3.5 text-sky-700" />
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <p className="p-5 text-xs text-slate-500">Loading tickets...</p>
          ) : recentTickets.length === 0 ? (
            <p className="p-5 text-xs text-slate-500">No tickets in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTickets.map((ticket) => (
                  <TableRow
                    key={ticket.ticketId}
                    className="cursor-pointer"
                    onClick={() => navigate(
                      isSupervisor && scope === "oversight"
                        ? `/tickets/${ticket.ticketId}`
                        : getTicketDetailPath(role, ticket.ticketId),
                    )}
                  >
                    <TableCell className="font-medium text-slate-800">{ticket.ticketNumber}</TableCell>
                    <TableCell className="max-w-[16rem] truncate">{ticket.title}</TableCell>
                    <TableCell>{labelize(ticket.priority)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(ticket.status)}>{labelize(ticket.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatWhen(ticket.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && periodTickets.length > PREVIEW_LIMIT && (
            <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              Showing {PREVIEW_LIMIT} of {periodTickets.length.toLocaleString()}. Export includes every row.
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-normal text-slate-800">Visits in this period</h3>
          {visitsPath && (
            <button
              type="button"
              onClick={() => navigate(visitsPath)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700"
            >
              View visits
              <ThemeIcon src={arrowRightIcon} className="h-3.5 w-3.5 text-sky-700" />
            </button>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <p className="p-5 text-xs text-slate-500">Loading visits...</p>
          ) : recentVisits.length === 0 ? (
            <p className="p-5 text-xs text-slate-500">No visits in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visit</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentVisits.map((visit) => (
                  <TableRow key={visit.visitId}>
                    <TableCell className="font-medium text-slate-800">{visit.visitNumber}</TableCell>
                    <TableCell>{visit.accountName || "—"}</TableCell>
                    <TableCell className="max-w-[16rem] truncate">{visit.purpose}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(visit.status)}>{labelize(visit.status)}</Badge>
                    </TableCell>
                    <TableCell>{formatWhen(visit.visitDate)}</TableCell>
                    <TableCell>{visit.customerRating != null ? `${visit.customerRating}/5` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && periodVisits.length > PREVIEW_LIMIT && (
            <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              Showing {PREVIEW_LIMIT} of {periodVisits.length.toLocaleString()}. Export includes every row.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
