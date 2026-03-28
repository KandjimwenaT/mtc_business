import { useNavigate } from "react-router";
import { getCurrentUser } from "../api/authApi";
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
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from "recharts";

const ticketsData = [
  { name: 'Mon', new: 12, resolved: 10 },
  { name: 'Tue', new: 19, resolved: 15 },
  { name: 'Wed', new: 15, resolved: 20 },
  { name: 'Thu', new: 22, resolved: 18 },
  { name: 'Fri', new: 30, resolved: 25 },
];

const slaData = [
  { name: 'Healthy', value: 65, color: '#22c55e' },
  { name: 'Warning', value: 20, color: '#60a5fa' },
  { name: 'At Risk', value: 10, color: '#ef4444' },
  { name: 'Breached', value: 5, color: '#0A1628' },
];

export default function Dashboard() {
  const currentUser = getCurrentUser();
  const role = currentUser?.role ?? "";
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Overview</h2>
      </div>

      {role === "manager" ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-slate-500">Total Customers Handled</p>
              <div className="text-3xl font-bold text-mtc-blue mt-2">87</div>
              <p className="text-xs text-slate-400 mt-1">Active corporate accounts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-slate-500">Issues Resolved (MTD)</p>
              <div className="text-3xl font-bold text-green-600 mt-2">142</div>
              <p className="text-xs text-slate-400 mt-1">+18% vs last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-slate-500">Visits Completed (MTD)</p>
              <div className="text-3xl font-bold text-mtc-blue-dark mt-2">63</div>
              <p className="text-xs text-slate-400 mt-1">74 scheduled this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-slate-500">Avg Satisfaction Score</p>
              <div className="text-3xl font-bold text-amber-600 mt-2">4.1 / 5</div>
              <p className="text-xs text-slate-400 mt-1">Team average across all executives</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* KPI Cards */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-slate-500"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1,204</div>
              <p className="text-xs text-slate-500">+20% from last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Visits</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-slate-500"
            >
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">34</div>
              <p className="text-xs text-slate-500">Next visit in 2 hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-slate-500"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-mtc-blue">4.2</div>
              <p className="text-xs text-slate-500">Based on 142 reviews</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Breached SLAs</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-red-500"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" x2="12" y1="9" y2="13" />
                <line x1="12" x2="12.01" y1="17" y2="17" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">7</div>
              <p className="text-xs text-red-500 font-medium">+2 since yesterday</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Ticketing Volume</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketsData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: 'rgba(226, 232, 240, 0.4)'}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="new" name="New Tickets" fill="#0072CE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resolved" name="Resolved" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>SLA Health Distribution</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="h-[300px] flex items-center justify-center relative min-h-[300px] min-w-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    id="sla-pie"
                    data={slaData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {slaData.map((entry, index) => (
                      <Cell key={`sla-cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center">
                <span className="text-sm text-slate-500">Total</span>
                <span className="text-2xl font-bold">100%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role-specific widget section based on requirements */}
      <Card>
        <CardHeader>
          <CardTitle>
            {role === 'manager' ? 'Chronic Issues' :
           role === 'executive_staff' ? 'My Corporates Health' :
           role === 'gm' ? 'Relationship Risk Index' :
           'Recent Tickets & Ratings'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corporate</TableHead>
                <TableHead>Issue / Engagement</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { corp: "Acme Corp", issue: "Network Outage", status: "Open", sla: "breached", ticketId: "CMP-00431" },
                { corp: "Global Tech", issue: "Billing Dispute", status: "In Progress", sla: "warning", ticketId: "REQ-00124" },
                { corp: "Stark Ind", issue: "New Connection", status: "Resolved", sla: "success", ticketId: "REQ-00125" },
                { corp: "Wayne Ent", issue: "Monthly Review", status: "Scheduled", sla: "neutral", ticketId: "REQ-00126" },
              ].map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-slate-900">{row.corp}</TableCell>
                  <TableCell>{row.issue}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>
                    <Badge variant={row.sla as any}>
                      {row.sla.charAt(0).toUpperCase() + row.sla.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <button 
                      className="text-mtc-blue hover:underline text-sm font-medium"
                      onClick={() => navigate(`/tickets/${row.ticketId}`)}
                    >
                      View
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}