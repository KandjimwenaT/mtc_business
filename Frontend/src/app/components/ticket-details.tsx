import { useParams, useNavigate } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { 
  Button, 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  Badge, 
  Select, 
  Label 
} from "./ui-components";
import { 
  ArrowLeft, 
  Clock, 
  Loader2,
  MessageSquare, 
  History,
} from "lucide-react";
import { addInternalTicketNote, getTicketById, updateTicket, type TicketRecord } from "../api/ticketApi";
import { getCurrentUser } from "../api/authApi";
import { format } from "date-fns";

export default function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ticketId = Number(id);

  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [ticketStatus, setTicketStatus] = useState("new");
  const [actionTaken, setActionTaken] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const currentUser = getCurrentUser();
  const canAddInternalNote = ["manager", "supervisor", "admin"].includes(currentUser?.role || "");

  useEffect(() => {
    const run = async () => {
      if (!Number.isFinite(ticketId)) {
        setError("Invalid ticket id");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await getTicketById(ticketId);
        setTicket(data);
        setTicketStatus(data.status);
        setInternalNote("");
        setResolution(data.resolution || "");
      } catch (err: any) {
        setError(err.message || "Failed to load ticket");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [ticketId]);

  const slaInfo = useMemo(() => {
    if (!ticket?.slaDeadline || ["resolved", "closed", "rejected"].includes(ticket.status)) {
      return { label: "—", elapsed: "—", overdue: "", progress: 0 };
    }
    const now = Date.now();
    const created = new Date(ticket.createdAt).getTime();
    const deadline = new Date(ticket.slaDeadline).getTime();
    const total = Math.max(deadline - created, 1);
    const spent = now - created;
    const remaining = deadline - now;
    const elapsedH = Math.floor(Math.abs(spent) / 3_600_000);
    const elapsedM = Math.floor((Math.abs(spent) % 3_600_000) / 60_000);
    const overdueH = Math.floor(Math.abs(remaining) / 3_600_000);
    const overdueM = Math.floor((Math.abs(remaining) % 3_600_000) / 60_000);
    return {
      label: remaining < 0 ? "Breached" : "In SLA",
      elapsed: `${elapsedH}h ${elapsedM}m`,
      overdue: remaining < 0 ? `-${overdueH}h ${overdueM}m (Overdue)` : `${overdueH}h ${overdueM}m left`,
      progress: Math.min(100, Math.max(0, Math.floor((spent / total) * 100))),
    };
  }, [ticket]);

  const handleSave = async () => {
    if (!ticket) return;
    try {
      setSaving(true);
      const updated = await updateTicket(ticket.ticketId, {
        status: ticketStatus,
        resolution,
      });
      setTicket({ ...ticket, ...updated, status: updated.status, notes: updated.notes, resolution: updated.resolution });
      toast.success("Ticket updated", { description: `${updated.ticketNumber} was updated successfully.` });
    } catch (err: any) {
      toast.error(err.message || "Failed to update ticket");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-slate-500">Loading ticket...</span>
      </div>
    );
  }

  if (error || !ticket) {
    return <div className="text-red-600">{error || "Ticket not found"}</div>;
  }

  const timeline = [
    { id: 1, type: "created", title: "Ticket Created", date: format(new Date(ticket.createdAt), "MMM dd, HH:mm"), user: ticket.submittedBy },
    ...((ticket.internalNotes || []).map((note) => ({
      id: `note-${note.noteId}`,
      type: "comment",
      title: `${note.authorRole === "manager" ? "Manager" : note.authorRole === "supervisor" ? "Supervisor" : "Admin"} Comment`,
      date: format(new Date(note.createdAt), "MMM dd, HH:mm"),
      user: note.authorName,
      body: note.note,
    }))),
    ...(ticket.notes ? [{ id: 2, type: "comment", title: "Admin Note Added", date: format(new Date(ticket.updatedAt), "MMM dd, HH:mm"), user: ticket.assignedTo || "Admin" }] : []),
    ...(ticket.resolution ? [{ id: 3, type: "closed", title: "Resolution Added", date: format(new Date(ticket.updatedAt), "MMM dd, HH:mm"), user: ticket.assignedTo || "Admin" }] : []),
  ];

  const handleAddInternalNote = async () => {
    if (!ticket || !internalNote.trim()) return;
    try {
      setAddingNote(true);
      const createdNote = await addInternalTicketNote(ticket.ticketId, internalNote.trim());
      setTicket({
        ...ticket,
        internalNotes: [...(ticket.internalNotes || []), createdNote],
      });
      setInternalNote("");
      toast.success("Internal note added and notifications sent.");
    } catch (err: any) {
      toast.error(err.message || "Failed to add internal note");
    } finally {
      setAddingNote(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-right-4">
      <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
        <Button variant="ghost" size="sm" className="rounded-full h-8 w-8 p-0" onClick={() => navigate("/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{ticket.ticketNumber}</h2>
            <Badge variant={slaInfo.label === "Breached" ? "danger" : "success"} className="uppercase px-2 py-1">
              {slaInfo.label}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">{ticket.corporateName || ticket.accountName || "Corporate"} • {ticket.type} / {ticket.category}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Details Panel */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="bg-slate-50 border-b border-slate-200 py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-mtc-blue" /> 
                SLA Progress (Target: 24h)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between text-sm mb-2 font-medium">
                <span className="text-slate-500">Time Elapsed: {slaInfo.elapsed}</span>
                <span className={slaInfo.label === "Breached" ? "text-red-600 font-bold" : "text-green-600 font-bold"}>
                  {slaInfo.overdue}
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${slaInfo.label === "Breached" ? "bg-slate-900" : "bg-green-500"} rounded-full transition-all duration-500`} style={{ width: `${slaInfo.progress}%` }} />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Created</span>
                <span>Warning (12h)</span>
                <span>At Risk (18h)</span>
                <span>Breach (24h)</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ticket Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                <div>
                  <span className="text-slate-500 block mb-1">Corporate</span>
                  <span className="font-medium text-slate-900 block">{ticket.corporateName || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Account</span>
                  <span className="font-medium text-slate-900 block">{ticket.accountName || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Priority</span>
                  <Badge variant="warning">{ticket.priority}</Badge>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Status</span>
                  <span className="font-medium text-slate-900 block">{ticketStatus}</span>
                </div>
                <div className="col-span-2 mt-2">
                  <span className="text-slate-500 block mb-2">Description</span>
                  <div className="bg-slate-50 p-4 rounded-md border border-slate-200 text-slate-700 leading-relaxed">
                    {ticket.description || "No description provided."}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" /> Ticket History Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="relative border-l border-slate-200 ml-3 space-y-8">
                {timeline.map((event) => (
                  <div key={event.id} className="relative pl-6 animate-in fade-in">
                    <span className={`absolute -left-2 top-1 h-4 w-4 rounded-full border-2 border-white shadow-sm ${
                      event.type === 'escalation' ? 'bg-red-500' :
                      event.type === 'closed' ? 'bg-green-500' :
                      'bg-mtc-blue'
                    }`} />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{event.title}</span>
                        <span className="text-xs text-slate-500">{event.date}</span>
                      </div>
                      <span className="text-sm text-slate-600">by {event.user}</span>
                      {event.type === 'comment' && (
                        <div className="mt-2 text-sm bg-slate-50 p-3 rounded border border-slate-200 text-slate-700">
                          {event.body || "Internal comment added."}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Panel */}
        <div className="space-y-6">
          <Card className="border-mtc-blue-100 bg-mtc-blue-50/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-mtc-blue" /> Triage & Assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Assignee</Label>
                <div className="flex items-center gap-3 p-3 bg-white rounded-md border border-slate-200 shadow-sm">
                  <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
                    {(ticket.assignedTo || "Admin")
                      .split(" ")
                      .filter(Boolean)
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-900">{ticket.assignedTo || "Admin Unassigned"}</span>
                    <span className="text-xs text-slate-500">Assignee</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <Label>Update Status</Label>
                <Select value={ticketStatus} onChange={(e) => setTicketStatus(e.target.value)}>
                  <option value="new">New</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="escalated">Escalated</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                  <option value="rejected">Rejected</option>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-500" /> Add Update
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Action Taken (Structured)</Label>
                <Select value={actionTaken} onChange={(e) => setActionTaken(e.target.value)}>
                  <option value="">Select Action...</option>
                  <option>Contacted Customer</option>
                  <option>Escalated to Technical</option>
                  <option>Awaiting Internal Info</option>
                  <option>Proposed Resolution</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Resolution</Label>
                <textarea 
                  className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                  placeholder="Add resolution when applicable..."
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Internal Note (Optional)</Label>
                <textarea 
                  className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue disabled:opacity-50"
                  placeholder={canAddInternalNote ? "Add internal note for executive, supervisor and admin visibility..." : "Only manager/supervisor/admin can add internal notes"}
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  disabled={!canAddInternalNote || addingNote}
                />
              </div>
              {canAddInternalNote && (
                <Button variant="outline" className="w-full" onClick={handleAddInternalNote} disabled={addingNote || !internalNote.trim()}>
                  {addingNote ? "Adding Note..." : "Add Internal Note"}
                </Button>
              )}
              <Button variant="secondary" className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Update"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
