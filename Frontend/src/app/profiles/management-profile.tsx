import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../components/ui-components";;
import {
  User, Mail, Phone, Briefcase, Users, ArrowRightLeft, FileText, Clock,
  Settings, Plus, Trash2, X, CheckCircle, ArrowUp, Edit, Shield
} from "lucide-react";
import { getMyProfile } from "../api/authApi";
import type { UserProfile } from "../api/authApi";
import ProfileEditSection from "../components/profile-edit-section";
import {
  getCorporates,
  getPersonsByType,
  reassignCorporateExecutive,
  promoteExecutiveToSupervisor,
  demoteSupervisorToExecutive,
  type CorporateRecord,
  type PersonRecord,
} from "../api/adminApi";

type Tab = "profile" | "performance" | "assign" | "templates" | "sla" | "upgrade" | "settings";

export default function ManagementProfile() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [managerCorporates, setManagerCorporates] = useState<CorporateRecord[]>([]);
  const [managerExecutives, setManagerExecutives] = useState<PersonRecord[]>([]);
  const [reassigningCorporateId, setReassigningCorporateId] = useState<number | null>(null);
  const [promotingExecutiveId, setPromotingExecutiveId] = useState<number | null>(null);
  const [demotingSupervisorId, setDemotingSupervisorId] = useState<number | null>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  useEffect(() => {
    if (!profile || (profile.role !== "manager" && profile.role !== "supervisor")) return;

    const loadAssignData = async () => {
      try {
        const [allCorporates, allExecutives, allSupervisors] = await Promise.all([
          getCorporates(),
          getPersonsByType("executive_staff"),
          getPersonsByType("supervisor"),
        ]);

        // Support both manager profile id and person id mappings
        const corporatesForManager = allCorporates.filter(
          (c) => c.managerId === profile.roleProfileId || c.managerId === profile.personId
        );
        const executivesForManager = [...allExecutives, ...allSupervisors].filter(
          (e) => e.managerId === profile.roleProfileId || e.managerId === profile.personId
        );

        setManagerCorporates(corporatesForManager);
        setManagerExecutives(executivesForManager);
      } catch {
        toast.error("Failed to load assignment data");
      }
    };

    loadAssignData();
  }, [profile]);

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "..";
  const eligibleExecutives = managerExecutives.filter((person) => person.type !== "supervisor");
  const supervisorGroups = managerExecutives.filter((person) => person.type === "supervisor");

  // Template builder state
  const [templateSections, setTemplateSections] = useState([
    { id: 1, name: "Visit Objective", type: "textarea", required: true },
    { id: 2, name: "SLA & Service Performance", type: "metrics", required: true },
    { id: 3, name: "Customer Feedback", type: "textarea", required: true },
    { id: 4, name: "Risks Identified", type: "multi-field", required: true },
    { id: 5, name: "Opportunities", type: "multi-field", required: false },
    { id: 6, name: "Action Items", type: "dynamic-table", required: true },
    { id: 7, name: "Overall Account Health", type: "rag-selector", required: true },
  ]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "Manager / Supervisor Profile" },
    { key: "performance", label: "Executive Performance" },
    { key: "assign", label: "Assign / Reassign Executive" },
    { key: "templates", label: "Control Card Templates" },
    { key: "sla", label: "SLA Configuration" },
    { key: "upgrade", label: "Role Upgrades" },
    { key: "settings", label: "Profile Settings" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Manager / Supervisor Portal</h2>
          <p className="text-sm text-slate-500">Executive management, SLA configuration, and template administration</p>
        </div>
        <Badge variant="default" className="text-sm px-3 py-1 bg-mtc-blue-dark text-white border-transparent">Manager / Supervisor</Badge>
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
              <p className="text-sm text-slate-500">{profile?.personId ? `EMP-${profile.personId}` : "—"} · CRM Manager</p>
              <div className="mt-4 w-full space-y-2 text-left text-sm">
                <div className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4 text-mtc-blue" /> {profile?.email || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4 text-mtc-blue" /> {profile?.phone || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Briefcase className="h-4 w-4 text-mtc-blue" /> {profile?.department || "Corporate CRM Division"}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Division Overview</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Executives", value: "24", color: "text-mtc-blue" },
                  { label: "Supervisors", value: "6", color: "text-slate-900" },
                  { label: "Active Corporates", value: "87", color: "text-green-600" },
                  { label: "Monthly Revenue", value: "N$14.2M", color: "text-mtc-blue-dark" },
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

      {/* ASSIGN / REASSIGN EXECUTIVE */}
      {activeTab === "assign" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-mtc-blue" /> Executive-Corporate Assignments</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Current Executive</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right">Reassign</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managerCorporates.map((c) => {
                  const health: "green" | "amber" | "red" =
                    c.approvalStatus === "approved"
                      ? "green"
                      : c.approvalStatus === "rejected"
                      ? "red"
                      : "amber";
                  const currentExecutive = c.executiveFirstName
                    ? `${c.executiveFirstName} ${c.executiveLastName ?? ""}`.trim()
                    : "Not assigned";
                  const supervisor = profile ? `${profile.firstName} ${profile.lastName}` : "—";
                  return (
                    <TableRow key={c.corporateId}>
                      <TableCell className="font-medium text-slate-900">{c.corporateName}</TableCell>
                      <TableCell>{currentExecutive}</TableCell>
                      <TableCell>{supervisor}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${health === "green" ? "bg-green-500" : health === "amber" ? "bg-amber-500" : "bg-red-500"}`} />
                          <span className="text-xs capitalize">{health}</span>
                        </span>
                      </TableCell>
                      <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Select
                          className="w-40 h-8 text-xs"
                          value={c.executiveId ? String(c.executiveId) : ""}
                          disabled={reassigningCorporateId === c.corporateId}
                          onChange={async (e) => {
                            const nextExecutiveId = e.target.value ? parseInt(e.target.value, 10) : 0;
                            if (!nextExecutiveId) return;
                            setReassigningCorporateId(c.corporateId);
                            try {
                              await reassignCorporateExecutive(c.corporateId, nextExecutiveId);
                              setManagerCorporates((prev) =>
                                prev.map((corp) => {
                                  if (corp.corporateId !== c.corporateId) return corp;
                                  const picked = managerExecutives.find((ex) => ex.id === nextExecutiveId);
                                  return {
                                    ...corp,
                                    executiveId: nextExecutiveId,
                                    executiveFirstName: picked?.firstName,
                                    executiveLastName: picked?.lastName,
                                  };
                                })
                              );
                              const picked = managerExecutives.find((ex) => ex.id === nextExecutiveId);
                              toast.success(`${c.corporateName} reassigned to ${picked ? `${picked.firstName} ${picked.lastName}` : "selected executive"}`);
                            } catch (err) {
                              toast.error("Reassignment failed", { description: err instanceof Error ? err.message : undefined });
                            } finally {
                              setReassigningCorporateId(null);
                            }
                          }}
                        >
                          <option value="">Reassign to...</option>
                          {managerExecutives.map((ex) => (
                            <option key={ex.id} value={String(ex.id)}>
                              {ex.firstName} {ex.lastName}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {managerCorporates.length === 0 && (
                  <TableRow>
                    <td colSpan={6} className="text-center text-slate-500 py-6">
                      No corporates assigned to your profile.
                    </td>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* CONTROL CARD TEMPLATE BUILDER */}
      {activeTab === "templates" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5 text-mtc-blue" /> Control Card Template Builder</CardTitle>
            <Button size="sm" variant="outline" onClick={() => {
              setTemplateSections(prev => [...prev, { id: prev.length + 10, name: "New Section", type: "textarea", required: false }]);
              toast.success("Section added");
            }}>
              <Plus className="h-4 w-4 mr-1" /> Add Section
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">Configure the sections and fields that appear on the Account Visit Report (AVR) control card used by Executives.</p>

            <div className="space-y-3">
              {templateSections.map((section, idx) => (
                <div key={section.id} className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
                  <span className="flex items-center justify-center h-7 w-7 rounded-full bg-mtc-blue text-white text-xs font-bold shrink-0">{idx + 1}</span>
                  <div className="flex-1 grid grid-cols-3 gap-3 items-center">
                    <Input className="h-8 text-sm" value={section.name} onChange={(e) => {
                      setTemplateSections(prev => prev.map(s => s.id === section.id ? { ...s, name: e.target.value } : s));
                    }} />
                    <Select className="h-8 text-xs" value={section.type} onChange={(e) => {
                      setTemplateSections(prev => prev.map(s => s.id === section.id ? { ...s, type: e.target.value } : s));
                    }}>
                      <option value="textarea">Text Area</option>
                      <option value="metrics">Metrics Fields</option>
                      <option value="multi-field">Multi-Field</option>
                      <option value="dynamic-table">Dynamic Table</option>
                      <option value="rag-selector">RAG Selector</option>
                      <option value="dropdown">Dropdown</option>
                      <option value="checklist">Checklist</option>
                    </Select>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={section.required} className="h-3.5 w-3.5 rounded border-slate-300 text-mtc-blue focus:ring-mtc-blue"
                          onChange={(e) => setTemplateSections(prev => prev.map(s => s.id === section.id ? { ...s, required: e.target.checked } : s))}
                        /> Required
                      </label>
                      <Button variant="ghost" size="sm" onClick={() => setTemplateSections(prev => prev.filter(s => s.id !== section.id))}>
                        <Trash2 className="h-4 w-4 text-slate-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <Button variant="outline">Preview Template</Button>
              <Button onClick={() => toast.success("Template saved", { description: "Control card template updated. All new visits will use this template." })}>
                Save Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SLA CONFIGURATION */}
      {activeTab === "sla" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5 text-mtc-blue" /> SLA Configuration (per Corporate / Customer Type)</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corporate / Type</TableHead>
                <TableHead>Ticket Type</TableHead>
                <TableHead>Target (Hours)</TableHead>
                <TableHead>Warning At</TableHead>
                <TableHead>At Risk At</TableHead>
                <TableHead>Auto-Escalate</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { corp: "First National Bank", type: "Complaint", target: "8", warn: "4h", risk: "6h", escalate: "L1 → L2 → GM" },
                { corp: "First National Bank", type: "Request", target: "24", warn: "12h", risk: "18h", escalate: "L1 → L2" },
                { corp: "Government (All)", type: "Complaint", target: "12", warn: "6h", risk: "9h", escalate: "L1 → L2 → GM" },
                { corp: "Government (All)", type: "Request", target: "48", warn: "24h", risk: "36h", escalate: "L1" },
                { corp: "Default (Standard)", type: "Complaint", target: "24", warn: "12h", risk: "18h", escalate: "L1 → L2" },
                { corp: "Default (Standard)", type: "Request", target: "48", warn: "24h", risk: "36h", escalate: "L1" },
                { corp: "Critical Outage (Any)", type: "Complaint", target: "4", warn: "2h", risk: "3h", escalate: "L1 → L2 → GM (Immediate)" },
              ].map((sla, i) => (
                <TableRow key={`${sla.corp}-${sla.type}-${i}`}>
                  <TableCell className="font-medium text-slate-900">{sla.corp}</TableCell>
                  <TableCell><Badge variant={sla.type === "Complaint" ? "danger" : "default"}>{sla.type}</Badge></TableCell>
                  <TableCell className="font-bold">{sla.target}h</TableCell>
                  <TableCell>{sla.warn}</TableCell>
                  <TableCell>{sla.risk}</TableCell>
                  <TableCell><span className="text-xs text-slate-600">{sla.escalate}</span></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm"><Edit className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <Button onClick={() => toast.success("SLA configuration saved")}>Save Changes</Button>
          </div>
        </Card>
      )}

      {/* ROLE UPGRADES */}
      {activeTab === "upgrade" && (
        <div className="space-y-6">
          <Card className="bg-mtc-blue-50/30 border-mtc-blue-100">
            <CardContent className="pt-6 flex items-center gap-3">
              <ArrowUp className="h-5 w-5 text-mtc-blue" />
              <p className="text-sm text-mtc-blue-dark">Promote high-performing Executives to Supervisor role. This grants them team oversight, escalation management, and reschedule approval permissions.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Eligible Executives for Promotion</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Tenure</TableHead>
                  <TableHead>Avg Rating</TableHead>
                  <TableHead>SLA Compliance</TableHead>
                  <TableHead>Accounts</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligibleExecutives.map((e) => {
                  const accountsCount = managerCorporates.filter((c) => {
                    const corpExecName = c.executiveFirstName
                      ? `${c.executiveFirstName} ${c.executiveLastName ?? ""}`.trim()
                      : "";
                    return corpExecName.toLowerCase() === `${e.firstName} ${e.lastName}`.toLowerCase();
                  }).length;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium text-slate-900">{e.firstName} {e.lastName}</TableCell>
                      <TableCell><Badge variant="neutral">Executive</Badge></TableCell>
                      <TableCell>—</TableCell>
                      <TableCell><span className="font-bold text-slate-700">—</span></TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>{accountsCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={async () => {
                            setPromotingExecutiveId(e.id);
                            try {
                              await promoteExecutiveToSupervisor(e.id);
                              setManagerExecutives((prev) =>
                                prev.map((x) => (x.id === e.id ? { ...x, type: "supervisor" } : x))
                              );
                              toast.success(`${e.firstName} ${e.lastName} promoted to supervisor`);
                            } catch (err) {
                              toast.error("Promotion failed", { description: err instanceof Error ? err.message : undefined });
                            } finally {
                              setPromotingExecutiveId(null);
                            }
                          }}
                          disabled={promotingExecutiveId === e.id}
                        >
                          <ArrowUp className="h-4 w-4 mr-1" />
                          {promotingExecutiveId === e.id ? "Promoting..." : "Promote"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {eligibleExecutives.length === 0 && (
                  <TableRow>
                    <td colSpan={7} className="text-center text-slate-500 py-6">
                      No executives available for promotion.
                    </td>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Supervisor Groups</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Accounts</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supervisorGroups.map((supervisor) => {
                  const accountsCount = managerCorporates.filter((c) => {
                    const corpExecName = c.executiveFirstName
                      ? `${c.executiveFirstName} ${c.executiveLastName ?? ""}`.trim()
                      : "";
                    return corpExecName.toLowerCase() === `${supervisor.firstName} ${supervisor.lastName}`.toLowerCase();
                  }).length;
                  return (
                    <TableRow key={supervisor.id}>
                      <TableCell className="font-medium text-slate-900">{supervisor.firstName} {supervisor.lastName}</TableCell>
                      <TableCell><Badge variant="default">Supervisor</Badge></TableCell>
                      <TableCell>Shared task coverage</TableCell>
                      <TableCell>{accountsCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            setDemotingSupervisorId(supervisor.id);
                            try {
                              await demoteSupervisorToExecutive(supervisor.id);
                              setManagerExecutives((prev) =>
                                prev.map((x) => (x.id === supervisor.id ? { ...x, type: "executive_staff" } : x))
                              );
                              toast.success(`${supervisor.firstName} ${supervisor.lastName} demoted to executive`);
                            } catch (err) {
                              toast.error("Demotion failed", { description: err instanceof Error ? err.message : undefined });
                            } finally {
                              setDemotingSupervisorId(null);
                            }
                          }}
                          disabled={demotingSupervisorId === supervisor.id}
                        >
                          <ArrowUp className="h-4 w-4 mr-1 rotate-180" />
                          {demotingSupervisorId === supervisor.id ? "Demoting..." : "Demote"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {supervisorGroups.length === 0 && (
                  <TableRow>
                    <td colSpan={5} className="text-center text-slate-500 py-6">
                      No supervisors assigned yet.
                    </td>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* EXECUTIVE PERFORMANCE */}
      {activeTab === "performance" && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Customers Handled", value: "87", sub: "Active corporate accounts", color: "text-mtc-blue" },
              { label: "Issues Resolved (MTD)", value: "142", sub: "+18% vs last month", color: "text-green-600" },
              { label: "Visits Completed (MTD)", value: "63", sub: "74 scheduled this month", color: "text-mtc-blue-dark" },
              { label: "Avg Satisfaction Score", value: "4.1 / 5", sub: "Team average across executives", color: "text-amber-600" },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="pt-5">
                  <p className="text-xs text-slate-500">{m.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{m.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Top Performers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" /> Top Performing Executives
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { rank: 1, name: "Peter Nakale", score: 4.7, visits: "12/12", resolved: 28, response: "1.2h" },
                  { rank: 2, name: "Jane Smith", score: 4.5, visits: "10/11", resolved: 24, response: "1.8h" },
                  { rank: 3, name: "John Doe", score: 4.0, visits: "9/12", resolved: 19, response: "2.1h" },
                ].map((e) => (
                  <div key={e.rank} className="flex items-start gap-3 p-4 rounded-lg border border-slate-100 bg-slate-50">
                    <span className={`flex items-center justify-center h-8 w-8 rounded-full text-white font-bold text-sm shrink-0 ${
                      e.rank === 1 ? "bg-yellow-500" : e.rank === 2 ? "bg-slate-400" : "bg-orange-400"
                    }`}>
                      #{e.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{e.name}</p>
                      <p className={`text-xl font-bold ${
                        e.score >= 4.5 ? "text-green-600" : e.score >= 4.0 ? "text-amber-600" : "text-red-600"
                      }`}>{e.score} ★</p>
                      <p className="text-xs text-slate-500 mt-0.5">Visits: {e.visits} · Issues: {e.resolved} · Resp: {e.response}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Scorecards Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Monthly Performance Scorecards</CardTitle>
              <button
                onClick={() => setActiveTab("assign")}
                className="text-sm text-mtc-blue hover:underline font-medium flex items-center gap-1"
              >
                <ArrowRightLeft className="h-4 w-4" /> Assign Customers
              </button>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executive</TableHead>
                  <TableHead>Visits (Done / Sched)</TableHead>
                  <TableHead>Satisfaction</TableHead>
                  <TableHead>Avg Response</TableHead>
                  <TableHead>Issues Resolved</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { name: "Peter Nakale", done: 12, scheduled: 12, satisfaction: 4.7, response: "1.2h", resolved: 28 },
                  { name: "Jane Smith",   done: 10, scheduled: 11, satisfaction: 4.5, response: "1.8h", resolved: 24 },
                  { name: "John Doe",     done: 9,  scheduled: 12, satisfaction: 4.0, response: "2.1h", resolved: 19 },
                  { name: "Sarah Lee",    done: 7,  scheduled: 10, satisfaction: 3.5, response: "3.4h", resolved: 12 },
                  { name: "Anna Kaufmann",done: 5,  scheduled: 9,  satisfaction: 2.8, response: "5.1h", resolved: 8  },
                ].map((e) => {
                  const ragColor = e.satisfaction >= 4.0 ? "bg-green-500" : e.satisfaction >= 3.0 ? "bg-amber-500" : "bg-red-500";
                  const ragLabel = e.satisfaction >= 4.0 ? "Green" : e.satisfaction >= 3.0 ? "Amber" : "Red";
                  const score = Math.round(
                    (e.satisfaction / 5) * 40 +
                    (e.done / e.scheduled) * 40 +
                    (Math.min(e.resolved, 30) / 30) * 20
                  );
                  return (
                    <TableRow key={e.name}>
                      <TableCell className="font-medium text-slate-900">{e.name}</TableCell>
                      <TableCell>{e.done} / {e.scheduled}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${ragColor}`} />
                          <span className="text-xs">{ragLabel} ({e.satisfaction})</span>
                        </span>
                      </TableCell>
                      <TableCell>{e.response}</TableCell>
                      <TableCell>{e.resolved}</TableCell>
                      <TableCell>
                        <span className={`font-bold ${
                          score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600"
                        }`}>{score}%</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* UPGRADE MODAL */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle className="text-lg">Promote to Supervisor</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowUpgradeModal(false)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-mtc-blue mx-auto flex items-center justify-center text-white text-xl font-bold mb-3">
                  {upgradeTarget.split(" ").map(n => n[0]).join("")}
                </div>
                <h3 className="font-semibold text-slate-900">{upgradeTarget}</h3>
                <p className="text-sm text-slate-500">Executive → Supervisor</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                <strong>Warning:</strong> This action will grant {upgradeTarget} supervisor-level permissions including:
                <ul className="mt-2 space-y-1 text-xs">
                  <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3" /> Reschedule approval authority</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3" /> L1 escalation management</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3" /> Executive performance oversight</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3" /> Team management access</li>
                </ul>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Assign Team <span className="text-red-500">*</span></Label>
                  <Select>
                    <option value="">Select team...</option>
                    <option>Windhoek Central Team</option>
                    <option>Northern Region Team</option>
                    <option>Southern Region Team</option>
                    <option>Coastal Region Team</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Effective Date</Label>
                  <Input type="date" />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowUpgradeModal(false)}>Cancel</Button>
                <Button className="flex-1" onClick={() => { setShowUpgradeModal(false); toast.success(`${upgradeTarget} promoted`, { description: "Role updated to Supervisor. New permissions granted." }); }}>
                  <Shield className="h-4 w-4 mr-1" /> Confirm Promotion
                </Button>
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
