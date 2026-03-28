import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../components/ui-components";;
import {
  User, Mail, Phone, Shield, AlertTriangle, CheckCircle, XCircle,
  Clock, Star, TrendingUp, TrendingDown, Calendar, BarChart3, Eye,
  MessageSquare, ArrowUpCircle, Settings
} from "lucide-react";
import { getMyProfile } from "../api/authApi";
import type { UserProfile } from "../api/authApi";
import ProfileEditSection from "../components/profile-edit-section";

type Tab = "profile" | "reschedules" | "escalations" | "performance" | "settings";

export default function SupervisorProfile() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "..";

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "Supervisor Profile" },
    { key: "reschedules", label: "Reschedule Approvals" },
    { key: "escalations", label: "L1 Escalation Inbox" },
    { key: "performance", label: "Executive Performance" },
    { key: "settings", label: "Profile Settings" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Supervisor Portal</h2>
          <p className="text-sm text-slate-500">Team oversight, escalation management, and performance monitoring</p>
        </div>
        <Badge variant="warning" className="text-sm px-3 py-1">Supervisor</Badge>
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
              <div className="h-24 w-24 rounded-full bg-mtc-blue-dark flex items-center justify-center text-white text-3xl font-bold mb-4">{initials}</div>
              <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
              <p className="text-sm text-slate-500">{profile?.personId ? `EMP-${profile.personId}` : "—"} · Supervisor</p>
              <div className="mt-4 w-full space-y-2 text-left text-sm">
                <div className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4 text-mtc-blue" /> {profile?.email || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4 text-mtc-blue" /> {profile?.phone || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Shield className="h-4 w-4 text-mtc-blue" /> {profile?.department || "CRM Supervision"} — {profile?.region || "Windhoek Region"}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Team Overview</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Executives", value: "8", color: "text-mtc-blue" },
                  { label: "Pending Reschedules", value: "3", color: "text-amber-600" },
                  { label: "L1 Escalations", value: "5", color: "text-red-600" },
                  { label: "Team Avg Rating", value: "4.1", color: "text-green-600" },
                ].map((m) => (
                  <div key={m.label} className="text-center p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <span className={`text-2xl font-bold ${m.color}`}>{m.value}</span>
                    <p className="text-xs text-slate-500 mt-1">{m.label}</p>
                  </div>
                ))}
              </div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">My Team</h4>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { name: "Jane Smith", status: "On Site Visit", accounts: 5, rating: 4.5 },
                  { name: "John Doe", status: "Remote", accounts: 4, rating: 4.0 },
                  { name: "Sarah Lee", status: "In a Meeting", accounts: 6, rating: 3.8 },
                  { name: "Peter Nakale", status: "Available", accounts: 3, rating: 4.7 },
                ].map((exec) => (
                  <div key={exec.name} className="flex items-center gap-3 p-3 rounded-md border border-slate-200 bg-white">
                    <div className="h-10 w-10 rounded-full bg-mtc-blue-50 flex items-center justify-center text-mtc-blue font-bold text-sm">
                      {exec.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-900 block">{exec.name}</span>
                      <span className="text-xs text-slate-500">{exec.accounts} accounts · {exec.rating} avg rating</span>
                    </div>
                    <Badge variant={exec.status === "On Site Visit" ? "success" : exec.status === "Available" ? "success" : "neutral"} className="text-xs shrink-0">
                      {exec.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* RESCHEDULE APPROVALS */}
      {activeTab === "reschedules" && (
        <div className="space-y-4">
          <Card className="bg-blue-50/30 border-blue-200">
            <CardContent className="pt-6 flex items-center gap-3">
              <Shield className="h-5 w-5 text-blue-600" />
              <p className="text-sm text-blue-800">All visit reschedule requests from Executives require your approval. Review the motivation before approving or rejecting.</p>
            </CardContent>
          </Card>

          {[
            { id: "RSC-001", corp: "Ministry of Finance", exec: "Jane Smith", reason: "Vehicle breakdown", date: "Oct 28 → Nov 1", motivation: "Vehicle breakdown en route to client premises. Replacement vehicle arranged for next available date.", status: "pending" as const },
            { id: "RSC-002", corp: "Bank Windhoek", exec: "John Doe", reason: "Customer requested", date: "Oct 29 → Nov 4", motivation: "Customer IT Director unavailable due to emergency board meeting. Customer requested rescheduling to following week.", status: "pending" as const },
            { id: "RSC-003", corp: "Telecom Namibia", exec: "Sarah Lee", reason: "Scheduling conflict", date: "Oct 27 → Oct 30", motivation: "Double-booked with priority escalation meeting for Air Namibia critical outage.", status: "approved" as const },
          ].map((req) => (
            <Card key={req.id} className={req.status === "pending" ? "border-amber-200" : "border-green-200 bg-green-50/20"}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h4 className="font-semibold text-slate-900">{req.corp}</h4>
                    <Badge variant={req.status === "pending" ? "warning" : "success"}>{req.status === "pending" ? "Pending Approval" : "Approved"}</Badge>
                    <span className="text-xs text-slate-500">{req.id}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                  <div><span className="text-slate-500 block">Executive</span><span className="font-medium">{req.exec}</span></div>
                  <div><span className="text-slate-500 block">Reason</span><span className="font-medium">{req.reason}</span></div>
                  <div><span className="text-slate-500 block">Date Change</span><span className="font-medium">{req.date}</span></div>
                </div>
                <div className="bg-white p-3 rounded border border-slate-200 mb-3">
                  <span className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Motivation</span>
                  <p className="text-sm text-slate-700">{req.motivation}</p>
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
                    <Button variant="outline" onClick={() => toast.error("Reschedule rejected", { description: `${req.exec} has been notified. Original visit remains.` })}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button onClick={() => toast.success("Reschedule approved", { description: `Visit for ${req.corp} rescheduled. Both parties notified.` })}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* L1 ESCALATION INBOX */}
      {activeTab === "escalations" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><ArrowUpCircle className="h-5 w-5 text-red-500" /> Level-1 Escalation Inbox</CardTitle>
            <Badge variant="danger">5 Active</Badge>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Corporate</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Escalated At</TableHead>
                <TableHead>Overdue By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { id: "CMP-00431", corp: "First National Bank", cat: "Billing", exec: "John Doe", time: "Oct 25, 09:30", overdue: "1h 30m" },
                { id: "CMP-00432", corp: "Ohlthaver & List", cat: "Network QoS", exec: "Jane Smith", time: "Oct 25, 11:00", overdue: "45m" },
                { id: "CMP-00434", corp: "Air Namibia", cat: "Service Outage", exec: "Jane Smith", time: "Oct 25, 08:15", overdue: "3h 15m" },
                { id: "CMP-00436", corp: "Ministry of Finance", cat: "Network", exec: "John Doe", time: "Oct 25, 12:30", overdue: "15m" },
                { id: "CMP-00437", corp: "Namport", cat: "Support", exec: "Sarah Lee", time: "Oct 25, 10:00", overdue: "2h" },
              ].map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium text-mtc-blue">{e.id}</TableCell>
                  <TableCell className="font-medium text-slate-900">{e.corp}</TableCell>
                  <TableCell>{e.cat}</TableCell>
                  <TableCell>{e.exec}</TableCell>
                  <TableCell>{e.time}</TableCell>
                  <TableCell><span className="text-red-600 font-mono font-medium">{e.overdue}</span></TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" /> View</Button>
                      <Button size="sm" onClick={() => toast.success(`${e.id} actioned`, { description: "Resolution logged and customer notified." })}>
                        Resolve
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => toast.warning(`${e.id} escalated to L2`, { description: "Management has been notified." })}>
                        Escalate L2
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* EXECUTIVE PERFORMANCE */}
      {activeTab === "performance" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Team Avg Rating", value: "4.1/5", icon: <Star className="h-5 w-5 text-blue-400" /> },
              { label: "Visits This Month", value: "47", icon: <Calendar className="h-5 w-5 text-mtc-blue" /> },
              { label: "SLA Compliance", value: "89%", icon: <BarChart3 className="h-5 w-5 text-green-600" /> },
              { label: "Control Cards Done", value: "42", icon: <CheckCircle className="h-5 w-5 text-green-500" /> },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-slate-50">{s.icon}</div>
                  <div>
                    <span className="text-2xl font-bold text-slate-900">{s.value}</span>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Executive Performance Breakdown</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Visits (MTD)</TableHead>
                  <TableHead>Control Cards</TableHead>
                  <TableHead>Avg Rating</TableHead>
                  <TableHead>SLA Compliance</TableHead>
                  <TableHead>Open Tickets</TableHead>
                  <TableHead>Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Peter Nakale", visits: 14, cards: 14, rating: 4.7, sla: "96%", tickets: 2, trend: "up" },
                  { name: "Jane Smith", visits: 12, cards: 11, rating: 4.5, sla: "92%", tickets: 4, trend: "up" },
                  { name: "John Doe", visits: 11, cards: 10, rating: 4.0, sla: "88%", tickets: 5, trend: "same" },
                  { name: "Sarah Lee", visits: 10, cards: 7, rating: 3.8, sla: "82%", tickets: 7, trend: "down" },
                ].map((e) => (
                  <TableRow key={e.name}>
                    <TableCell className="font-medium text-slate-900">{e.name}</TableCell>
                    <TableCell>{e.visits}</TableCell>
                    <TableCell>
                      <span className={e.cards < e.visits ? "text-amber-600 font-medium" : "text-green-600 font-medium"}>
                        {e.cards}/{e.visits}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className={`font-bold ${e.rating >= 4 ? "text-green-600" : e.rating >= 3 ? "text-amber-600" : "text-red-600"}`}>{e.rating}</span>
                        <Star className={`h-3.5 w-3.5 ${e.rating >= 4 ? "fill-green-400 text-green-400" : "fill-amber-400 text-amber-400"}`} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`font-medium ${parseInt(e.sla) >= 90 ? "text-green-600" : parseInt(e.sla) >= 80 ? "text-amber-600" : "text-red-600"}`}>{e.sla}</span>
                    </TableCell>
                    <TableCell>{e.tickets}</TableCell>
                    <TableCell>
                      {e.trend === "up" ? <TrendingUp className="h-4 w-4 text-green-500" /> :
                       e.trend === "down" ? <TrendingDown className="h-4 w-4 text-red-500" /> :
                       <span className="text-slate-400">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* PROFILE SETTINGS */}
      {activeTab === "settings" && profile && (
        <ProfileEditSection profile={profile} onProfileUpdated={(updated) => setProfile(updated)} />
      )}
    </div>
  );
}
