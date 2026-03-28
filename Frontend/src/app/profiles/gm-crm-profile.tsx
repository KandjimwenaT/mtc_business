import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../components/ui-components";;
import {
  User, Mail, Phone, Crown, AlertTriangle, ShieldAlert, Building2,
  CheckCircle, XCircle, Eye, Clock, TrendingDown, Zap, FileText, MessageSquare, Settings
} from "lucide-react";
import { getMyProfile } from "../api/authApi";
import type { UserProfile } from "../api/authApi";
import ProfileEditSection from "../components/profile-edit-section";

type Tab = "profile" | "escalations" | "risk" | "resolution" | "settings";

export default function GMCRMProfile() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "..";

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "GM CRM Profile" },
    { key: "escalations", label: "L3 Escalation Dashboard" },
    { key: "risk", label: "Corporate Risk Overview" },
    { key: "resolution", label: "Final Decision / Resolution" },
    { key: "settings", label: "Profile Settings" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">GM CRM Portal</h2>
          <p className="text-sm text-slate-500">Strategic oversight, critical escalations, and final resolutions</p>
        </div>
        <Badge className="text-sm px-3 py-1 bg-mtc-navy text-white border-transparent">GM CRM</Badge>
      </div>

      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >{tab.label}</button>
        ))}
      </div>

      {/* PROFILE */}
      {activeTab === "profile" && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <div className="h-24 w-24 rounded-full bg-mtc-navy flex items-center justify-center text-white text-3xl font-bold mb-4">{initials}</div>
              <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
              <p className="text-sm text-slate-500">{profile?.personId ? `EMP-${profile.personId}` : "—"} · General Manager CRM</p>
              <div className="mt-4 w-full space-y-2 text-left text-sm">
                <div className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4 text-mtc-blue" /> {profile?.email || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4 text-mtc-blue" /> {profile?.phone || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Crown className="h-4 w-4 text-mtc-blue" /> {profile?.department || "Executive Management"}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Strategic KPIs</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Corporates", value: "87", color: "text-mtc-blue" },
                  { label: "At-Risk Accounts", value: "12", color: "text-red-600" },
                  { label: "L3 Escalations", value: "3", color: "text-amber-600" },
                  { label: "Revenue (MTD)", value: "N$14.2M", color: "text-green-600" },
                ].map((m) => (
                  <div key={m.label} className="text-center p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <span className={`text-2xl font-bold ${m.color}`}>{m.value}</span>
                    <p className="text-xs text-slate-500 mt-1">{m.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* L3 ESCALATION DASHBOARD */}
      {activeTab === "escalations" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-red-50 border-red-200">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-red-100"><Zap className="h-6 w-6 text-red-600" /></div>
                <div>
                  <span className="text-2xl font-bold text-red-600">3</span>
                  <p className="text-xs text-red-700">Critical / Same-Day</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-amber-100"><AlertTriangle className="h-6 w-6 text-amber-600" /></div>
                <div>
                  <span className="text-2xl font-bold text-amber-600">5</span>
                  <p className="text-xs text-slate-500">Pending L3 Review</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-100"><CheckCircle className="h-6 w-6 text-green-600" /></div>
                <div>
                  <span className="text-2xl font-bold text-green-600">12</span>
                  <p className="text-xs text-slate-500">Resolved This Month</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-500" /> Level-3 Escalation Queue</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket ID</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Criticality</TableHead>
                  <TableHead>Escalated By</TableHead>
                  <TableHead>Time Pending</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { id: "CMP-00434", corp: "Air Namibia", issue: "Complete service outage — 72 sites offline", crit: "critical", by: "Sarah Williams (Sup)", time: "2h 15m" },
                  { id: "CMP-00431", corp: "First National Bank", issue: "Billing overcharge N$450K — customer threatening contract exit", crit: "critical", by: "Maria Hamutenya (Mgmt)", time: "4h 30m" },
                  { id: "CMP-00438", corp: "Ohlthaver & List", issue: "Repeated SLA breaches — customer requesting penalty clause", crit: "critical", by: "Sarah Williams (Sup)", time: "1h 45m" },
                  { id: "CMP-00432", corp: "Ministry of Finance", issue: "Network QoS below contractual threshold for 2 weeks", crit: "high", by: "Peter Angula (Sup)", time: "6h" },
                  { id: "CMP-00439", corp: "Telecom Namibia", issue: "Provisioning delay on 30 new lines — 5 days overdue", crit: "high", by: "Maria Hamutenya (Mgmt)", time: "8h" },
                ].map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium text-mtc-blue">{e.id}</TableCell>
                    <TableCell className="font-medium text-slate-900">{e.corp}</TableCell>
                    <TableCell className="max-w-xs"><p className="text-sm truncate">{e.issue}</p></TableCell>
                    <TableCell>
                      <Badge variant={e.crit === "critical" ? "danger" : "warning"} className="flex items-center gap-1 w-fit">
                        {e.crit === "critical" && <Zap className="h-3 w-3" />}
                        {e.crit.charAt(0).toUpperCase() + e.crit.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{e.by}</TableCell>
                    <TableCell><span className="text-red-600 font-mono font-medium">{e.time}</span></TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        <Button size="sm" onClick={() => toast.success(`${e.id} — taking action`, { description: "Resolution form opened." })}>
                          Take Action
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* CORPORATE RISK OVERVIEW */}
      {activeTab === "risk" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" /> Corporate Risk Overview</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corporate</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Open Issues</TableHead>
                <TableHead>SLA Compliance</TableHead>
                <TableHead>Last Rating</TableHead>
                <TableHead>Contract End</TableHead>
                <TableHead>Risk Factor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { corp: "Ohlthaver & List", health: "red", revenue: "N$1.5M", issues: 8, sla: "72%", rating: 2, end: "Sep 2024", risk: "Churn Risk — competitor approach" },
                { corp: "Air Namibia", health: "red", revenue: "N$420K", issues: 6, sla: "68%", rating: 1, end: "Jan 2025", risk: "Service outage — escalated" },
                { corp: "Ministry of Finance", health: "amber", revenue: "N$3.1M", issues: 4, sla: "85%", rating: 3, end: "Mar 2025", risk: "Contract renegotiation pending" },
                { corp: "Telecom Namibia", health: "amber", revenue: "N$650K", issues: 3, sla: "80%", rating: 3, end: "Nov 2024", risk: "Provisioning delays" },
                { corp: "First National Bank", health: "green", revenue: "N$2.4M", issues: 2, sla: "94%", rating: 5, end: "Jun 2025", risk: "Low — billing issue (resolving)" },
                { corp: "Namibia Breweries", health: "green", revenue: "N$890K", issues: 1, sla: "96%", rating: 5, end: "Dec 2024", risk: "Low — stable" },
              ].map((c) => (
                <TableRow key={c.corp}>
                  <TableCell className="font-medium text-slate-900">{c.corp}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-3 w-3 rounded-full ${c.health === "green" ? "bg-green-500" : c.health === "amber" ? "bg-amber-500" : "bg-red-500"}`} />
                      <span className="text-xs capitalize font-medium">{c.health}</span>
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{c.revenue}</TableCell>
                  <TableCell><span className={c.issues > 5 ? "text-red-600 font-bold" : ""}>{c.issues}</span></TableCell>
                  <TableCell><span className={`font-medium ${parseInt(c.sla) < 80 ? "text-red-600" : parseInt(c.sla) < 90 ? "text-amber-600" : "text-green-600"}`}>{c.sla}</span></TableCell>
                  <TableCell>
                    <span className={`font-bold ${c.rating >= 4 ? "text-green-600" : c.rating <= 2 ? "text-red-600" : "text-amber-600"}`}>{c.rating}/5</span>
                  </TableCell>
                  <TableCell>{c.end}</TableCell>
                  <TableCell><span className="text-xs text-slate-600">{c.risk}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* FINAL DECISION / RESOLUTION */}
      {activeTab === "resolution" && (
        <div className="space-y-6">
          <Card className="bg-red-50/30 border-red-200">
            <CardContent className="pt-6 flex items-center gap-3">
              <Zap className="h-5 w-5 text-red-600" />
              <p className="text-sm text-red-800">These critical issues require your <strong>final decision and resolution</strong>. Actions taken here are logged for audit and communicated to all stakeholders immediately.</p>
            </CardContent>
          </Card>

          {[
            { id: "CMP-00434", corp: "Air Namibia", issue: "Complete service outage — 72 sites offline for 6+ hours", escalation: "L3 (from Supervisor)", assignedExec: "Jane Smith", timeline: "Immediate resolution required" },
            { id: "CMP-00431", corp: "First National Bank", issue: "Billing overcharge of N$450,000 — customer threatening contract termination", escalation: "L3 (from Management)", assignedExec: "John Doe", timeline: "Same-day resolution" },
          ].map((item) => (
            <Card key={item.id} className="border-red-200">
              <CardHeader className="bg-red-50 border-b border-red-200 py-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4 text-red-600" /> {item.id} — {item.corp}
                  </CardTitle>
                  <Badge variant="danger">Awaiting GM Decision</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-slate-500 block">Issue</span><p className="font-medium text-slate-900">{item.issue}</p></div>
                  <div><span className="text-slate-500 block">Escalation Path</span><p className="font-medium">{item.escalation}</p></div>
                  <div><span className="text-slate-500 block">Assigned Executive</span><p className="font-medium">{item.assignedExec}</p></div>
                  <div><span className="text-slate-500 block">Timeline</span><p className="font-medium text-red-600">{item.timeline}</p></div>
                </div>

                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Resolution Decision <span className="text-red-500">*</span></Label>
                    <Select>
                      <option value="">Select Decision...</option>
                      <option>Issue Resolved — Credit Applied</option>
                      <option>Issue Resolved — Service Restored</option>
                      <option>Partial Resolution — Follow-up Required</option>
                      <option>Escalate to External (Vendor/Partner)</option>
                      <option>Compensation Package Offered</option>
                      <option>Contract Amendment Required</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Resolution Notes <span className="text-red-500">*</span></Label>
                    <textarea className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue" placeholder="Document the final decision and actions taken..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Follow-up Action</Label>
                    <Select>
                      <option value="">No follow-up needed</option>
                      <option>Schedule courtesy visit within 7 days</option>
                      <option>Assign dedicated resource for 30 days</option>
                      <option>Executive management review in 2 weeks</option>
                      <option>Customer retention call by GM</option>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-4 border-t border-slate-200">
                  <Button variant="outline">Save as Draft</Button>
                  <Button onClick={() => toast.success(`${item.id} resolved`, { description: `Final resolution issued for ${item.corp}. All stakeholders notified.` })}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Issue Final Resolution
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* PROFILE SETTINGS */}
      {activeTab === "settings" && profile && (
        <ProfileEditSection profile={profile} onProfileUpdated={(updated) => setProfile(updated)} />
      )}
    </div>
  );
}
