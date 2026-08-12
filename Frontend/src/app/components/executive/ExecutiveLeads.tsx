import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Select, Label, Badge } from "../ui-components";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { createLead, getMyLeads, type LeadRecord as ApiLeadRecord } from "../../api/leadApi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

type LeadStatus = "in_progress" | "ongoing" | "completed" | "pending";
type TimeRange = "all" | "week" | "month" | "quarter";

type LeadRow = {
  id: number;
  company: string;
  contact: string;
  contactPhone: string | null;
  contactEmail: string | null;
  source: string;
  estimatedLines: string | null;
  product: string;
  priority: string | null;
  notes: string | null;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  expectedCloseDate: string | null;
};

const formatDateTime = (dateValue: string | null) => {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleString();
};

const formatStatus = (status: LeadStatus) => {
  switch (status) {
    case "completed": return "Completed";
    case "ongoing": return "Ongoing";
    case "in_progress": return "In Progress";
    default: return "Pending";
  }
};

const normalizeLead = (lead: ApiLeadRecord): LeadRow => ({
  id: lead.leadId,
  company: lead.companyName,
  contact: lead.contactPerson,
  contactPhone: lead.contactPhone,
  contactEmail: lead.contactEmail,
  source: lead.leadSource,
  estimatedLines: lead.estimatedLines,
  product: lead.productInterest,
  priority: lead.priority,
  notes: lead.notes,
  status: lead.status as LeadStatus,
  createdAt: lead.createdAt,
  updatedAt: lead.updatedAt,
  expectedCloseDate: lead.expectedCloseDate,
});

export default function ExecutiveLeads() {
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactPerson: "",
    contactPhone: "",
    contactEmail: "",
    leadSource: "",
    estimatedLines: "",
    productInterest: "",
    priority: "Medium",
    expectedCloseDate: "",
    notes: "",
  });

  useEffect(() => {
    const fetchLeads = async () => {
      setLoading(true);
      try {
        const rows = await getMyLeads();
        setLeads(rows.map(normalizeLead));
      } catch (error) {
        toast.error("Failed to load leads", { description: error instanceof Error ? error.message : undefined });
      } finally {
        setLoading(false);
      }
    };

    void fetchLeads();
  }, []);

  const filteredLeads = useMemo(() => {
    const now = new Date();
    return leads.filter((lead) => {
      const createdAt = new Date(lead.createdAt);
      const inRange = (() => {
        if (timeRange === "week") {
          const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays <= 7;
        }
        if (timeRange === "month") {
          return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
        }
        if (timeRange === "quarter") {
          const monthDiff = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());
          return monthDiff <= 3;
        }
        return true;
      })();

      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesSearch = `${lead.company} ${lead.contact} ${lead.product}`.toLowerCase().includes(searchQuery.toLowerCase());
      return inRange && matchesStatus && matchesSearch;
    });
  }, [leads, searchQuery, statusFilter, timeRange]);

  const handleSubmit = async () => {
    if (!form.companyName.trim() || !form.contactPerson.trim() || !form.leadSource.trim() || !form.productInterest.trim()) {
      toast.error("Please complete the required lead fields");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createLead({
        companyName: form.companyName.trim(),
        contactPerson: form.contactPerson.trim(),
        contactPhone: form.contactPhone.trim(),
        contactEmail: form.contactEmail.trim(),
        leadSource: form.leadSource.trim(),
        estimatedLines: form.estimatedLines.trim(),
        productInterest: form.productInterest.trim(),
        priority: form.priority.trim(),
        expectedCloseDate: form.expectedCloseDate,
        notes: form.notes.trim(),
        status: "pending",
      });
      setLeads((prev) => [normalizeLead(created), ...prev]);
      setShowForm(false);
      setForm({
        companyName: "",
        contactPerson: "",
        contactPhone: "",
        contactEmail: "",
        leadSource: "",
        estimatedLines: "",
        productInterest: "",
        priority: "Medium",
        expectedCloseDate: "",
        notes: "",
      });
      toast.success("Lead created", { description: "Lead has been submitted and assigned to your pipeline." });
    } catch (error) {
      toast.error("Failed to save lead", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Leads</h2>
          <p className="text-sm text-slate-500">Capture and manage new business opportunities from your EBU pipeline.</p>
        </div>
        <Button onClick={() => setShowForm((prev) => !prev)}>
          <Plus className="h-4 w-4 mr-2" />
          {showForm ? "Hide Form" : "Create Leads"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-5 w-5 text-mtc-blue" /> Create New Lead
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Lead Source <span className="text-red-500">*</span></Label>
                <Select value={form.leadSource} onChange={(e) => setForm((prev) => ({ ...prev, leadSource: e.target.value }))}>
                  <option value="">Select Source...</option>
                  <option value="Customer Visit">Customer Visit</option>
                  <option value="Referral">Referral</option>
                  <option value="Cold Call">Cold Call</option>
                  <option value="Event / Conference">Event / Conference</option>
                  <option value="Website Inquiry">Website Inquiry</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Company Name <span className="text-red-500">*</span></Label>
                <Input value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="e.g. Namibia Holdings Ltd" />
              </div>
              <div className="space-y-2">
                <Label>Contact Person <span className="text-red-500">*</span></Label>
                <Input value={form.contactPerson} onChange={(e) => setForm((prev) => ({ ...prev, contactPerson: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label>Contact Phone</Label>
                <Input value={form.contactPhone} onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))} placeholder="+264 81..." />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input value={form.contactEmail} onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))} placeholder="email@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Estimated Lines</Label>
                <Select value={form.estimatedLines} onChange={(e) => setForm((prev) => ({ ...prev, estimatedLines: e.target.value }))}>
                  <option value="">Select range</option>
                  <option value="1 - 10">1 - 10</option>
                  <option value="11 - 50">11 - 50</option>
                  <option value="51 - 100">51 - 100</option>
                  <option value="100+">100+</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Product Interest <span className="text-red-500">*</span></Label>
                <Select value={form.productInterest} onChange={(e) => setForm((prev) => ({ ...prev, productInterest: e.target.value }))}>
                  <option value="">Select Product...</option>
                  <option value="Mobile Voice">Mobile Voice</option>
                  <option value="Fiber Internet">Fiber Internet</option>
                  <option value="Cloud Services">Cloud Services</option>
                  <option value="IoT Solutions">IoT Solutions</option>
                  <option value="SD-WAN">SD-WAN</option>
                  <option value="Bundled Package">Bundled Package</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expected Close Date</Label>
                <Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm((prev) => ({ ...prev, expectedCloseDate: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                <Label>Notes</Label>
                <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="flex min-h-[60px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue" placeholder="Brief notes about the lead..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Saving..." : "Submit Lead"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">Previous Leads</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                className="pl-9 w-full sm:w-56"
                placeholder="Search leads"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | LeadStatus)}>
              <option value="all">All Statuses</option>
              <option value="in_progress">In Progress</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
            </Select>
            <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value as TimeRange)}>
              <option value="all">All Time</option>
              <option value="week">Last Week</option>
              <option value="month">This Month</option>
              <option value="quarter">Last Quarter</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-3 pr-4">Lead</th>
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Contact</th>
                  <th className="py-3 pr-4">Product</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Expected Close</th>
                  <th className="py-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-medium text-slate-900">{lead.id}</td>
                    <td className="py-3 pr-4">{lead.company}</td>
                    <td className="py-3 pr-4">{lead.contact}</td>
                    <td className="py-3 pr-4">{lead.product}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={lead.status === "completed" ? "success" : lead.status === "pending" ? "warning" : "neutral"}>{formatStatus(lead.status)}</Badge>
                    </td>
                    <td className="py-3 pr-4">{lead.expectedCloseDate || "—"}</td>
                    <td className="py-3 pr-4 text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelectedLead(lead)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading ? (
              <div className="py-6 text-center text-sm text-slate-500">Loading leads...</div>
            ) : filteredLeads.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">No leads match the current filters.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={selectedLead !== null} onOpenChange={(open) => { if (!open) setSelectedLead(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-white text-slate-900 border-slate-200">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Lead ID</p>
                  <p className="text-sm font-medium text-slate-900">{selectedLead.id}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                  <Badge variant={selectedLead.status === "completed" ? "success" : selectedLead.status === "pending" ? "warning" : "neutral"}>{formatStatus(selectedLead.status)}</Badge>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Company</p>
                  <p className="text-sm text-slate-900">{selectedLead.company || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Contact Person</p>
                  <p className="text-sm text-slate-900">{selectedLead.contact || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Contact Phone</p>
                  <p className="text-sm text-slate-900">{selectedLead.contactPhone || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Contact Email</p>
                  <p className="text-sm text-slate-900">{selectedLead.contactEmail || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Lead Source</p>
                  <p className="text-sm text-slate-900">{selectedLead.source || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Product Interest</p>
                  <p className="text-sm text-slate-900">{selectedLead.product || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Estimated Lines</p>
                  <p className="text-sm text-slate-900">{selectedLead.estimatedLines || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Priority</p>
                  <p className="text-sm text-slate-900">{selectedLead.priority || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Expected Close Date</p>
                  <p className="text-sm text-slate-900">{selectedLead.expectedCloseDate || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Created At</p>
                  <p className="text-sm text-slate-900">{formatDateTime(selectedLead.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Last Updated</p>
                  <p className="text-sm text-slate-900">{formatDateTime(selectedLead.updatedAt)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">{selectedLead.notes || "-"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
