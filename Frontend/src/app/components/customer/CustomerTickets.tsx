import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Search, Plus, Filter, Clock, X, Loader2, Send, AlertCircle, Zap, AlertTriangle } from "lucide-react";
import { createTicket, getMyTickets, type TicketRecord } from "../../api/ticketApi";
import { format } from "date-fns";
import EscalationWorkflowCard from "../EscalationWorkflowCard";

const REQUEST_TYPES = [
  { value: "request_meeting", label: "Request Meeting" },
  { value: "new_product_request", label: "New Product Request" },
  { value: "new_line", label: "New Line" },
  { value: "plan_change", label: "Plan Change" },
  { value: "line_suspension", label: "Line Suspension" },
  { value: "line_activation", label: "Line Activation" },
  { value: "plan_upgrade", label: "Plan Upgrade" },
  { value: "number_change", label: "Number Change" },
  { value: "renewal", label: "Renewal" },
  { value: "termination", label: "Termination" },
  { value: "upgrade", label: "Upgrade" },
  { value: "downgrade", label: "Downgrade" },
  { value: "change_ownership", label: "Change Ownership" },
  { value: "new_connection", label: "New Connection" },
  { value: "other", label: "Other" },
];

const COMPLAINT_TYPES = [
  { value: "billing", label: "Billing" },
  { value: "service", label: "Service" },
  { value: "network", label: "Network" },
  { value: "support", label: "Support" },
  { value: "technical", label: "Technical" },
  { value: "provisioning", label: "Provisioning" },
  { value: "qos", label: "QoS" },
  { value: "other", label: "Other" },
];

const REQUEST_PRIORITY_MAP: Record<string, "low" | "medium" | "high"> = {
  request_meeting: "low",
  new_product_request: "low",
  new_line: "low",
  plan_change: "low",
  line_suspension: "high",
  line_activation: "medium",
  plan_upgrade: "low",
  number_change: "low",
  renewal: "low",
  termination: "high",
  upgrade: "low",
  downgrade: "low",
  change_ownership: "medium",
  new_connection: "low",
  other: "medium",
};

const COMPLAINT_PRIORITY_MAP: Record<string, "low" | "medium" | "high" | "critical"> = {
  billing: "medium",
  service: "critical",
  network: "critical",
  support: "low",
  technical: "high",
  provisioning: "high",
  qos: "high",
  other: "medium",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Critical - Immediate / Same-day",
  high: "High - 24 Hours",
  medium: "Medium - 7 Business Days",
  low: "Low - 10+ Business Days",
};

const PRIORITY_SLA_TEXT: Record<string, string> = {
  critical: "Same Day",
  high: "24 Hours",
  medium: "7 Business Days",
  low: "10+ Business Days",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-800" },
  assigned: { label: "Assigned", className: "bg-indigo-100 text-indigo-800" },
  in_progress: { label: "In Progress", className: "bg-yellow-100 text-yellow-800" },
  escalated: { label: "Escalated", className: "bg-orange-100 text-orange-800" },
  resolved: { label: "Resolved", className: "bg-green-100 text-green-800" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
};

const REQUEST_TYPE_VALUES = new Set(REQUEST_TYPES.map((t) => t.value));

export default function CustomerTickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Form state
  const [category, setCategory] = useState<"request" | "complaint">("request");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [meetingProposedDate, setMeetingProposedDate] = useState("");
  const [meetingProposedTime, setMeetingProposedTime] = useState("");
  const [meetingAgenda, setMeetingAgenda] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isMeetingRequest = category === "request" && type === "request_meeting";

  const resetCreateForm = () => {
    setCategory("request");
    setType("");
    setDescription("");
    setMeetingProposedDate("");
    setMeetingProposedTime("");
    setMeetingAgenda("");
  };

  const handleTypeChange = (value: string) => {
    setType(value);
    if (value !== "request_meeting") {
      setMeetingProposedDate("");
      setMeetingProposedTime("");
      setMeetingAgenda("");
    }
  };

  // Data state
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await getMyTickets();
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

  useEffect(() => {
    const prefill = searchParams.get("newRequest");
    if (!prefill || !REQUEST_TYPE_VALUES.has(prefill)) return;
    setShowCreate(true);
    setCategory("request");
    setType(prefill);
    if (prefill !== "request_meeting") {
      setMeetingProposedDate("");
      setMeetingProposedTime("");
      setMeetingAgenda("");
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("newRequest");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const autoPriority =
    category === "request"
      ? (REQUEST_PRIORITY_MAP[type] || "medium")
      : (COMPLAINT_PRIORITY_MAP[type] || "medium");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!type) {
      alert("Please select a type");
      return;
    }

    if (isMeetingRequest) {
      if (!meetingProposedDate.trim() || !meetingProposedTime.trim() || !meetingAgenda.trim()) {
        alert("Please enter the proposed meeting date, time, and agenda");
        return;
      }
    } else if (!description.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    const descriptionPayload = isMeetingRequest
      ? [
          `Proposed date: ${meetingProposedDate}`,
          `Proposed time: ${meetingProposedTime}`,
          `Agenda:\n${meetingAgenda.trim()}`,
          ...(description.trim() ? [`Additional details:\n${description.trim()}`] : []),
        ].join("\n\n")
      : description.trim();

    const titlePayload = isMeetingRequest
      ? `Meeting request — ${meetingProposedDate}`.slice(0, 80)
      : description.trim().slice(0, 80);

    try {
      setSubmitting(true);
      await createTicket({
        category,
        type,
        priority: autoPriority,
        title: titlePayload,
        description: descriptionPayload,
      });
      setShowCreate(false);
      resetCreateForm();
      await fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      searchQuery === "" ||
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesCategory =
      categoryFilter === "all" || ticket.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const requestCount = tickets.filter((t) => t.category === "request").length;
  const complaintCount = tickets.filter((t) => t.category === "complaint").length;

  const typeOptions = category === "request" ? REQUEST_TYPES : COMPLAINT_TYPES;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
        <span className="ml-2 text-slate-500">Loading tickets...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">My Tickets</h2>
          <p className="text-sm text-slate-500">
            Submit and track service requests &amp; complaints
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={showFilterPanel ? "default" : "outline"}
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className="flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Filter className="h-4 w-4" /> Filter
          </Button>
          <Button
            onClick={() => {
              if (!showCreate) resetCreateForm();
              setShowCreate(!showCreate);
            }}
            className="flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" /> New Ticket
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-slate-500">Total Tickets</div>
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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

      {/* Create ticket form */}
      {showCreate && (
        <Card className="border-blue-100 bg-blue-50/30 shadow-md animate-in slide-in-from-top-4">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Create New Ticket</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreate(false);
                  resetCreateForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Category selector */}
              <div className="flex gap-4 mb-4 border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="cat-request"
                    name="category"
                    checked={category === "request"}
                    onChange={() => {
                      setCategory("request");
                      setType("");
                      setMeetingProposedDate("");
                      setMeetingProposedTime("");
                      setMeetingAgenda("");
                    }}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <Label htmlFor="cat-request" className="cursor-pointer">Service Request</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="cat-complaint"
                    name="category"
                    checked={category === "complaint"}
                    onChange={() => {
                      setCategory("complaint");
                      setType("");
                      setMeetingProposedDate("");
                      setMeetingProposedTime("");
                      setMeetingAgenda("");
                    }}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <Label htmlFor="cat-complaint" className="cursor-pointer">Issue/Complaint</Label>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>Type <span className="text-red-500">*</span></Label>
                  <Select value={type} onValueChange={handleTypeChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{category === "complaint" ? "Auto-Assigned Criticality" : "Priority (Auto-assigned)"}</Label>
                  <Input
                    value={type ? (PRIORITY_LABELS[autoPriority] || autoPriority.toUpperCase()) : "Select a type first"}
                    readOnly
                  />
                  {category === "complaint" && type && (
                    <p className="text-xs text-slate-500">
                      Criticality is assigned automatically from complaint category and can be updated by the support team after submission.
                    </p>
                  )}
                </div>

                {category === "request" && type && (
                  <div className="md:col-span-2 lg:col-span-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-blue-800">
                        <strong>Account Request SLA:</strong> Follow standard SLA timelines set by Management.
                        {" "}Normal processing time applies based on request complexity.
                      </div>
                    </div>
                  </div>
                )}

                {category === "complaint" && type && (
                  <div className="md:col-span-2 lg:col-span-3 rounded-md p-4 bg-amber-50 border border-amber-300 flex items-start gap-3">
                    <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-amber-800">Complaint SLA Requirements</h4>
                      <ul className="text-sm text-amber-700 mt-2 space-y-1 list-disc list-inside">
                        <li><strong>24-Hour Feedback:</strong> Executive must provide an update within the first 24 hours.</li>
                        <li><strong>7-Day Closure:</strong> Complaint should be closed in 7 days or escalated.</li>
                        <li><strong>Customer Notification:</strong> Customer receives updates at each milestone.</li>
                      </ul>
                    </div>
                  </div>
                )}

                {category === "complaint" && type && (
                  <div
                    className={`md:col-span-2 lg:col-span-3 rounded-md p-4 flex items-start gap-3 animate-in slide-in-from-top-2 ${
                      autoPriority === "critical"
                        ? "bg-red-50 border border-red-300"
                        : autoPriority === "high"
                        ? "bg-orange-50 border border-orange-300"
                        : autoPriority === "medium"
                        ? "bg-yellow-50 border border-yellow-300"
                        : "bg-green-50 border border-green-300"
                    }`}
                  >
                    {autoPriority === "critical" ? (
                      <Zap className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                    ) : autoPriority === "high" ? (
                      <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-slate-600 mt-0.5 shrink-0" />
                    )}
                    <div>
                      {autoPriority === "critical" && (
                        <>
                          <h4 className="font-semibold text-red-800">Critical Issue — Immediate Escalation to GM CRM</h4>
                          <p className="text-sm text-red-700 mt-1">
                            This complaint is escalated directly to the General Manager for same-day resolution and stakeholder notification.
                          </p>
                        </>
                      )}
                      {autoPriority === "high" && (
                        <>
                          <h4 className="font-semibold text-orange-800">High Priority — Supervisor Attention Required</h4>
                          <p className="text-sm text-orange-700 mt-1">
                            This complaint needs immediate supervisor action with a 24-hour target SLA.
                          </p>
                        </>
                      )}
                      {autoPriority === "medium" && (
                        <>
                          <h4 className="font-semibold text-yellow-800">Medium Priority — Standard Resolution</h4>
                          <p className="text-sm text-yellow-700 mt-1">
                            This complaint follows standard handling with a 7 business day SLA.
                          </p>
                        </>
                      )}
                      {autoPriority === "low" && (
                        <>
                          <h4 className="font-semibold text-green-800">Low Priority — Extended Timeline</h4>
                          <p className="text-sm text-green-700 mt-1">
                            This complaint can be resolved on the extended timeline with periodic customer updates.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {isMeetingRequest && (
                  <div className="md:col-span-2 lg:col-span-3 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Proposed date <span className="text-red-500">*</span></Label>
                      <Input
                        type="date"
                        value={meetingProposedDate}
                        onChange={(e) => setMeetingProposedDate(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Proposed time <span className="text-red-500">*</span></Label>
                      <Input
                        type="time"
                        value={meetingProposedTime}
                        onChange={(e) => setMeetingProposedTime(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Agenda <span className="text-red-500">*</span></Label>
                      <textarea
                        className="flex min-h-[88px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="What should be covered in the meeting?"
                        value={meetingAgenda}
                        onChange={(e) => setMeetingAgenda(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label>
                    {isMeetingRequest ? (
                      <>Additional details (optional)</>
                    ) : (
                      <>
                        Description <span className="text-red-500">*</span>
                      </>
                    )}
                  </Label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={
                      isMeetingRequest
                        ? "Any other context for your meeting request..."
                        : "Provide full details for this request or complaint..."
                    }
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-6 bg-slate-50 p-4 rounded border border-slate-200">
                <div className="flex items-center gap-2 text-slate-600">
                  <Clock className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">
                    Estimated SLA based on selections:{" "}
                    <strong className="text-slate-900">
                      {category === "complaint" && type
                        ? PRIORITY_SLA_TEXT[autoPriority]
                        : "24 Hours"}
                    </strong>
                  </span>
                </div>
                <Button type="submit" disabled={submitting} className="flex items-center justify-center gap-2 w-full sm:w-auto">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitting ? "Submitting..." : "Submit Ticket"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-red-700 text-sm">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
      {/* Tickets table */}
      <Card className="md:col-span-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 p-4 border-b border-slate-200">
          <div className="relative w-full sm:flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              className="pl-9"
              placeholder="Search by ID, title, type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket ID</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                  {tickets.length === 0
                    ? "No tickets yet. Click 'New Ticket' to create one."
                    : "No tickets match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              filteredTickets.map((ticket) => {
                const statusCfg = STATUS_CONFIG[ticket.status] || {
                  label: ticket.status,
                  className: "bg-slate-100 text-slate-600",
                };
                return (
                  <TableRow key={ticket.ticketId}>
                    <TableCell className="font-medium text-blue-600">
                      {ticket.ticketNumber}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={ticket.category === "request" ? "default" : "destructive"}
                        className="capitalize"
                      >
                        {ticket.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">
                      {ticket.type.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{ticket.title}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          ticket.priority === "critical"
                            ? "border-red-500 text-red-700"
                            : ticket.priority === "high"
                            ? "border-orange-500 text-orange-700"
                            : ticket.priority === "medium"
                            ? "border-yellow-500 text-yellow-700"
                            : "border-slate-400 text-slate-600"
                        }
                      >
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}
                      >
                        {statusCfg.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {ticket.assignedTo || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {format(new Date(ticket.createdAt), "dd MMM yyyy")}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <EscalationWorkflowCard />
      </div>
    </div>
  );
}
