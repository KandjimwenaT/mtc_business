import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "./ui-components";
import { Clock, Loader2, Save } from "lucide-react";
import { getSlaConfigs, saveSlaConfigs, type SlaConfigRecord } from "../api/slaApi";

export default function SlaConfigurationPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [department, setDepartment] = useState<string | null>(null);
  const [configs, setConfigs] = useState<SlaConfigRecord[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "complaint" | "request">("all");

  const load = async () => {
    setLoading(true);
    try {
      const data = await getSlaConfigs();
      setConfigs(data.configs);
      setCanEdit(data.canEdit);
      setDepartment(data.department);
    } catch (err: any) {
      toast.error(err.message || "Failed to load SLA configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(
    () => configs.filter((row) => categoryFilter === "all" || row.category === categoryFilter),
    [configs, categoryFilter]
  );

  const updateRow = (indexInVisible: number, patch: Partial<SlaConfigRecord>) => {
    const target = visible[indexInVisible];
    if (!target) return;
    setConfigs((prev) =>
      prev.map((row) =>
        row.category === target.category && row.ticketType === target.ticketType
          ? { ...row, ...patch, isDefault: false }
          : row
      )
    );
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const data = await saveSlaConfigs(configs);
      setConfigs(data.configs);
      toast.success("SLA configuration saved", {
        description: "New tickets will use these targets and escalation rules.",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to save SLA configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 flex items-center justify-center text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading SLA configuration…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-5 w-5 text-mtc-blue" />
          SLA Configuration
        </CardTitle>
        <p className="text-sm text-slate-500">
          Set how long each complaint and request type has to be resolved, when it should warn,
          and when it escalates to supervisor, manager, and GM.
          {department ? (
            <> Rules apply to <span className="font-medium text-slate-700">{department}</span> tickets from the moment they are logged.</>
          ) : (
            <> A department on your profile is required before these rules can be saved.</>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <Label className="text-xs text-slate-500">Show</Label>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as "all" | "complaint" | "request")}
            >
              <option value="all">All tickets</option>
              <option value="complaint">Complaints</option>
              <option value="request">Requests</option>
            </Select>
          </div>
          {!canEdit && (
            <Badge variant="neutral">View only — managers and admins can edit</Badge>
          )}
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Ticket type</TableHead>
              <TableHead>Target (h)</TableHead>
              <TableHead>Warning at remaining (h)</TableHead>
              <TableHead>At risk at remaining (h)</TableHead>
              <TableHead>L1 Supervisor after (h)</TableHead>
              <TableHead>L2 Manager after (h)</TableHead>
              <TableHead>L3 GM after (h)</TableHead>
              <TableHead>Auto-escalate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, i) => (
              <TableRow key={`${row.category}-${row.ticketType}`}>
                <TableCell>
                  <Badge variant={row.category === "complaint" ? "danger" : "default"}>
                    {row.category === "complaint" ? "Complaint" : "Request"}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-slate-900 whitespace-nowrap">
                  {row.typeLabel || row.ticketType}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    disabled={!canEdit}
                    value={row.targetHours}
                    onChange={(e) => updateRow(i, { targetHours: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    className="w-20"
                    disabled={!canEdit}
                    value={row.warningHours}
                    onChange={(e) => updateRow(i, { warningHours: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    className="w-20"
                    disabled={!canEdit}
                    value={row.atRiskHours}
                    onChange={(e) => updateRow(i, { atRiskHours: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    disabled={!canEdit}
                    value={row.escalateL1Hours}
                    onChange={(e) => updateRow(i, { escalateL1Hours: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    disabled={!canEdit}
                    value={row.escalateL2Hours}
                    onChange={(e) => updateRow(i, { escalateL2Hours: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    disabled={!canEdit}
                    value={row.escalateL3Hours}
                    onChange={(e) => updateRow(i, { escalateL3Hours: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={row.autoEscalate}
                      onChange={(e) => updateRow(i, { autoEscalate: e.target.checked })}
                    />
                    On
                  </label>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="p-4 border-t border-slate-200 flex justify-end">
        <Button onClick={() => void handleSave()} disabled={!canEdit || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save SLA configuration
        </Button>
      </div>
    </Card>
  );
}
