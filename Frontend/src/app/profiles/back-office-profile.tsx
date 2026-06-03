import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from  "../components/ui-components";;
import {
  User, Mail, Phone, Building2, Inbox, CheckCircle, XCircle, Clock, Plus,
  FileText, UserPlus, AlertTriangle, Eye, Settings
} from "lucide-react";
import { getMyProfile } from "../api/authApi";
import type { UserProfile } from "../api/authApi";
import ProfileEditSection from "../components/profile-edit-section";

type Tab = "profile" | "tickets" | "approvals" | "accounts" | "settings";

export default function BackOfficeProfile() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [status, setStatus] = useState("Online");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "..";

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "Back-Office Profile" },
    { key: "tickets", label: "Assigned Tickets" },
    { key: "approvals", label: "Customer Approvals" },
    { key: "accounts", label: "Account Creation" },
    { key: "settings", label: "Profile Settings" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Back-Office Admin Portal</h2>
          <p className="text-sm text-slate-500">Ticket processing, customer approvals, and account management</p>
        </div>
        <Badge variant="neutral" className="text-sm px-3 py-1 w-fit">Back Office</Badge>
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
              <div className="h-24 w-24 rounded-full bg-slate-700 flex items-center justify-center text-white text-3xl font-bold mb-4">{initials}</div>
              <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
              <p className="text-sm text-slate-500">{profile?.personId ? `EMP-${profile.personId}` : "—"} · Back Office Admin</p>
              <div className="mt-4 w-full space-y-3">
                <Select value={status} onChange={(e) => { setStatus(e.target.value); toast.success(`Status: ${e.target.value}`); }}>
                  <option>Online</option>
                  <option>Away</option>
                  <option>On Break</option>
                  <option>Off Duty</option>
                </Select>
                <div className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium ${status === "Online" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${status === "Online" ? "bg-green-500" : "bg-slate-400"}`} /> {status}
                </div>
              </div>
              <div className="mt-4 w-full space-y-2 text-left text-sm">
                <div className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4 text-mtc-blue" /> {profile?.email || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4 text-mtc-blue" /> {profile?.phone || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Building2 className="h-4 w-4 text-mtc-blue" /> {profile?.department || "CRM Operations"}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Workload Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Assigned Tickets", value: "14", color: "text-mtc-blue" },
                  { label: "Pending Approvals", value: "6", color: "text-amber-600" },
                  { label: "Resolved Today", value: "8", color: "text-green-600" },
                  { label: "Avg Resolution", value: "4.2h", color: "text-slate-900" },
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

      {/* ASSIGNED TICKETS */}
      {activeTab === "tickets" && (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Inbox className="h-5 w-5 text-mtc-blue" /> Assigned Tickets Queue</CardTitle>
            <Badge variant="warning" className="w-fit">14 Pending</Badge>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Corporate</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Assigned By</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { id: "CMP-00431", corp: "First National Bank", cat: "Billing", by: "Jane Smith", priority: "High", sla: "breached" },
                { id: "REQ-00128", corp: "Namibia Breweries", cat: "Provisioning", by: "John Doe", priority: "Medium", sla: "warning" },
                { id: "CMP-00435", corp: "Air Namibia", cat: "Service Outage", by: "System", priority: "Critical", sla: "danger" },
                { id: "REQ-00129", corp: "Namport", cat: "New Connection", by: "Jane Smith", priority: "Low", sla: "success" },
                { id: "CMP-00436", corp: "Ministry of Finance", cat: "Network", by: "John Doe", priority: "Medium", sla: "warning" },
              ].map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-mtc-blue">{t.id}</TableCell>
                  <TableCell className="font-medium text-slate-900">{t.corp}</TableCell>
                  <TableCell>{t.cat}</TableCell>
                  <TableCell>{t.by}</TableCell>
                  <TableCell>
                    <Badge variant={t.priority === "Critical" ? "danger" : t.priority === "High" ? "warning" : t.priority === "Medium" ? "default" : "success"}>
                      {t.priority}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant={t.sla as any}>{t.sla === "breached" ? "Breached" : t.sla === "danger" ? "At Risk" : t.sla === "warning" ? "Warning" : "On Track"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" /> View</Button>
                      <Button size="sm" onClick={() => toast.success(`${t.id} processing started`)}>Process</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* CUSTOMER CREATION APPROVALS */}
      {activeTab === "approvals" && (
        <div className="space-y-4">
          <Card className="bg-amber-50/30 border-amber-200">
            <CardContent className="pt-6 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-800">Review and approve/reject customer creation requests submitted by Executives. Verify all company details before approval.</p>
            </CardContent>
          </Card>

          {[
            { id: "CCA-001", company: "Namibia Solar Solutions", contact: "Werner Müller", phone: "+264 81 555 0001", lines: "25", product: "Mobile + Fiber", exec: "Jane Smith", date: "Oct 25, 2024", status: "pending" },
            { id: "CCA-002", company: "Safari Tours Namibia", contact: "David Nashandi", phone: "+264 81 555 0002", lines: "10", product: "Mobile Voice", exec: "John Doe", date: "Oct 24, 2024", status: "pending" },
            { id: "CCA-003", company: "Windhoek Consulting Group", contact: "Lisa Hein", phone: "+264 81 555 0003", lines: "50", product: "Fiber + Cloud", exec: "Jane Smith", date: "Oct 23, 2024", status: "approved" },
          ].map((req) => (
            <Card key={req.id} className={req.status === "approved" ? "border-green-200 bg-green-50/20" : ""}>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <h4 className="font-semibold text-slate-900">{req.company}</h4>
                      <Badge variant={req.status === "pending" ? "warning" : "success"}>{req.status === "pending" ? "Pending Review" : "Approved"}</Badge>
                      <span className="text-xs text-slate-500">{req.id}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><span className="text-slate-500 block">Contact</span><span className="font-medium">{req.contact}</span></div>
                      <div><span className="text-slate-500 block">Phone</span><span className="font-medium">{req.phone}</span></div>
                      <div><span className="text-slate-500 block">Est. Lines</span><span className="font-medium">{req.lines}</span></div>
                      <div><span className="text-slate-500 block">Product</span><span className="font-medium">{req.product}</span></div>
                      <div><span className="text-slate-500 block">Submitted By</span><span className="font-medium">{req.exec}</span></div>
                      <div><span className="text-slate-500 block">Date</span><span className="font-medium">{req.date}</span></div>
                    </div>
                  </div>
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-slate-200">
                    <Button variant="outline" onClick={() => toast.error("Customer rejected", { description: `${req.company} creation request denied.` })}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button onClick={() => toast.success("Customer approved", { description: `${req.company} has been approved. Account creation can proceed.` })}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ACCOUNT CREATION */}
      {activeTab === "accounts" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-5 w-5 text-mtc-blue" /> Create New Account / Lines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Corporate Customer <span className="text-red-500">*</span></Label>
                <Select>
                  <option value="">Select Approved Corporate...</option>
                  <option>First National Bank</option>
                  <option>Namibia Breweries</option>
                  <option>Ministry of Finance</option>
                  <option>Windhoek Consulting Group (New)</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account Type <span className="text-red-500">*</span></Label>
                <Select>
                  <option value="">Select Type...</option>
                  <option>Corporate Postpaid</option>
                  <option>Hybrid Account</option>
                  <option>Data Only</option>
                  <option>IoT Account</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Number of Lines <span className="text-red-500">*</span></Label>
                <Input type="number" placeholder="e.g. 25" />
              </div>
              <div className="space-y-2">
                <Label>Service Package <span className="text-red-500">*</span></Label>
                <Select>
                  <option value="">Select Package...</option>
                  <option>MTC Business Essential</option>
                  <option>MTC Business Plus</option>
                  <option>MTC Business Premium</option>
                  <option>MTC Enterprise</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Billing Cycle</Label>
                <Select>
                  <option>Monthly (1st)</option>
                  <option>Monthly (15th)</option>
                  <option>Quarterly</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contract Duration</Label>
                <Select>
                  <option>12 Months</option>
                  <option>24 Months</option>
                  <option>36 Months</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Activation Date</Label>
                <Input type="date" />
              </div>
              <div className="space-y-2">
                <Label>SIM Type</Label>
                <Select>
                  <option>Physical SIM</option>
                  <option>eSIM</option>
                  <option>Multi-SIM</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned Executive</Label>
                <Select>
                  <option>Jane Smith</option>
                  <option>John Doe</option>
                  <option>Sarah Lee</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <Button variant="outline">Save Draft</Button>
              <Button onClick={() => toast.success("Account created", { description: "New corporate account provisioned successfully. Lines are being activated." })}>
                <Plus className="h-4 w-4 mr-1" /> Create Account
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PROFILE SETTINGS */}
      {activeTab === "settings" && profile && (
        <ProfileEditSection profile={profile} onProfileUpdated={(updated) => setProfile(updated)} />
      )}
    </div>
  );
}
