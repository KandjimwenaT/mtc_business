import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, RefreshCw, Search } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui-components";
import { getAuditLogs, type AuditLogRecord } from "../api/auditApi";

const TYPE_OPTIONS = [
  "",
  "Auth",
  "User",
  "Portal Access",
  "Role",
  "Corporate",
  "Account",
  "Contract",
  "Service",
  "Invoice",
  "Lead",
  "Ticket",
  "Visit",
  "Complaint",
  "Account Request",
  "Import",
  "Notification",
  "Profile",
  "System",
];

const ROLE_LABELS: Record<string, string> = {
  customer: "Account Manager",
  executive_staff: "Executive",
  gm: "GM",
  admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
};

function formatDateTime(iso: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function typeBadgeVariant(type: string): "default" | "success" | "warning" | "danger" | "neutral" {
  if (type === "Auth") return "warning";
  if (type === "Role" || type === "Portal Access") return "success";
  if (type === "Import") return "default";
  if (type === "Ticket" || type === "Complaint") return "danger";
  return "neutral";
}

export default function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAuditLogs({
        page,
        pageSize: 25,
        search: search.trim() || undefined,
        type: type || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setLogs(result.logs);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, search, type, from, to]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch((prev) => {
        if (prev === searchInput) return prev;
        setPage(1);
        return searchInput;
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <Card>
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <FileText className="h-4 w-4 text-mtc-blue" />
            Audit Log
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Department activity including logins, user changes, tickets, visits, and imports.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search user, message, or ID"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <Select
          value={type}
          onChange={(event) => {
            setPage(1);
            setType(event.target.value);
          }}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option || "all"} value={option}>
              {option || "All types"}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(event) => {
            setPage(1);
            setFrom(event.target.value);
          }}
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => {
            setPage(1);
            setTo(event.target.value);
          }}
        />
      </div>

      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
        </div>
      ) : logs.length === 0 ? (
        <div className="px-4 py-16 text-center text-sm text-slate-500">
          No audit events found for your department.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date & time</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.auditId}>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">AUD-{log.auditId}</TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{log.actorName}</div>
                    <div className="text-xs text-slate-500">
                      {log.actorEmail || "—"}
                      {log.actorRole ? ` · ${ROLE_LABELS[log.actorRole] || log.actorRole}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={typeBadgeVariant(log.actionType)}>{log.actionType}</Badge>
                  </TableCell>
                  <TableCell>
                    {log.department ? (
                      <Badge variant={log.department === "EBU" ? "warning" : "default"}>
                        {log.department}
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md text-slate-700">
                    <div>{log.message}</div>
                    {log.entityId ? (
                      <div className="mt-0.5 text-xs text-slate-400">
                        {log.entityType ? `${log.entityType} ` : ""}#{log.entityId}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
        <span>{total} event{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}
