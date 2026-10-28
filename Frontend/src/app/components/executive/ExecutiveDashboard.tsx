import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getActualRole, getCurrentUser } from "../../api/authApi";
import { profileIsEbu } from "../../utils/departmentSegment";
import { getTicketDetailPath } from "../../utils/ticketNavigation";
import { type TicketRecord } from "../../api/ticketApi";
import { getSlaHealthLabel } from "../../utils/sla";
import { getMyLeads, type LeadRecord as LeadApiRecord } from "../../api/leadApi";
import { useExecutiveData } from "../../hooks/useExecutiveData";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { ThemeIcon } from "../theme-icon";
import { BreachedSlaBanner } from "../breached-sla-banner";
import buildingIcon from "../../../assets/New Theme Icon/building-2-1.svg";
import inboxIcon from "../../../assets/New Theme Icon/inbox.svg";
import calendarIcon from "../../../assets/New Theme Icon/calendar-clock.svg";
import starIcon from "../../../assets/New Theme Icon/star.svg";
import ticketsIcon from "../../../assets/New Theme Icon/tickets-1.svg";
import fileClockIcon from "../../../assets/New Theme Icon/file-clock.svg";
import arrowRightIcon from "../../../assets/New Theme Icon/arrow-right.svg";
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
  TableRow
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
  Cell
} from "recharts";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

function MetricCard({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: string | number;
  caption: string;
  icon: string;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <ThemeIcon src={icon} className="h-4 w-4 text-slate-400" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="break-words text-3xl font-normal text-slate-800 tabular-nums">{value}</p>
        <p className="text-xs text-slate-500">{caption}</p>
      </div>
    </div>
  );
}

function toISODate(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function ExecutiveDashboard() {
  const currentUser = getCurrentUser();
  const navigate = useNavigate();
  const executiveName = currentUser?.firstName || "Executive";
  const [leads, setLeads] = useState<LeadApiRecord[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const {
    accounts,
    tickets,
    visits,
    profile,
    expiringContracts,
    spendingSummary,
    spendingTrend,
    initialLoading,
    error,
  } = useExecutiveData();
  const isEbu = profileIsEbu(profile) || getActualRole() === "super_admin";

  useEffect(() => {
    let isMounted = true;
    const loadLeads = async () => {
      if (!isEbu) {
        if (isMounted) {
          setLeads([]);
          setLeadsLoading(false);
        }
        return;
      }
      try {
        const rows = await getMyLeads();
        if (isMounted) {
          setLeads(rows);
        }
      } catch (error) {
        console.error("Failed to load executive leads", error);
        if (isMounted) {
          setLeads([]);
        }
      } finally {
        if (isMounted) {
          setLeadsLoading(false);
        }
      }
    };

    void loadLeads();
    return () => {
      isMounted = false;
    };
  }, [isEbu]);

  useLiveRefresh(["leads"], () => {
    if (!isEbu) return;
    void getMyLeads()
      .then(setLeads)
      .catch(() => {});
  });

  const monthlySpendingTotal = spendingSummary?.total || "0.00";
  const managerName = profile?.manager
    ? `${profile.manager.firstName || ""} ${profile.manager.lastName || ""}`.trim() || "N/A"
    : "N/A";
  const managerDepartment = profile?.manager
    ? profile.manager.department || profile.department || "N/A"
    : profile?.department || "N/A";
  const managerEmail = profile?.manager?.email || "N/A";

  const corporatesMap = useMemo(() => {
    const map = new Map<
      number,
      {
        corporate: string;
        lines: number;
        openTickets: number;
        visits: number;
        lastVisit: string;
        health: string;
        healthVariant: "success" | "warning" | "neutral" | "breached";
        value: string;
      }
    >();

    accounts.forEach((acc) => {
      if (!acc.corporateId) return;
      if (!map.has(acc.corporateId)) {
        map.set(acc.corporateId, {
          corporate: acc.corporateName || "Unknown Corporate",
          lines: 0,
          openTickets: 0,
          visits: 0,
          lastVisit: "N/A",
          health: "Healthy",
          healthVariant: "success",
          value: "N$ 0.00",
        });
      }
      const existing = map.get(acc.corporateId)!;
      existing.lines += acc.services?.length ?? 0;
    });

    tickets.forEach((ticket) => {
      if (!ticket.corporateId || !map.has(ticket.corporateId)) return;
      if (!["resolved", "closed", "rejected"].includes(ticket.status)) {
        map.get(ticket.corporateId)!.openTickets += 1;
      }
    });

    visits.forEach((visit) => {
      if (!visit.corporateId || !map.has(visit.corporateId)) return;
      const corp = map.get(visit.corporateId)!;
      corp.visits += 1;
      const visitDate = visit.visitDate || "";
      if (!corp.lastVisit || corp.lastVisit === "N/A" || visitDate > corp.lastVisit) {
        corp.lastVisit = visitDate;
      }
    });

    map.forEach((corp, corporateId) => {
      const corpTickets = tickets.filter((t) => t.corporateId === corporateId);
      const breached = corpTickets.filter((t) => getSlaHealthLabel(t) === "Breached").length;
      const atRisk = corpTickets.filter((t) => getSlaHealthLabel(t) === "At Risk").length;
      const warning = corpTickets.filter((t) => getSlaHealthLabel(t) === "Warning").length;
      if (breached > 0) {
        corp.health = "At Risk";
        corp.healthVariant = "neutral";
      } else if (atRisk > 0 || warning > 0) {
        corp.health = "Warning";
        corp.healthVariant = "warning";
      } else {
        corp.health = "Good";
        corp.healthVariant = "success";
      }
      const corporateMonthly = accounts
        .filter((a) => a.corporateId === corporateId)
        .reduce((sum, a) => sum + Number(a.monthlySpending || 0), 0);
      corp.value = `N$ ${corporateMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    });

    return map;
  }, [accounts, tickets, visits]);

  const portfolioRows = Array.from(corporatesMap.values()).sort((a, b) => b.lines - a.lines);
  const corporateCount = corporatesMap.size;
  const totalLines = portfolioRows.reduce((sum, row) => sum + row.lines, 0);
  const activeLeadsCount = leads.filter((lead) => ["pending", "in_progress", "ongoing"].includes(lead.status)).length;
  const monthlyLeadsCount = leads.filter((lead) => {
    const createdAt = new Date(lead.createdAt);
    const now = new Date();
    return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
  }).length;
  const openTicketsCount = tickets.filter((t) => !["resolved", "closed", "rejected"].includes(t.status)).length;
  const breachedSlaCount = tickets.filter((t) => getSlaHealthLabel(t) === "Breached").length;
  const pendingVisitsCount = visits.filter((v) => ["pending", "approved", "confirmed", "rescheduled"].includes(v.status)).length;
  const nextVisitDate = visits
    .filter((v) => ["pending", "approved", "confirmed", "rescheduled"].includes(v.status))
    .map((v) => v.visitDate)
    .filter(Boolean)
    .sort()[0];
  const ratedVisits = visits.filter((v) => typeof v.customerRating === "number");
  const avgRating = ratedVisits.length
    ? ratedVisits.reduce((sum, v) => sum + Number(v.customerRating || 0), 0) / ratedVisits.length
    : 0;

  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4)
    .map((t) => {
      const statusNormalized = (t.status || "").toLowerCase();
      const statusVariant =
        statusNormalized === "resolved" || statusNormalized === "closed"
          ? "success"
          : statusNormalized === "rejected"
            ? "danger"
            : "warning";
      const slaStatus = getSlaHealthLabel(t);
      const slaVariant =
        slaStatus === "Breached"
          ? "breached"
          : slaStatus === "At Risk"
            ? "danger"
            : slaStatus === "Warning"
              ? "warning"
              : "success";
      return {
        ticketId: t.ticketId,
        id: t.ticketNumber,
        corporate: t.corporateName || t.accountName || "N/A",
        subject: t.title,
        status: t.status.replace(/_/g, " "),
        statusVariant: statusVariant as "success" | "warning" | "danger",
        sla: slaStatus,
        slaVariant: slaVariant as "success" | "warning" | "danger" | "breached",
      };
    });

  const upcomingVisits = [...visits]
    .filter((v) => ["pending", "approved", "confirmed", "rescheduled"].includes(v.status))
    .sort((a, b) => `${a.visitDate} ${a.startTime}`.localeCompare(`${b.visitDate} ${b.startTime}`))
    .slice(0, 3)
    .map((v) => ({
      id: v.visitNumber,
      corporate: v.corporateName || v.accountName || "N/A",
      dateTime: `${v.visitDate} ${v.startTime}`,
      purpose: v.purpose || "N/A",
      status: v.status.charAt(0).toUpperCase() + v.status.slice(1),
      statusVariant:
        v.status === "confirmed" || v.status === "approved"
          ? ("success" as const)
          : v.status === "declined" || v.status === "cancelled"
            ? ("danger" as const)
            : ("warning" as const),
    }));

  const backOfficeActivities = [...tickets]
    .filter((t) => ["assigned", "in_progress", "escalated", "new"].includes(t.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4)
    .map((t) => ({
      id: t.ticketNumber,
      corporate: t.corporateName || t.accountName || "N/A",
      type: `${t.category}: ${t.type.replace(/_/g, " ")}`,
      assignedTo: t.assignedTo || "Back Office",
      status: t.status.replace(/_/g, " "),
      statusVariant: t.status === "in_progress" ? ("warning" as const) : ("neutral" as const),
      dueDate: t.slaDeadline ? toISODate(t.slaDeadline) : "N/A",
    }));

  const ticketsChartData = useMemo(() => {
    const dayMap: Record<string, { name: string; new: number; resolved: number }> = {};
    DAY_LABELS.forEach((d) => {
      dayMap[d] = { name: d, new: 0, resolved: 0 };
    });

    const weekday = (dateInput: string) => {
      const idx = new Date(dateInput).getDay();
      return idx === 0 || idx === 6 ? null : DAY_LABELS[idx - 1];
    };

    tickets.forEach((t) => {
      const createdDay = weekday(t.createdAt);
      if (createdDay) dayMap[createdDay].new += 1;
      if (["resolved", "closed"].includes(t.status)) {
        const resolvedDay = weekday(t.updatedAt);
        if (resolvedDay) dayMap[resolvedDay].resolved += 1;
      }
    });

    return DAY_LABELS.map((d) => dayMap[d]);
  }, [tickets]);

  const slaData = useMemo(() => {
    const counts = {
      Healthy: 0,
      Warning: 0,
      "At Risk": 0,
      Breached: 0,
    };

    tickets
      .filter((t) => !["resolved", "closed", "rejected"].includes(t.status))
      .forEach((t) => {
        counts[getSlaHealthLabel(t)] += 1;
      });

    return [
      { name: "Healthy", value: counts.Healthy, color: "#22c55e" },
      { name: "Warning", value: counts.Warning, color: "#60a5fa" },
      { name: "At Risk", value: counts["At Risk"], color: "#ef4444" },
      { name: "Breached", value: counts.Breached, color: "#0A1628" },
    ];
  }, [tickets]);

  if (initialLoading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center text-slate-500">
        Loading executive dashboard...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-3xl font-normal text-slate-800">Overview</h2>
          <p className="text-xs text-slate-500">Manage your corporate portfolio</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/executive-tickets")}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
        >
          View tickets
          <ThemeIcon src={arrowRightIcon} className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Executive</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{executiveName}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Manager</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{managerName}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Department</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{managerDepartment}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Contact</p>
          <p className="mt-1 break-all text-sm font-medium text-sky-700">{managerEmail}</p>
        </div>
      </div>

      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-normal text-slate-800">Service operations</h3>
          <p className="text-xs text-slate-500">Tickets, visits & service quality</p>
        </div>
        <BreachedSlaBanner count={breachedSlaCount} loading={initialLoading} onReview={() => navigate("/executive-tickets")} />
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="My Corporates" value={corporateCount} caption={`${totalLines} total lines`} icon={buildingIcon} />
          <MetricCard label="Open Tickets" value={openTicketsCount} caption={`${breachedSlaCount} breached SLA`} icon={inboxIcon} />
          <MetricCard label="Pending Visits" value={pendingVisitsCount} caption={`Next: ${nextVisitDate || "N/A"}`} icon={calendarIcon} />
          <MetricCard label="Avg Rating" value={avgRating > 0 ? avgRating.toFixed(1) : "—"} caption={`Breached SLAs: ${breachedSlaCount}`} icon={starIcon} />
          <MetricCard
            label="Monthly Spending"
            value={`N$ ${Number(monthlySpendingTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            caption={`${expiringContracts.length} contracts expiring in 6 months`}
            icon={ticketsIcon}
          />
          <MetricCard
            label="Contracts expiring"
            value={expiringContracts.length}
            caption="Within 6 months"
            icon={fileClockIcon}
          />
          {isEbu ? (
            <MetricCard
              label="My Leads"
              value={leadsLoading ? "..." : leads.length}
              caption={leadsLoading ? "Loading leads..." : `${activeLeadsCount} active · ${monthlyLeadsCount} this month`}
              icon={inboxIcon}
            />
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base font-normal text-slate-800">Ticketing Volume</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[220px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketsChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: 'rgba(226, 232, 240, 0.4)'}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="new" name="New Tickets" fill="#0369a1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resolved" name="Resolved" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base font-normal text-slate-800">SLA Health Distribution</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="h-[220px] sm:h-[300px] flex items-center justify-center relative w-full min-w-0">
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
                <span className="text-sm text-slate-500">Total</span>
                <span className="text-2xl font-normal text-slate-800">{slaData.reduce((sum, row) => sum + row.value, 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-normal text-slate-800">Monthly Spending Trend</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[220px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spendingTrend.map((point) => ({ month: point.month, total: Number(point.total || 0) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total" name="Spending (NAD)" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-normal text-slate-800">My Corporate Portfolio</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corporate</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Open Tickets</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead>Health Score</TableHead>
                <TableHead>Monthly Value</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolioRows.slice(0, 10).map((row) => (
                <TableRow key={row.corporate}>
                  <TableCell className="font-medium">{row.corporate}</TableCell>
                  <TableCell>{row.lines}</TableCell>
                  <TableCell>{row.openTickets}</TableCell>
                  <TableCell>{row.visits}</TableCell>
                  <TableCell>{row.lastVisit}</TableCell>
                  <TableCell>
                    <Badge variant={row.healthVariant}>{row.health}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{row.value}</TableCell>
                  <TableCell className="text-right">
                    <button className="text-xs font-semibold text-sky-700 hover:underline">View</button>
                  </TableCell>
                </TableRow>
              ))}
              {portfolioRows.length === 0 && (
                <TableRow>
                  <TableCell className="text-slate-500">No corporate portfolio data available.</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
          {portfolioRows.length > 10 && (
            <div className="flex justify-end pt-4">
              <button
                onClick={() => navigate("/corporates")}
                className="text-xs font-semibold text-sky-700 hover:underline"
              >
                See more ({portfolioRows.length - 10} more) →
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-normal text-slate-800">Recent Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket ID</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTickets.map((ticket) => (
                  <TableRow key={ticket.ticketId}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => navigate(getTicketDetailPath(currentUser?.role, ticket.ticketId))}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {ticket.id}
                      </button>
                    </TableCell>
                    <TableCell>{ticket.corporate}</TableCell>
                    <TableCell>{ticket.subject}</TableCell>
                    <TableCell>
                      <Badge variant={ticket.statusVariant}>{ticket.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ticket.slaVariant}>{ticket.sla}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {recentTickets.length === 0 && (
                  <TableRow>
                    <TableCell className="text-slate-500">No recent tickets.</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-4 text-center">
              <button
                className="text-xs font-semibold text-sky-700 hover:underline"
                onClick={() => navigate("/executive-tickets")}
              >
                View All Tickets
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-normal text-slate-800">Upcoming Visits</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visit ID</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingVisits.map((visit) => (
                  <TableRow key={visit.id}>
                    <TableCell className="font-medium">{visit.id}</TableCell>
                    <TableCell>{visit.corporate}</TableCell>
                    <TableCell>{visit.dateTime}</TableCell>
                    <TableCell>{visit.purpose}</TableCell>
                    <TableCell>
                      <Badge variant={visit.statusVariant}>{visit.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {upcomingVisits.length === 0 && (
                  <TableRow>
                    <TableCell className="text-slate-500">No upcoming visits.</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="mt-4 text-center">
              <button
                className="text-xs font-semibold text-sky-700 hover:underline"
                onClick={() => navigate("/executive-visits")}
              >
                View All Visits
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-normal text-slate-800">Back Office Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity ID</TableHead>
                <TableHead>Corporate</TableHead>
                <TableHead>Activity Type</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backOfficeActivities.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.id}</TableCell>
                  <TableCell>{row.corporate}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.assignedTo}</TableCell>
                  <TableCell>
                    <Badge variant={row.statusVariant}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>{row.dueDate}</TableCell>
                </TableRow>
              ))}
              {backOfficeActivities.length === 0 && (
                <TableRow>
                  <TableCell className="text-slate-500">No back office activities.</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {error && (
        <Card className="border-red-200">
          <CardContent className="pt-6 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}
    </div>
  );
}