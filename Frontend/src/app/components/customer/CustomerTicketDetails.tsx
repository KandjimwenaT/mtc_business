import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Loader2, MessageSquare, Send } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "../ui-components";
import EscalationWorkflowCard from "../EscalationWorkflowCard";
import {
  addCustomerTicketMessage,
  getTicketById,
  type TicketCustomerMessageRecord,
  type TicketRecord,
} from "../../api/ticketApi";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-800" },
  assigned: { label: "Assigned", className: "bg-indigo-100 text-indigo-800" },
  in_progress: { label: "In Progress", className: "bg-yellow-100 text-yellow-800" },
  escalated: { label: "Escalated", className: "bg-orange-100 text-orange-800" },
  resolved: { label: "Resolved", className: "bg-green-100 text-green-800" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
};

function statusLabel(status: string) {
  return STATUS_CONFIG[status]?.label || status.replace(/_/g, " ");
}

function roleLabel(role: string) {
  if (role === "customer") return "Customer";
  if (role === "executive_staff" || role === "supervisor") return "Executive";
  return "Executive";
}

export default function CustomerTicketDetails({
  ticketId: ticketIdProp,
  onBack,
}: {
  ticketId?: string;
  onBack?: () => void;
} = {}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const ticketId = Number(ticketIdProp ?? id);
  const goBack = onBack ?? (() => navigate("/customerTickets"));
  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(ticketId)) {
      setError("Invalid ticket");
      setLoading(false);
      return;
    }
    setLoading(true);
    getTicketById(ticketId)
      .then(setTicket)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load ticket"))
      .finally(() => setLoading(false));
  }, [ticketId]);

  useLiveRefresh(["tickets"], () => {
    if (!Number.isFinite(ticketId) || sending) return;
    getTicketById(ticketId).then(setTicket).catch(() => {});
  });

  const sendMessage = async () => {
    if (!ticket || !draft.trim() || sending) return;
    setSending(true);
    try {
      const created = await addCustomerTicketMessage(ticket.ticketId, draft.trim());
      setTicket((prev) =>
        prev
          ? { ...prev, customerMessages: [...(prev.customerMessages ?? []), created] }
          : prev,
      );
      setDraft("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
        <span className="ml-2 text-slate-500">Loading ticket...</span>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to tickets
        </Button>
        <p className="text-sm text-red-600">{error || "Ticket not found"}</p>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[ticket.status] || {
    label: statusLabel(ticket.status),
    className: "bg-slate-100 text-slate-700",
  };
  const messages: TicketCustomerMessageRecord[] = ticket.customerMessages ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
        <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 rounded-full p-0" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-3xl font-normal text-slate-800">{ticket.ticketNumber}</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {ticket.title} · {ticket.type.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Ticket details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-slate-500">Status</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}>
                  {statusCfg.label}
                </span>
              </div>
              <div>
                <span className="mb-1 block text-slate-500">Priority</span>
                <span className="font-medium capitalize text-slate-900">{ticket.priority}</span>
              </div>
              <div>
                <span className="mb-1 block text-slate-500">Category</span>
                <span className="font-medium capitalize text-slate-900">{ticket.category}</span>
              </div>
              <div>
                <span className="mb-1 block text-slate-500">Executive</span>
                <span className="font-medium text-slate-900">{ticket.assignedTo || "Not assigned yet"}</span>
              </div>
              <div>
                <span className="mb-1 block text-slate-500">Opened</span>
                <span className="font-medium text-slate-900">{format(new Date(ticket.createdAt), "dd MMM yyyy, HH:mm")}</span>
              </div>
            </div>
            <div>
              <span className="mb-2 block text-slate-500">Description</span>
              <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-slate-700">
                {ticket.description || "No description provided."}
              </div>
            </div>
            {ticket.resolution ? (
              <div>
                <span className="mb-2 block text-slate-500">Resolution</span>
                <div className="whitespace-pre-wrap rounded-md border border-green-200 bg-green-50 p-4 text-slate-700">
                  {ticket.resolution}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-mtc-blue" /> Conversation
            </CardTitle>
            <p className="text-xs text-slate-500">Only you and your executive can see these messages.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages yet. Send a note to your executive.</p>
              ) : (
                messages.map((entry) => {
                  const fromCustomer = entry.authorRole === "customer";
                  return (
                    <div
                      key={entry.messageId}
                      className={`rounded-md border p-3 text-sm ${
                        fromCustomer ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">
                          {entry.authorName} · {roleLabel(entry.authorRole)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {format(new Date(entry.createdAt), "dd MMM, HH:mm")}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-700">{entry.message}</p>
                    </div>
                  );
                })
              )}
            </div>
            <textarea
              className="flex min-h-[96px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
              placeholder="Write a message to your executive..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
            />
            <Button className="w-full" onClick={sendMessage} disabled={sending || !draft.trim()}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {sending ? "Sending..." : "Send message"}
            </Button>
          </CardContent>
        </Card>
      </div>
      <EscalationWorkflowCard stacked />
    </div>
  );
}
