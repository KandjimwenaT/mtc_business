import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Label, Select } from "./ui-components";
import {
  assignTicketAdmin,
  getTicketDepartmentAdmins,
  type TicketDepartmentAdmin,
  type TicketRecord,
} from "../api/ticketApi";

function handoffLabel(ticket: TicketRecord) {
  if (!ticket.assignedAdminName) return "Not handed to an admin yet. The customer still sees you as the owner.";
  if (ticket.adminAssignmentStatus === "accepted") {
    return `${ticket.assignedAdminName} accepted this ticket. You can hand it to someone else if they become unavailable.`;
  }
  if (ticket.adminAssignmentStatus === "declined") {
    const reason = ticket.adminAssignmentReason ? ` Reason: ${ticket.adminAssignmentReason}` : "";
    return `${ticket.assignedAdminName} declined this ticket.${reason}`;
  }
  return `Waiting for ${ticket.assignedAdminName} to accept or decline. The customer still sees you as the owner.`;
}

export default function AssignTicketAdmin({
  ticket,
  onAssigned,
}: {
  ticket: TicketRecord;
  onAssigned?: (ticket: TicketRecord) => void;
}) {
  const [admins, setAdmins] = useState<TicketDepartmentAdmin[]>([]);
  const [adminId, setAdminId] = useState(ticket.assignedAdminPersonId ? String(ticket.assignedAdminPersonId) : "");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTicketDepartmentAdmins()
      .then(setAdmins)
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to load department admins"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setAdminId(ticket.assignedAdminPersonId ? String(ticket.assignedAdminPersonId) : "");
  }, [ticket.ticketId, ticket.assignedAdminPersonId]);

  const save = async () => {
    if (!adminId) {
      toast.error("Select an admin");
      return;
    }
    setSaving(true);
    try {
      const updated = await assignTicketAdmin(ticket.ticketId, Number(adminId));
      onAssigned?.(updated);
      const name = updated.assignedAdminName || "the admin";
      toast.success(`Handed to ${name}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign ticket");
    } finally {
      setSaving(false);
    }
  };

  const selected = admins.find((admin) => String(admin.id) === adminId);

  return (
    <div className="space-y-2">
      <Label>Hand to an admin</Label>
      <Select value={adminId} onChange={(e) => setAdminId(e.target.value)} disabled={saving || loading}>
        <option value="">{loading ? "Loading admins..." : "Select an admin..."}</option>
        {admins.map((admin) => (
          <option key={admin.id} value={admin.id}>
            {admin.firstName} {admin.lastName}
            {admin.availabilityStatus === "out_of_office" ? " (Out of office)" : " (Available)"}
          </option>
        ))}
      </Select>
      <p className={`text-xs ${ticket.adminAssignmentStatus === "declined" ? "text-red-700" : "text-slate-500"}`}>
        {handoffLabel(ticket)}
      </p>
      {selected?.availabilityStatus === "out_of_office" ? (
        <p className="text-xs text-amber-700">That admin is out of office. Choose someone else if they cannot take it.</p>
      ) : null}
      <Button type="button" variant="outline" className="w-full" onClick={save} disabled={saving || loading || !adminId}>
        {saving ? "Saving..." : ticket.assignedAdminPersonId ? "Reassign admin" : "Assign admin"}
      </Button>
    </div>
  );
}
