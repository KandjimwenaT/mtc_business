import { useState } from "react";
import { useNavigate } from "react-router";
import { getTicketDetailPath } from "../../utils/ticketNavigation";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Search, Filter, X, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { ThemeIcon } from "../theme-icon";
import ticketsIcon from "../../../assets/New Theme Icon/tickets.svg";
import inboxIcon from "../../../assets/New Theme Icon/inbox.svg";
import alertIcon from "../../../assets/New Theme Icon/triangle-alert.svg";
import alarmIcon from "../../../assets/New Theme Icon/alarm-clock.svg";
import { type TicketRecord } from "../../api/ticketApi";
import { getSlaInfo } from "../../utils/sla";
import { getCurrentUser } from "../../api/authApi";
import { format } from "date-fns";
import StaffTicketCreate from "../staff/StaffTicketCreate";
import { useExecutiveData } from "../../hooks/useExecutiveData";

const CHIP = "inline-flex items-center rounded-md border px-2 py-[3px] text-[10px] font-semibold";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "border-sky-200 bg-sky-50 text-sky-700" },
  assigned: { label: "Assigned", className: "border-indigo-200 bg-indigo-50 text-sky-700" },
  in_progress: { label: "In Progress", className: "border-amber-200 bg-amber-50 text-amber-700" },
  escalated: { label: "Escalated", className: "border-orange-200 bg-orange-50 text-orange-700" },
  resolved: { label: "Resolved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  closed: { label: "Closed", className: "border-slate-200 bg-slate-50 text-slate-600" },
  rejected: { label: "Rejected", className: "border-rose-200 bg-red-50 text-rose-700" },
};

const SLA_BADGE_CLASSES: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-orange-200 bg-orange-50 text-orange-700",
  breached: "border-rose-200 bg-red-50 text-rose-700",
};

function MetricCard({
  label,
  value,
  caption,
  icon,
  valueClassName = "text-slate-800",
}: {
  label: string;
  value: string;
  caption: string;
  icon: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium leading-tight text-slate-500">{label}</p>
        <ThemeIcon src={icon} className="h-4 w-4 text-slate-400" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className={`text-3xl font-normal tabular-nums ${valueClassName}`}>{value}</p>
        <p className="text-xs font-normal text-slate-500">{caption}</p>
      </div>
    </div>
  );
}

export default function ExecutiveTickets() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState<"all" | "breached" | "danger" | "warning">("all");
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);

  const { tickets, initialLoading: loading, error, refreshTickets } = useExecutiveData();

  const fetchTickets = async () => {
    await refreshTickets();
  };

  const toggleExpand = (ticket: TicketRecord) => {
    if (expandedTicketId === ticket.ticketId) {
      setExpandedTicketId(null);
    } else {
      setExpandedTicketId(ticket.ticketId);
    }
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      searchQuery === "" ||
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ticket.accountName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || ticket.category === categoryFilter;
    const matchesSla = slaFilter === "all" || getSlaInfo(ticket).status === slaFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesSla;
  });

  const requestCount = tickets.filter((t) => t.category === "request").length;
  const complaintCount = tickets.filter((t) => t.category === "complaint").length;
  const openCount = tickets.filter((t) => !["resolved", "closed", "rejected"].includes(t.status)).length;
  const breachedCount = tickets.filter((t) => getSlaInfo(t).status === "breached").length;
  const atRiskCount = tickets.filter((t) => getSlaInfo(t).status === "danger").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-sky-700" />
        <span className="ml-2 text-slate-500">Loading assigned tickets...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-normal text-slate-800">Assigned Tickets</h2>
          <p className="text-xs text-slate-500">View tickets from your linked customer accounts (handled by assigned admins)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="w-full sm:w-auto"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? "Hide Create Ticket" : "Create Ticket"}
          </Button>
          <Button
            variant={showFilterPanel ? "default" : "outline"}
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className="flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Filter className="h-4 w-4" /> Filter
          </Button>
        </div>
      </div>
      {showCreateForm && (
        <StaffTicketCreate
          showHeading={false}
          onCreated={() => {
            setShowCreateForm(false);
            void fetchTickets();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Total Assigned" value={tickets.length.toLocaleString()} caption="Tickets linked to you" icon={ticketsIcon} />
        <MetricCard label="Open" value={openCount.toLocaleString()} caption="Still in progress" icon={inboxIcon} />
        <MetricCard label="Requests" value={requestCount.toLocaleString()} caption="Service requests" icon={inboxIcon} />
        <MetricCard label="Complaints" value={complaintCount.toLocaleString()} caption="Customer complaints" icon={alertIcon} />
        <MetricCard
          label="SLA Breached"
          value={breachedCount.toLocaleString()}
          caption={breachedCount > 0 ? "Open tickets past their deadline" : "No open tickets past their deadline"}
          icon={alarmIcon}
          valueClassName={breachedCount > 0 ? "text-rose-700" : "text-emerald-700"}
        />
      </div>

      {/* Filter panel */}
      {showFilterPanel && (
        <Card className="animate-in slide-in-from-top-2">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-normal text-slate-800">Filters</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowFilterPanel(false); setStatusFilter("all"); setCategoryFilter("all"); setSlaFilter("all"); }}
              >
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="request">Requests</SelectItem>
                    <SelectItem value="complaint">Complaints</SelectItem>
                  </SelectContent>
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

      {/* Tickets table */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 p-4 border-b border-slate-200">
          <div className="relative w-full sm:flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search by ID, title, account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === "all"
                  ? "border-slate-200 bg-white text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                  : "border-transparent bg-slate-100 text-slate-500 hover:text-slate-800"
              }`}
            >
              All ({tickets.length})
            </button>
            <button
              onClick={() => setCategoryFilter("request")}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === "request"
                  ? "border-slate-200 bg-white text-sky-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                  : "border-transparent bg-slate-100 text-slate-500 hover:text-slate-800"
              }`}
            >
              Requests ({requestCount})
            </button>
            <button
              onClick={() => setCategoryFilter("complaint")}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === "complaint"
                  ? "border-slate-200 bg-white text-slate-800 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                  : "border-transparent bg-slate-100 text-slate-500 hover:text-slate-800"
              }`}
            >
              Complaints ({complaintCount})
            </button>
            {breachedCount > 0 && (
              <button
                onClick={() => setSlaFilter(slaFilter === "breached" ? "all" : "breached")}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  slaFilter === "breached"
                    ? "border-rose-200 bg-red-50 text-rose-700"
                    : "border-transparent bg-slate-100 text-slate-500 hover:text-slate-800"
                }`}
              >
                Breached ({breachedCount})
              </button>
            )}
            {atRiskCount > 0 && (
              <button
                onClick={() => setSlaFilter(slaFilter === "danger" ? "all" : "danger")}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  slaFilter === "danger"
                    ? "border-orange-200 bg-orange-50 text-orange-700"
                    : "border-transparent bg-slate-100 text-slate-500 hover:text-slate-800"
                }`}
              >
                At Risk ({atRiskCount})
              </button>
            )}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket ID</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Submitted By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                  {tickets.length === 0
                    ? "No tickets assigned to you yet."
                    : "No tickets match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              filteredTickets.map((ticket) => {
                const statusCfg = STATUS_CONFIG[ticket.status] || { label: ticket.status, className: "border-slate-200 bg-slate-50 text-slate-600" };
                const sla = getSlaInfo(ticket);
                const isExpanded = expandedTicketId === ticket.ticketId;

                return (
                  <TableRow key={ticket.ticketId} className="group">
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => navigate(getTicketDetailPath(currentUser?.role, ticket.ticketId))}
                        className="text-xs font-semibold text-sky-700 hover:underline"
                      >
                        {ticket.ticketNumber}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium text-slate-800">{ticket.accountName || "—"}</TableCell>
                    <TableCell>
                      <span className={`${CHIP} capitalize ${ticket.category === "request" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-rose-200 bg-red-50 text-rose-700"}`}>
                        {ticket.category}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize">{ticket.type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{ticket.title}</TableCell>
                    <TableCell>
                      <span
                        className={`${CHIP} capitalize ${
                          ticket.priority === "critical" ? "border-rose-200 bg-red-50 text-rose-700" :
                          ticket.priority === "high" ? "border-orange-200 bg-orange-50 text-orange-700" :
                          ticket.priority === "medium" ? "border-amber-200 bg-amber-50 text-amber-700" :
                          "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {ticket.priority}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`${CHIP} ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {sla.label === "—" ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`${CHIP} ${SLA_BADGE_CLASSES[sla.status]}`}>
                            {sla.label}
                          </span>
                          <span className="text-xs text-slate-500">{sla.time}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{ticket.submittedBy}</TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {format(new Date(ticket.createdAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggleExpand(ticket)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Expanded detail panel — rendered below the table */}
        {expandedTicketId && (() => {
          const ticket = tickets.find((t) => t.ticketId === expandedTicketId);
          if (!ticket) return null;
          return (
            <div className="border-t border-slate-200 bg-slate-50 p-6 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-normal text-slate-800">
                  {ticket.ticketNumber} — {ticket.title}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setExpandedTicketId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Ticket description */}
              {ticket.description && (
                <div className="mb-4 p-3 bg-white rounded border border-slate-200">
                  <p className="text-xs font-medium text-slate-500 mb-1">Customer Description</p>
                  <p className="text-sm text-slate-700">{ticket.description}</p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Current Status</Label>
                  <Input value={STATUS_CONFIG[ticket.status]?.label || ticket.status} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Assigned To</Label>
                  <Input value={ticket.assignedTo || "Admin Unassigned"} readOnly />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Resolution</Label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    value={ticket.resolution || "No resolution yet."}
                    readOnly
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Admin Notes</Label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    value={ticket.notes || "No notes yet."}
                    readOnly
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setExpandedTicketId(null)}>Close</Button>
              </div>
            </div>
          );
        })()}
      </Card>
    </div>
  );
}
