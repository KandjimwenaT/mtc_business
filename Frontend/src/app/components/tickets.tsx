import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { Badge, Button, Card, CardContent, Input, Label, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui-components";
import { Clock, Filter, Loader2, Search, X } from "lucide-react";
import { getAllTickets, getAssignedTickets, type TicketRecord } from "../api/ticketApi";
import { getCurrentUser } from "../api/authApi";
import { format } from "date-fns";
import { isSupervisorRole } from "../utils/roleCapabilities";
import type { StaffLayoutOutletContext } from "../layoutOutletContext";
import { defaultSupervisorBadges } from "../hooks/useSupervisorHybridBadges";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-800" },
  assigned: { label: "Assigned", className: "bg-indigo-100 text-indigo-800" },
  in_progress: { label: "In Progress", className: "bg-yellow-100 text-yellow-800" },
  escalated: { label: "Escalated", className: "bg-orange-100 text-orange-800" },
  resolved: { label: "Resolved", className: "bg-green-100 text-green-800" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
};

const SLA_BADGE_CLASSES: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-orange-100 text-orange-800",
  breached: "bg-red-100 text-red-800",
};

function getSlaInfo(ticket: TicketRecord): { status: "success" | "warning" | "danger" | "breached"; label: string; time: string } {
  if (["resolved", "closed", "rejected"].includes(ticket.status) || !ticket.slaDeadline) {
    return { status: "success", label: "—", time: "" };
  }
  const now = Date.now();
  const deadline = new Date(ticket.slaDeadline).getTime();
  const created = new Date(ticket.createdAt).getTime();
  const diff = deadline - now;
  const total = deadline - created;
  const pctRemaining = total > 0 ? diff / total : 0;
  const absDiff = Math.abs(diff);
  const h = Math.floor(absDiff / 3_600_000);
  const m = Math.floor((absDiff % 3_600_000) / 60_000);
  const timeStr = diff >= 0 ? `${h}h ${m}m left` : `-${h}h ${m}m`;
  if (diff <= 0) return { status: "breached", label: "Breached", time: timeStr };
  if (pctRemaining <= 0.15) return { status: "danger", label: "At Risk", time: timeStr };
  if (pctRemaining <= 0.35) return { status: "warning", label: "Warning", time: timeStr };
  return { status: "success", label: "On Track", time: timeStr };
}

export default function Tickets() {
  const outletCtx = useOutletContext<StaffLayoutOutletContext | undefined>();
  const supervisorBadges = outletCtx?.supervisorBadges ?? defaultSupervisorBadges();
  const currentUser = getCurrentUser();
  const isSupervisor = isSupervisorRole(currentUser?.role);
  const [supervisorView, setSupervisorView] = useState<"executive" | "manager">("executive");
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const refreshBadges = supervisorBadges.refresh;
  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const data = isSupervisor && supervisorView === "executive"
        ? await getAssignedTickets()
        : await getAllTickets();
      setTickets(data);
    } catch (err: any) {
      setError(err.message || "Failed to load tickets");
    } finally {
      setLoading(false);
      if (isSupervisor) void refreshBadges();
    }
  }, [isSupervisor, supervisorView, refreshBadges]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  const filteredTickets = tickets.filter((ticket) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      ticket.ticketNumber.toLowerCase().includes(q) ||
      ticket.title.toLowerCase().includes(q) ||
      (ticket.accountName || "").toLowerCase().includes(q) ||
      ticket.type.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || ticket.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const requestCount = tickets.filter((t) => t.category === "request").length;
  const complaintCount = tickets.filter((t) => t.category === "complaint").length;
  const breachedCount = tickets.filter((t) => getSlaInfo(t).status === "breached").length;
  const atRiskCount = tickets.filter((t) => getSlaInfo(t).status === "danger").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-slate-500">Loading tickets...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Tickets & Complaints</h2>
          <p className="text-sm text-slate-500">
            {isSupervisor && supervisorView === "executive"
              ? "My assigned executive tickets"
              : "Customer tickets linked to your assigned executives"}
          </p>
        </div>
        <Button
          variant={showFilterPanel ? "default" : "outline"}
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" /> Filter
        </Button>
      </div>
      {isSupervisor && (
        <div className="flex items-center gap-2">
          <Button
            variant={supervisorView === "executive" ? "default" : "outline"}
            onClick={() => setSupervisorView("executive")}
            className="inline-flex items-center gap-2"
          >
            My Executive Work
            {supervisorBadges.executiveSideDot && supervisorView === "executive" && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Your executive queue needs attention" />
            )}
          </Button>
          <Button
            variant={supervisorView === "manager" ? "default" : "outline"}
            onClick={() => setSupervisorView("manager")}
            className="inline-flex items-center gap-2"
          >
            Manager Oversight
            {supervisorBadges.managerSideDot && supervisorView === "manager" && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Team oversight queue needs attention" />
            )}
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500">Total</div>
            <div className="text-2xl font-bold">{tickets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500">Requests</div>
            <div className="text-2xl font-bold text-blue-600">{requestCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500">Complaints</div>
            <div className="text-2xl font-bold text-orange-600">{complaintCount}</div>
          </CardContent>
        </Card>
        <Card className={breachedCount > 0 ? "border-red-200 bg-red-50" : ""}>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> SLA Breached
            </div>
            <div className={`text-2xl font-bold ${breachedCount > 0 ? "text-red-600" : "text-green-600"}`}>
              {breachedCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500">SLA At Risk</div>
            <div className="text-2xl font-bold text-orange-600">{atRiskCount}</div>
          </CardContent>
        </Card>
      </div>

      {showFilterPanel && (
        <Card className="animate-in slide-in-from-top-2 border-blue-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-sm text-slate-700">Filters</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowFilterPanel(false);
                  setStatusFilter("all");
                  setCategoryFilter("all");
                }}
              >
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="escalated">Escalated</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                  <option value="rejected">Rejected</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="request">Requests</option>
                  <option value="complaint">Complaints</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-red-700 text-sm">{error}</CardContent>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-4 p-4 border-b border-slate-200">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search by ticket, account, type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket ID</TableHead>
              <TableHead>Corporate</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Submitted By</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                  {tickets.length === 0 ? "No tickets available yet." : "No tickets match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              filteredTickets.map((ticket) => {
                const statusCfg = STATUS_CONFIG[ticket.status] || { label: ticket.status, className: "bg-slate-100 text-slate-600" };
                const sla = getSlaInfo(ticket);
                return (
                  <TableRow key={ticket.ticketId}>
                    <TableCell className="font-medium text-blue-600">
                      <Link to={`/tickets/${ticket.ticketId}`} className="hover:underline">
                        {ticket.ticketNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{ticket.corporateName || ticket.accountName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={ticket.category === "request" ? "default" : "danger"}>{ticket.category}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{ticket.type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{ticket.title}</TableCell>
                    <TableCell>{ticket.priority}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {sla.label === "—" ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SLA_BADGE_CLASSES[sla.status]}`}>
                            {sla.label}
                          </span>
                          <span className="text-xs text-slate-500 whitespace-nowrap">{sla.time}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{ticket.submittedBy}</TableCell>
                    <TableCell>{ticket.assignedTo || "—"}</TableCell>
                    <TableCell>{format(new Date(ticket.createdAt), "dd MMM yyyy")}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
