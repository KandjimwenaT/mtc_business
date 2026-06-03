import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Card, CardContent, Input, Label, Select } from "../ui-components";
import { createTicket } from "../../api/ticketApi";
import { getAccounts, type AccountRecord } from "../../api/adminApi";
import { Textarea } from "../ui/textarea";

const REQUEST_TYPES = [
  "request_meeting",
  "new_line",
  "plan_change",
  "line_suspension",
  "line_activation",
  "plan_upgrade",
  "number_change",
  "renewal",
  "termination",
  "upgrade",
  "downgrade",
  "change_ownership",
  "new_connection",
  "other",
];

const COMPLAINT_TYPES = [
  "billing",
  "service",
  "network",
  "support",
  "technical",
  "provisioning",
  "qos",
  "other",
];

interface StaffTicketCreateProps {
  showHeading?: boolean;
  onCreated?: () => void;
  onCancel?: () => void;
}

export default function StaffTicketCreate({
  showHeading = true,
  onCreated,
  onCancel,
}: StaffTicketCreateProps) {
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState<"request" | "complaint">("request");
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceChannel, setSourceChannel] = useState<"email" | "phone">("email");
  const [sourceContextNote, setSourceContextNote] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setAccountsLoading(true);
        const data = await getAccounts();
        setAccounts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load customer accounts");
      } finally {
        setAccountsLoading(false);
      }
    };
    void load();
  }, []);

  const ticketTypes = useMemo(
    () => (category === "request" ? REQUEST_TYPES : COMPLAINT_TYPES),
    [category],
  );

  const selectedAccount = useMemo(
    () => accounts.find((account) => String(account.accountId) === accountId),
    [accounts, accountId],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!accountId) {
      setError("Please select a customer account.");
      return;
    }
    if (!type) {
      setError("Please select a ticket type.");
      return;
    }
    if (!description.trim()) {
      setError("Please add ticket details.");
      return;
    }

    try {
      setSubmitting(true);
      const created = await createTicket({
        category,
        type,
        title: title.trim(),
        description: description.trim(),
        accountId: Number(accountId),
        sourceChannel,
        sourceContextNote: sourceContextNote.trim(),
        attachment,
      });
      setSuccess(`Ticket ${created.ticketNumber} created successfully.`);
      setType("");
      setTitle("");
      setDescription("");
      setSourceContextNote("");
      setAttachment(null);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {showHeading && (
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Create Ticket on Behalf</h2>
          <p className="text-sm text-slate-600">
            Log customer tickets from call/email engagements and notify the customer automatically.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-4 sm:p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label>Customer Account</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={accountsLoading || submitting}>
                <option value="" disabled>Select customer account</option>
                {accounts.map((account) => (
                  <option key={account.accountId} value={String(account.accountId)}>
                    {account.accountName} ({account.accountNumber})
                  </option>
                ))}
              </Select>
              {selectedAccount && (
                <p className="text-xs text-slate-500">
                  Contact: {selectedAccount.contactFirstName} {selectedAccount.contactLastName} ({selectedAccount.contactEmail})
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(value) => { setCategory(value as "request" | "complaint"); setType(""); }}>
                  <option value="request">Request</option>
                  <option value="complaint">Complaint</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <option value="" disabled>Select ticket type</option>
                  {ticketTypes.map((item) => (
                    <option key={item} value={item}>{item.replace(/_/g, " ")}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Short title (optional)"
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ticket details from the customer interaction"
                rows={6}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Source Channel</Label>
                <Select value={sourceChannel} onValueChange={(value) => setSourceChannel(value as "email" | "phone")}>
                  <option value="email">Email conversation</option>
                  <option value="phone">Phone call</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Attachment (optional image)</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(event) => setAttachment(event.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Source Notes</Label>
              <Textarea
                value={sourceContextNote}
                onChange={(event) => setSourceContextNote(event.target.value)}
                placeholder="Optional context from the email/call"
                rows={3}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting || accountsLoading}>
                {submitting ? "Creating ticket..." : "Create Ticket"}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
