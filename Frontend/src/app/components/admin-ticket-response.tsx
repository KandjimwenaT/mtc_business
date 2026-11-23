import { useState } from "react";
import { toast } from "sonner";
import { Button, Label } from "./ui-components";
import { respondToTicketAssignment, updateTicket, type TicketRecord } from "../api/ticketApi";

export default function AdminTicketResponse({
  ticket,
  onUpdated,
}: {
  ticket: TicketRecord;
  onUpdated?: (ticket: TicketRecord) => void;
}) {
  const [reason, setReason] = useState(ticket.adminAssignmentReason || "");
  const [saving, setSaving] = useState<"accepted" | "declined" | "completed" | null>(null);
  const finished = ["completed", "closed", "resolved"].includes(ticket.status);

  const respond = async (decision: "accepted" | "declined") => {
    if (decision === "declined" && !reason.trim()) {
      toast.error("Add a reason the executive can see");
      return;
    }
    setSaving(decision);
    try {
      const updated = await respondToTicketAssignment(ticket.ticketId, decision, reason.trim());
      onUpdated?.(updated);
      toast.success(decision === "accepted" ? "Ticket accepted and in progress" : "Ticket declined");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to respond to the ticket");
    } finally {
      setSaving(null);
    }
  };

  const complete = async () => {
    setSaving("completed");
    try {
      const updated = await updateTicket(ticket.ticketId, {
        status: "completed",
        actionTaken: "Marked as completed",
      });
      onUpdated?.(updated);
      toast.success("Ticket completed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to complete the ticket");
    } finally {
      setSaving(null);
    }
  };

  const status = ticket.adminAssignmentStatus;

  return (
    <div className="space-y-2 border-t border-slate-200 pt-2">
      <Label>Your response</Label>
      <p className="text-xs text-slate-500">
        {finished
          ? "This ticket is completed."
          : status === "accepted"
            ? "You accepted this ticket. It is in progress. Mark it completed when the work is done."
            : status === "declined"
              ? "You declined this ticket. The executive can hand it to another admin."
              : "Accept this ticket, or decline it with a reason the executive can see."}
      </p>
      <textarea
        className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
        placeholder="Reason for the executive"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={saving !== null}
      />
      {!finished && (
        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={() => respond("accepted")} disabled={saving !== null}>
            {saving === "accepted" ? "Accepting..." : "Accept"}
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => respond("declined")} disabled={saving !== null}>
            {saving === "declined" ? "Declining..." : "Decline"}
          </Button>
        </div>
      )}
      {status === "accepted" && !finished && (
        <Button type="button" className="w-full" onClick={complete} disabled={saving !== null}>
          {saving === "completed" ? "Completing..." : "Mark as completed"}
        </Button>
      )}
    </div>
  );
}
