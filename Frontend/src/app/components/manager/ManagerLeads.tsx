import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from "../ui-components";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { getTeamLeads, type TeamLeadRecord } from "../../api/leadApi";

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
  executiveName: string;
  executiveEmail: string | null;
};

const formatDateTime = (dateValue: string | null) => {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleString();
};

const formatStatus = (status: LeadStatus) => {
  switch (status) {
    case "completed":
      return "Completed";
    case "ongoing":
      return "Ongoing";
    case "in_progress":
      return "In Progress";
    default:
      return "Pending";
  }
};

const normalizeLead = (lead: TeamLeadRecord): LeadRow => ({
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
  executiveName: lead.executive?.fullName || "Unknown Executive",
  executiveEmail: lead.executive?.email || null,
});

export default function ManagerLeads() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLeads = async () => {
      setLoading(true);
      try {
        const rows = await getTeamLeads();
        setLeads(rows.map(normalizeLead));
      } catch (error) {
        toast.error("Failed to load team leads", {
          description: error instanceof Error ? error.message : undefined,
        });
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
          const monthDiff =
            (now.getFullYear() - createdAt.getFullYear()) * 12 +
            (now.getMonth() - createdAt.getMonth());
          return monthDiff <= 3;
        }
        return true;
      })();

      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesSearch = `${lead.company} ${lead.contact} ${lead.product} ${lead.executiveName}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      return inRange && matchesStatus && matchesSearch;
    });
  }, [leads, searchQuery, statusFilter, timeRange]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Leads</h2>
        <p className="text-sm text-slate-500">
          Track what your executives are currently working on in the EBU pipeline.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">Executive Team Leads</CardTitle>
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
                  <th className="py-3 pr-4">Executive</th>
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
                    <td className="py-3 pr-4">{lead.executiveName}</td>
                    <td className="py-3 pr-4">{lead.company}</td>
                    <td className="py-3 pr-4">{lead.contact}</td>
                    <td className="py-3 pr-4">{lead.product}</td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={
                          lead.status === "completed"
                            ? "success"
                            : lead.status === "pending"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {formatStatus(lead.status)}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">{lead.expectedCloseDate || "-"}</td>
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

      <Dialog
        open={selectedLead !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLead(null);
        }}
      >
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
                  <Badge
                    variant={
                      selectedLead.status === "completed"
                        ? "success"
                        : selectedLead.status === "pending"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {formatStatus(selectedLead.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Executive</p>
                  <p className="text-sm text-slate-900">{selectedLead.executiveName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Executive Email</p>
                  <p className="text-sm text-slate-900">{selectedLead.executiveEmail || "-"}</p>
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
                  <p className="text-xs uppercase tracking-wide text-slate-500">Estimated Lines</p>
                  <p className="text-sm text-slate-900">{selectedLead.estimatedLines || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Product Interest</p>
                  <p className="text-sm text-slate-900">{selectedLead.product || "-"}</p>
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
                  <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                  <p className="text-sm text-slate-900">{formatDateTime(selectedLead.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Last Updated</p>
                  <p className="text-sm text-slate-900">{formatDateTime(selectedLead.updatedAt)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-1 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
                  {selectedLead.notes || "No additional notes provided."}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
