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

        <Card>
          <CardHeader>
            <CardTitle>Escalation Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  0
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between space-x-2 mb-1">
                    <div className="font-bold text-slate-900 text-sm">Level 0</div>
                  </div>
                  <div className="text-slate-500 text-xs">Admin / Executive</div>
                  <div className="text-slate-400 text-xs mt-1">SLA Target &lt; 100%</div>
                </div>
              </div>
              
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-100 text-blue-600 font-bold shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  L1
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-blue-200 bg-blue-50 shadow-sm">
                  <div className="flex items-center justify-between space-x-2 mb-1">
                    <div className="font-bold text-slate-900 text-sm">Level 1</div>
                  </div>
                  <div className="text-slate-700 text-xs font-medium">Supervisor</div>
                  <div className="text-blue-600 text-xs mt-1 font-semibold">Trigger: Breach (+0h)</div>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 text-slate-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  L2
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white shadow-sm opacity-60">
                  <div className="flex items-center justify-between space-x-2 mb-1">
                    <div className="font-bold text-slate-900 text-sm">Level 2</div>
                  </div>
                  <div className="text-slate-500 text-xs">Management</div>
                  <div className="text-slate-400 text-xs mt-1">Trigger: Breach +24h</div>
                </div>
              </div>

              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 text-slate-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  L3
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white shadow-sm opacity-60">
                  <div className="flex items-center justify-between space-x-2 mb-1">
                    <div className="font-bold text-slate-900 text-sm">Level 3</div>
                  </div>
                  <div className="text-slate-500 text-xs">GM CRM</div>
                  <div className="text-slate-400 text-xs mt-1">Trigger: Breach +48h</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}