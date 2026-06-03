import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../components/ui-components";;
import {
  User, MapPin, Car,
  AlertTriangle, FileText, Plus, X, Phone, Mail, Building2, Calendar,
  Fuel, ClipboardCheck, MessageSquare, Eye, Settings
} from "lucide-react";
import { getMyProfile } from "../api/authApi";
import type { UserProfile } from "../api/authApi";
import { getMyAccounts } from "../api/authApi";
import type { ExecutiveAccountRecord } from "../api/authApi";
import ProfileEditSection from "../components/profile-edit-section";

type Tab = "profile" | "tickets" | "leads" | "vehicle" | "settings";

export default function ExecutiveProfile() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [status, setStatus] = useState("Remote");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Corporate accounts summary (for profile tab)
  const [myAccounts, setMyAccounts] = useState<ExecutiveAccountRecord[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
    setAccountsLoading(true);
    getMyAccounts()
      .then(setMyAccounts)
      .catch(() => toast.error("Failed to load corporate accounts"))
      .finally(() => setAccountsLoading(false));
  }, []);

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "..";

  // Vehicle state
  const [vehicleCheckedOut, setVehicleCheckedOut] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "Executive Profile" },
    { key: "tickets", label: "Ticket Access" },
    { key: "leads", label: "Lead Creation" },
    { key: "vehicle", label: "Vehicle Check-in/out" },
    { key: "settings", label: "Profile Settings" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Executive Portal</h2>
          <p className="text-sm text-slate-500">Field operations, visit tracking, and customer engagement</p>
        </div>
        <Badge variant="default" className="text-sm px-3 py-1 w-fit">Executive</Badge>
      </div>

      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* EXECUTIVE PROFILE */}
      {activeTab === "profile" && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <div className="h-24 w-24 rounded-full bg-mtc-blue flex items-center justify-center text-white text-3xl font-bold mb-4">{initials}</div>
              <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
              <p className="text-sm text-slate-500">{profile?.personId ? `EMP-${profile.personId}` : "—"}</p>

              <div className="mt-4 w-full space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Current Status</Label>
                  <Select value={status} onChange={(e) => { setStatus(e.target.value); toast.success(`Status: ${e.target.value}`); }}>
                    <option>On Site Visit</option>
                    <option>On Leave</option>
                    <option>Remote</option>
                    <option>In a Meeting</option>
                  </Select>
                </div>
                <div className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium ${
                  status === "On Site Visit" ? "bg-green-100 text-green-800" :
                  status === "On Leave" ? "bg-red-100 text-red-800" :
                  status === "Remote" ? "bg-blue-100 text-blue-800" :
                  "bg-amber-100 text-amber-800"
                }`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    status === "On Site Visit" ? "bg-green-500" :
                    status === "On Leave" ? "bg-red-500" :
                    status === "Remote" ? "bg-blue-500" :
                    "bg-amber-500"
                  }`} />
                  {status}
                </div>
              </div>

              <div className="mt-4 w-full space-y-2 text-left text-sm">
                <div className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4 text-mtc-blue" /> {profile?.email || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4 text-mtc-blue" /> {profile?.phone || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><MapPin className="h-4 w-4 text-mtc-blue" /> {profile?.region || "Windhoek Region"}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Corporate Assignments</CardTitle>
            </CardHeader>
            {myAccounts.length === 0 && !accountsLoading ? (
              <CardContent><p className="text-sm text-slate-500">No accounts assigned yet.</p></CardContent>
            ) : accountsLoading ? (
              <CardContent><p className="text-sm text-slate-500">Loading accounts...</p></CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corporate</TableHead>
                    <TableHead>Account #</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Services</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myAccounts.slice(0, 5).map((a) => (
                    <TableRow key={a.accountId}>
                      <TableCell className="font-medium text-slate-900">{a.accountName}</TableCell>
                      <TableCell className="text-mtc-blue font-medium">{a.accountNumber}</TableCell>
                      <TableCell>{a.industry || "—"}</TableCell>
                      <TableCell>{a.services.length}</TableCell>
                      <TableCell><Badge variant={a.approvalStatus === "approved" ? "success" : a.approvalStatus === "pending" ? "warning" : "danger"}>{a.approvalStatus}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {myAccounts.length > 5 && (
              <CardContent className="pt-0">
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/corporates")}>
                  View All {myAccounts.length} Accounts
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      )}


      {/* TICKET ACCESS */}
      {activeTab === "tickets" && (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">My Assigned Tickets</CardTitle>
            <p className="text-sm text-slate-500">View, comment, and assign to Back Office</p>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Corporate</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { id: "CMP-00431", corp: "First National Bank", cat: "Billing", status: "Escalated L1", sla: "breached" },
                { id: "CMP-00432", corp: "Ohlthaver & List", cat: "Network QoS", status: "Assigned", sla: "danger" },
                { id: "REQ-00124", corp: "Namibia Breweries", cat: "Renewal", status: "In Progress", sla: "warning" },
                { id: "CMP-00434", corp: "Air Namibia", cat: "Service Outage", status: "New", sla: "danger" },
              ].map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-mtc-blue">{t.id}</TableCell>
                  <TableCell className="font-medium text-slate-900">{t.corp}</TableCell>
                  <TableCell>{t.cat}</TableCell>
                  <TableCell>{t.status}</TableCell>
                  <TableCell><Badge variant={t.sla as any}>{t.sla === "breached" ? "Breached" : t.sla === "danger" ? "At Risk" : "Warning"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col sm:flex-row gap-1 sm:justify-end">
                      <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" /> View</Button>
                      <Button variant="ghost" size="sm"><MessageSquare className="h-4 w-4 mr-1" /> Comment</Button>
                      <Button variant="outline" size="sm" onClick={() => toast.success("Assigned to Back Office", { description: `${t.id} routed to Back Office queue.` })}>
                        Assign to BO
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* LEAD CREATION */}
      {activeTab === "leads" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Plus className="h-5 w-5 text-mtc-blue" /> Create New Lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Lead Source <span className="text-red-500">*</span></Label>
                <Select>
                  <option value="">Select Source...</option>
                  <option>Customer Visit</option>
                  <option>Referral</option>
                  <option>Cold Call</option>
                  <option>Event / Conference</option>
                  <option>Website Inquiry</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Company Name <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Namibia Holdings Ltd" />
              </div>
              <div className="space-y-2">
                <Label>Contact Person <span className="text-red-500">*</span></Label>
                <Input placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label>Contact Phone</Label>
                <Input placeholder="+264 81..." />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input placeholder="email@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Estimated Lines</Label>
                <Select>
                  <option>1 - 10</option>
                  <option>11 - 50</option>
                  <option>51 - 100</option>
                  <option>100+</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Product Interest <span className="text-red-500">*</span></Label>
                <Select>
                  <option value="">Select Product...</option>
                  <option>Mobile Voice</option>
                  <option>Fiber Internet</option>
                  <option>Cloud Services</option>
                  <option>IoT Solutions</option>
                  <option>SD-WAN</option>
                  <option>Bundled Package</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Low</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expected Close Date</Label>
                <Input type="date" />
              </div>
              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                <Label>Notes</Label>
                <textarea className="flex min-h-[60px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue" placeholder="Brief notes about the lead..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <Button variant="outline">Save as Draft</Button>
              <Button onClick={() => toast.success("Lead created", { description: "Lead has been submitted and assigned to your pipeline." })}>Submit Lead</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* VEHICLE CHECK-IN/OUT */}
      {activeTab === "vehicle" && (
        <div className="space-y-6">
          <Card className={vehicleCheckedOut ? "border-green-200 bg-green-50/20" : ""}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Car className="h-5 w-5 text-mtc-blue" /> Vehicle Assignment</CardTitle>
              <Badge variant={vehicleCheckedOut ? "success" : "neutral"}>{vehicleCheckedOut ? "Checked Out" : "Available"}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 block">Vehicle</span>
                  <span className="font-medium text-slate-900">Toyota Hilux 2.8 GD-6</span>
                </div>
                <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 block">Registration</span>
                  <span className="font-medium text-slate-900">N 4521 WH</span>
                </div>
                <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 block">Current Mileage</span>
                  <span className="font-medium text-slate-900">{vehicleCheckedOut ? "45,231 km" : "45,198 km"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{vehicleCheckedOut ? "Check-In Vehicle" : "Check-Out Vehicle"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Odometer Reading (km) <span className="text-red-500">*</span></Label>
                  <Input type="number" placeholder="e.g. 45231" defaultValue={vehicleCheckedOut ? "" : "45198"} />
                </div>
                <div className="space-y-2">
                  <Label>Fuel Level <span className="text-red-500">*</span></Label>
                  <Select>
                    <option>Full</option>
                    <option>3/4</option>
                    <option>1/2</option>
                    <option>1/4</option>
                    <option>Empty</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Purpose of Trip</Label>
                  <Select>
                    <option>Customer Visit</option>
                    <option>Site Survey</option>
                    <option>Equipment Delivery</option>
                    <option>Office Commute</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destination</Label>
                  <Input placeholder="e.g. FNB Head Office, Windhoek" />
                </div>
              </div>

              {/* Inspection Checklist */}
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-mtc-blue" /> Vehicle Inspection Checklist
                </h4>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    "Tyres in good condition",
                    "Brakes functioning properly",
                    "Lights & indicators working",
                    "Windshield clean, no cracks",
                    "Mirrors intact & adjusted",
                    "Spare tyre & jack present",
                    "First aid kit present",
                    "No visible body damage",
                    "Oil & coolant levels OK",
                    "Horn functional",
                  ].map((item) => (
                    <label key={item} className="flex items-center gap-3 p-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-sm">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-mtc-blue focus:ring-mtc-blue" />
                      <span className="text-slate-700">{item}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Damage / Notes (if any)</Label>
                <textarea className="flex min-h-[60px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue" placeholder="Report any damage or issues..." />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                {!vehicleCheckedOut ? (
                  <Button className="flex items-center gap-2" onClick={() => { setVehicleCheckedOut(true); toast.success("Vehicle checked out", { description: "Toyota Hilux (N 4521 WH) checked out. Drive safely!" }); }}>
                    <Car className="h-4 w-4" /> Check Out Vehicle
                  </Button>
                ) : (
                  <Button variant="secondary" className="flex items-center gap-2" onClick={() => { setVehicleCheckedOut(false); toast.success("Vehicle checked in", { description: "Toyota Hilux (N 4521 WH) returned. Mileage recorded." }); }}>
                    <Car className="h-4 w-4" /> Check In Vehicle
                  </Button>
                )}
              </div>
            </CardContent>
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
