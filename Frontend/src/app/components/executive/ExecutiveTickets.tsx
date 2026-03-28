import { useState, useEffect } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Search, Filter, X, Loader2, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { getAssignedTickets, type TicketRecord } from "../../api/ticketApi";
import { format } from "date-fns";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-800" },
  assigned: { label: "Assigned", className: "bg-indigo-100 text-indigo-800" },
  in_progress: { label: "In Progress", className: "bg-yellow-100 text-yellow-800" },
  escalated: { label: "Escalated", className: "bg-orange-100 text-orange-800" },
  resolved: { label: "Resolved", className: "bg-green-100 text-green-800" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
};

function getSlaInfo(ticket: TicketRecord): { status: "success" | "warning" | "danger" | "breached"; label: string; time: string } {
  // Resolved / closed / rejected tickets — SLA not applicable
  if (["resolved", "closed", "rejected"].includes(ticket.status) || !ticket.slaDeadline) {
    return { status: "success", label: "—", time: "" };
  }

  const now = Date.now();
  const deadline = new Date(ticket.slaDeadline).getTime();
  const created = new Date(ticket.createdAt).getTime();
  const diff = deadline - now;
  const total = deadline - created;
  const pctRemaining = total > 0 ? diff / total : 0;

  // Format remaining time
  const absDiff = Math.abs(diff);
  const h = Math.floor(absDiff / 3_600_000);
  const m = Math.floor((absDiff % 3_600_000) / 60_000);
  const timeStr = diff >= 0 ? `${h}h ${m}m left` : `-${h}h ${m}m`;

  if (diff <= 0) return { status: "breached", label: "Breached", time: timeStr };
  if (pctRemaining <= 0.15) return { status: "danger", label: "At Risk", time: timeStr };
  if (pctRemaining <= 0.35) return { status: "warning", label: "Warning", time: timeStr };
  return { status: "success", label: "On Track", time: timeStr };
}

const SLA_BADGE_CLASSES: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-orange-100 text-orange-800",
  breached: "bg-red-100 text-red-800",
};

export default function ExecutiveTickets() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState<"all" | "breached" | "danger" | "warning">("all");
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);

  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await getAssignedTickets();
      setTickets(data);
    } catch (err: any) {
      setError(err.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

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
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-slate-500">Loading assigned tickets...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Assigned Tickets</h2>
          <p className="text-sm text-slate-500">View tickets from your linked customer accounts (handled by assigned admins)</p>
        </div>
        <Button
          variant={showFilterPanel ? "default" : "outline"}
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" /> Filter
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500">Total Assigned</div>
            <div className="text-2xl font-bold">{tickets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500">Open</div>
            <div className="text-2xl font-bold text-amber-600">{openCount}</div>
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
      </div>

      {/* Filter panel */}
      {showFilterPanel && (
        <Card className="animate-in slide-in-from-top-2 border-blue-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-sm text-slate-700">Filters</h4>
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
        <div className="flex items-center gap-4 p-4 border-b border-slate-200">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search by ID, title, account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                categoryFilter === "all"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-slate-100 text-slate-800 border-transparent hover:bg-slate-200"
              }`}
            >
              All ({tickets.length})
            </button>
            <button
              onClick={() => setCategoryFilter("request")}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                categoryFilter === "request"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-blue-100 text-blue-800 border-transparent hover:bg-blue-200"
              }`}
            >
              Requests ({requestCount})
            </button>
            <button
              onClick={() => setCategoryFilter("complaint")}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                categoryFilter === "complaint"
                  ? "bg-orange-600 text-white border-orange-600"
                  : "bg-orange-100 text-orange-800 border-transparent hover:bg-orange-200"
              }`}
            >
              Complaints ({complaintCount})
            </button>
            {breachedCount > 0 && (
              <button
                onClick={() => setSlaFilter(slaFilter === "breached" ? "all" : "breached")}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  slaFilter === "breached"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-red-100 text-red-800 border-transparent hover:bg-red-200"
                }`}
              >
                Breached ({breachedCount})
              </button>
            )}
            {atRiskCount > 0 && (
              <button
                onClick={() => setSlaFilter(slaFilter === "danger" ? "all" : "danger")}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  slaFilter === "danger"
                    ? "bg-orange-600 text-white border-orange-600"
                    : "bg-orange-100 text-orange-800 border-transparent hover:bg-orange-200"
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
                const statusCfg = STATUS_CONFIG[ticket.status] || { label: ticket.status, className: "bg-slate-100 text-slate-600" };
                const sla = getSlaInfo(ticket);
                const isExpanded = expandedTicketId === ticket.ticketId;

                return (
                  <TableRow key={ticket.ticketId} className="group">
                    <TableCell className="font-medium text-blue-600">{ticket.ticketNumber}</TableCell>
                    <TableCell className="text-slate-900 font-medium">{ticket.accountName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={ticket.category === "request" ? "default" : "destructive"} className="capitalize">
                        {ticket.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{ticket.type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{ticket.title}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          ticket.priority === "critical" ? "border-red-500 text-red-700" :
                          ticket.priority === "high" ? "border-orange-500 text-orange-700" :
                          ticket.priority === "medium" ? "border-yellow-500 text-yellow-700" :
                          "border-slate-400 text-slate-600"
                        }
                      >
                        {ticket.priority}
                      </Badge>
                    </TableCell>
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
                          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SLA_BADGE_CLASSES[sla.status]}`}>
                            {sla.label}
                          </span>
                          <span className="text-xs text-slate-500 whitespace-nowrap">{sla.time}</span>
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
                <h3 className="font-semibold text-slate-900">
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
