import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./ui-components";
import { AlertCircle, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import { Link } from "react-router";
import EscalationWorkflowCard from "./EscalationWorkflowCard";

export default function SLAMonitoring() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">SLA Monitoring & Escalations</h2>
        <p className="text-sm text-slate-500">Real-time status of all active SLAs and escalation workflows.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-t-4 border-t-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" /> Healthy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">142</div>
            <p className="text-xs text-slate-500">&gt; 50% Time Remaining</p>
          </CardContent>
        </Card>
        
        <Card className="border-t-4 border-t-blue-500">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-slate-500 flex items-center justify-center gap-1">
              <Clock className="h-4 w-4 text-blue-500" /> Warning
            </p>
            <div className="text-3xl font-bold">28</div>
            <p className="text-xs text-slate-500">&lt; 50% Time Remaining</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" /> At Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">12</div>
            <p className="text-xs text-slate-500">&lt; 25% Time Remaining</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-slate-900 bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-slate-900" /> Breached
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">7</div>
            <p className="text-xs text-red-600 font-medium">Overdue (Escalated)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Tickets by SLA State</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket ID</TableHead>
                  <TableHead>SLA State</TableHead>
                  <TableHead>Time Elapsed</TableHead>
                  <TableHead>Escalation Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { id: "CMP-00431", state: "breached", time: "26h 45m (Limit 24h)", esc: "L1 (Supervisor)" },
                  { id: "REQ-00124", state: "warning", time: "12h 10m (Limit 24h)", esc: "L0 (Admin)" },
                  { id: "CMP-00432", state: "danger", time: "23h 15m (Limit 24h)", esc: "L0 (Admin)" },
                  { id: "REQ-00125", state: "success", time: "2h 05m (Limit 48h)", esc: "L0 (Executive)" },
                ].map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-mtc-blue">
                      <Link to={`/tickets/${row.id}`} className="hover:underline">{row.id}</Link>
                    </TableCell>
                    <TableCell>
                       <Badge variant={row.state as any}>{row.state === 'danger' ? 'At Risk' : row.state.charAt(0).toUpperCase() + row.state.slice(1)}</Badge>
                    </TableCell>
                    <TableCell className={row.state === 'breached' ? "text-red-600 font-medium" : ""}>{row.time}</TableCell>
                    <TableCell>{row.esc}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <EscalationWorkflowCard />
      </div>
    </div>
  );
}