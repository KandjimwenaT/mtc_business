import { useEffect, useMemo, useState } from "react";
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
  Select,
} from "./ui-components";
import { AlertCircle, CheckCircle2, Clock, Loader2, ShieldAlert } from "lucide-react";
import { Link } from "react-router";
import EscalationWorkflowCard from "./EscalationWorkflowCard";
import { getAllTickets, type TicketRecord } from "../api/ticketApi";
import { getCurrentUser } from "../api/authApi";
import { getTicketDetailPath } from "../utils/ticketNavigation";
import {
  escalationLabel,
  formatDurationHours,
  formatTicketTypeLabel,
  getEscalationLevel,
  getSlaState,
  type SlaStateKey,
} from "../utils/sla";
import { getSlaConfigs, type SlaConfigRecord } from "../api/slaApi";

const STATE_FILTERS: { key: "all" | SlaStateKey; label: string }[] = [
  { key: "all", label: "All open" },
  { key: "healthy", label: "On Track" },
  { key: "warning", label: "Warning" },
  { key: "at_risk", label: "At Risk" },
  { key: "breached", label: "Breached" },
];

function slaBadgeVariant(key: SlaStateKey): "success" | "warning" | "danger" | "breached" | "neutral" {
  if (key === "breached") return "breached";
  if (key === "at_risk") return "danger";
  if (key === "warning") return "warning";
  if (key === "healthy") return "success";
  return "neutral";
}

export default function SLAMonitoring() {
  const currentUser = getCurrentUser();
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [configs, setConfigs] = useState<SlaConfigRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | SlaStateKey>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "complaint" | "request">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [ticketRows, sla] = await Promise.all([
          getAllTickets(),
          getSlaConfigs().catch(() => null),
        ]);
        if (cancelled) return;
        setTickets(ticketRows);
        setConfigs(sla?.configs || []);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load SLA monitoring");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openTickets = useMemo(
    () => tickets.filter((t) => !["resolved", "closed", "rejected"].includes(t.status)),
    [tickets]
  );

  const counts = useMemo(() => {
    const result = { healthy: 0, warning: 0, at_risk: 0, breached: 0 };
    for (const ticket of openTickets) {
      const key = getSlaState(ticket).key;
      if (key === "healthy" || key === "warning" || key === "at_risk" || key === "breached") {
        result[key] += 1;
      }
    }
    return result;
  }, [openTickets]);

  const filtered = useMemo(() => {
    return openTickets.filter((ticket) => {
      const matchesCategory = categoryFilter === "all" || ticket.category === categoryFilter;
      const key = getSlaState(ticket).key;
      const matchesState = stateFilter === "all" || key === stateFilter;
      return matchesCategory && matchesState;
    });
  }, [openTickets, categoryFilter, stateFilter]);

  const workflowSample = useMemo(() => {
    return (
      configs.find((c) => c.category === "complaint" && c.ticketType === "network") ||
      configs.find((c) => c.category === "complaint") ||
      configs[0] ||
      null
    );
  }, [configs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2">Loading SLA monitoring…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-red-600">{error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">SLA Monitoring & Escalations</h2>
        <p className="text-sm text-slate-500">
          Live ticket health using the SLA rules configured in My Profile. Warning and at-risk
          thresholds come from remaining hours; escalation levels come from hours since the ticket was logged.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-t-4 border-t-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> On Track
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{counts.healthy}</div>
            <p className="text-xs text-slate-500">Above warning remaining time</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" /> Warning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{counts.warning}</div>
            <p className="text-xs text-slate-500">Inside configured warning window</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" /> At Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{counts.at_risk}</div>
            <p className="text-xs text-slate-500">Inside configured at-risk window</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-slate-900 bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-slate-900" /> Breached
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{counts.breached}</div>
            <p className="text-xs text-red-600 font-medium">Past SLA target</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="gap-3">
            <CardTitle>Tickets by SLA state</CardTitle>
            <div className="flex flex-wrap gap-3">
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as "all" | "complaint" | "request")}
                className="w-40"
              >
                <option value="all">All categories</option>
                <option value="complaint">Complaints</option>
                <option value="request">Requests</option>
              </Select>
              <Select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value as "all" | SlaStateKey)}
                className="w-40"
              >
                {STATE_FILTERS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No tickets match this SLA filter.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>SLA state</TableHead>
                    <TableHead>Time elapsed</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Escalation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((ticket) => {
                    const sla = getSlaState(ticket);
                    const level = getEscalationLevel(ticket);
                    return (
                      <TableRow key={ticket.ticketId}>
                        <TableCell className="font-medium text-mtc-blue">
                          <Link
                            to={getTicketDetailPath(currentUser?.role || "manager", ticket.ticketId)}
                            className="hover:underline"
                          >
                            {ticket.ticketNumber}
                          </Link>
                          <div className="text-xs text-slate-500 font-normal">{ticket.title}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs uppercase text-slate-500">{ticket.category}</div>
                          <div>{formatTicketTypeLabel(ticket.type)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={slaBadgeVariant(sla.key)}>{sla.label}</Badge>
                        </TableCell>
                        <TableCell className={sla.key === "breached" ? "text-red-600 font-medium" : ""}>
                          {formatDurationHours(sla.elapsedHours)}
                          {ticket.slaTargetHours != null ? ` / ${ticket.slaTargetHours}h` : ""}
                        </TableCell>
                        <TableCell>
                          {ticket.slaTargetHours != null ? `${ticket.slaTargetHours}h` : "—"}
                        </TableCell>
                        <TableCell>{escalationLabel(level)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <EscalationWorkflowCard
          l1Hours={workflowSample?.escalateL1Hours}
          l2Hours={workflowSample?.escalateL2Hours}
          l3Hours={workflowSample?.escalateL3Hours}
          sampleLabel={
            workflowSample
              ? `${workflowSample.category === "complaint" ? "Complaint" : "Request"} · ${workflowSample.typeLabel || workflowSample.ticketType}`
              : undefined
          }
        />
      </div>
    </div>
  );
}
