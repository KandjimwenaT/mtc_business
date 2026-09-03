import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../components/ui-components";;
import {
  Mail, Phone, Briefcase, FileText,
  Settings, Plus, Trash2, X, CheckCircle, ArrowUp, Shield, Loader2, UserPlus, Key
} from "lucide-react";
import { getMyProfile } from "../api/authApi";
import type { UserProfile } from "../api/authApi";
import ProfileEditSection from "../components/profile-edit-section";
import AuditLogPanel from "../components/audit-log-panel";
import SlaConfigurationPanel from "../components/sla-configuration-panel";
import { getAllTickets, type TicketRecord } from "../api/ticketApi";
import { getManagerVisits, type VisitRecord } from "../api/visitApi";
import {
  getCorporates,
  getPersonsByType,
  getExecutives,
  createPerson,
  createPortalAccess,
  promoteExecutiveToSupervisor,
  demoteSupervisorToExecutive,
  type CorporateRecord,
  type PersonRecord,
  type ExecutiveRecord,
} from "../api/adminApi";

type Tab = "profile" | "performance" | "templates" | "sla" | "upgrade" | "audit" | "settings";

function monthKey(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 7);
}

function visitExecutedWithReport(v: Pick<VisitRecord, "status">) {
  return v.status === "completed" || v.status === "follow_up_pending";
}

function formatTrend(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "New this period" : "No prior data";
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}% vs last month`;
}

function avgResponseHours(tickets: TicketRecord[]): number | null {
  const resolved = tickets.filter(
    (t) => ["resolved", "closed"].includes(t.status) && t.resolvedAt
  );
  if (!resolved.length) return null;
  const totalMs = resolved.reduce(
    (sum, t) => sum + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()),
    0
  );
  return totalMs / resolved.length / (1000 * 60 * 60);
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

function computePerformanceScore(
  satisfaction: number | null,
  done: number,
  scheduled: number,
  resolved: number
): number {
  const satScore = satisfaction != null ? (satisfaction / 5) * 40 : 0;
  const visitScore =
    scheduled > 0 ? (done / scheduled) * 40 : done > 0 ? 40 : 0;
  const resolveScore = (Math.min(resolved, 30) / 30) * 20;
  return Math.round(satScore + visitScore + resolveScore);
}

type ExecutiveScorecard = {
  executiveId: number;
  name: string;
  done: number;
  scheduled: number;
  satisfaction: number | null;
  avgResponse: string;
  resolved: number;
  score: number;
};

export default function ManagementProfile() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [managerCorporates, setManagerCorporates] = useState<CorporateRecord[]>([]);
  const [managerExecutives, setManagerExecutives] = useState<PersonRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [executiveProfiles, setExecutiveProfiles] = useState<ExecutiveRecord[]>([]);
  const [teamDataLoading, setTeamDataLoading] = useState(false);
  const [promotingExecutiveId, setPromotingExecutiveId] = useState<number | null>(null);
  const [demotingSupervisorId, setDemotingSupervisorId] = useState<number | null>(null);
  const [createExecutiveForm, setCreateExecutiveForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    region: "",
  });
  const [showCreateExecutiveConfirm, setShowCreateExecutiveConfirm] = useState(false);
  const [creatingExecutive, setCreatingExecutive] = useState(false);

  const isManagerOrSupervisor =
    profile?.role === "manager" || profile?.role === "supervisor";

  const loadManagerTeamData = async (currentProfile: UserProfile) => {
    setTeamDataLoading(true);
    try {
      const [allCorporates, allExecutives, allSupervisors, ticketsRes, visitsRes, execProfilesRes] =
        await Promise.all([
          getCorporates(),
          getPersonsByType("executive_staff"),
          getPersonsByType("supervisor"),
          getAllTickets().catch(() => [] as TicketRecord[]),
          getManagerVisits().catch(() => [] as VisitRecord[]),
          getExecutives().catch(() => [] as ExecutiveRecord[]),
        ]);

      const corporatesForManager = allCorporates.filter(
        (c) =>
          c.managerId === currentProfile.roleProfileId ||
          c.managerId === currentProfile.personId
      );
      const executivesForManager = [...allExecutives, ...allSupervisors].filter(
        (e) =>
          e.managerId === currentProfile.roleProfileId ||
          e.managerId === currentProfile.personId
      );

      setManagerCorporates(corporatesForManager);
      setManagerExecutives(executivesForManager);
      setTickets(ticketsRes);
      setVisits(visitsRes);
      setExecutiveProfiles(execProfilesRes);
    } finally {
      setTeamDataLoading(false);
    }
  };

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  useEffect(() => {
    if (!profile || !isManagerOrSupervisor) return;

    loadManagerTeamData(profile).catch(() => toast.error("Failed to load team data"));
  }, [profile, isManagerOrSupervisor]);

  const resetCreateExecutiveForm = () => {
    setCreateExecutiveForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      region: "",
    });
  };

  const handleCreateExecutiveSubmit = () => {
    const firstName = createExecutiveForm.firstName.trim();
    const lastName = createExecutiveForm.lastName.trim();
    const email = createExecutiveForm.email.trim();

    if (!firstName || !lastName || !email) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (!profile?.personId) {
      toast.error("Your manager profile is not fully set up. Please contact an administrator.");
      return;
    }

    setCreateExecutiveForm((f) => ({ ...f, firstName, lastName, email }));
    setShowCreateExecutiveConfirm(true);
  };

  const handleConfirmCreateExecutive = async () => {
    if (!profile?.personId) return;

    const firstName = createExecutiveForm.firstName.trim();
    const lastName = createExecutiveForm.lastName.trim();
    const email = createExecutiveForm.email.trim();
    const phone = createExecutiveForm.phone.trim();

    setCreatingExecutive(true);
    try {
      const createResponse = await createPerson({
        firstName,
        lastName,
        email,
        phone: phone || undefined,
        type: "executive_staff",
        region: createExecutiveForm.region || undefined,
        managerId: profile.personId,
      });

      if (!createResponse.person?.id) {
        throw new Error("Executive record was created but no person ID was returned");
      }

      const response = await createPortalAccess(createResponse.person.id, "executive_staff");
      const emailSent = response.emailSent !== false;
      const tempPassword = (response.user as { password?: string } | undefined)?.password;

      toast.success("Executive created", {
        description: emailSent
          ? `Account details sent to ${email}`
          : `Email delivery failed.${tempPassword ? ` Temp password: ${tempPassword}` : ""}`,
      });

      setShowCreateExecutiveConfirm(false);
      resetCreateExecutiveForm();
      await loadManagerTeamData(profile);
    } catch (err: unknown) {
      toast.error("Failed to create executive", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreatingExecutive(false);
    }
  };

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "..";
  const eligibleExecutives = managerExecutives.filter((person) => person.type !== "supervisor");
  const supervisorGroups = managerExecutives.filter((person) => person.type === "supervisor");

  const performanceData = useMemo(() => {
    const managerProfileId = profile?.roleProfileId ?? null;
    if (managerProfileId == null) {
      return {
        summary: {
          customersHandled: 0,
          issuesResolvedMtd: 0,
          issuesResolvedTrend: "No prior data",
          visitsCompletedMtd: 0,
          visitsScheduledMtd: 0,
          avgSatisfaction: null as number | null,
        },
        scorecards: [] as ExecutiveScorecard[],
        topPerformers: [] as ExecutiveScorecard[],
      };
    }

    const teamExecs = executiveProfiles.filter((e) => e.managerId === managerProfileId);
    const teamExecIds = new Set(teamExecs.map((e) => e.executiveId));
    const scopedTickets = tickets.filter(
      (t) => t.executiveId != null && teamExecIds.has(t.executiveId)
    );
    const scopedVisits = visits;

    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const isResolvedInMonth = (t: TicketRecord, key: string) => {
      if (!["resolved", "closed"].includes(t.status)) return false;
      const ts = t.resolvedAt || t.updatedAt || t.createdAt;
      return monthKey(ts) === key;
    };

    const issuesResolvedMtd = scopedTickets.filter((t) => isResolvedInMonth(t, thisMonthKey)).length;
    const issuesResolvedLastMonth = scopedTickets.filter((t) => isResolvedInMonth(t, lastMonthKey)).length;

    const visitsCompletedMtd = scopedVisits.filter(
      (v) => visitExecutedWithReport(v) && monthKey(v.visitDate) === thisMonthKey
    ).length;
    const visitsScheduledMtd = scopedVisits.filter(
      (v) => monthKey(v.visitDate) === thisMonthKey
    ).length;

    const ratedMtd = scopedVisits.filter(
      (v) => typeof v.customerRating === "number" && monthKey(v.visitDate) === thisMonthKey
    );
    const avgSatisfaction = ratedMtd.length
      ? Math.round(
          (ratedMtd.reduce((s, v) => s + Number(v.customerRating), 0) / ratedMtd.length) * 10
        ) / 10
      : null;

    const scorecards: ExecutiveScorecard[] = teamExecs.map((ex) => {
      const exTickets = scopedTickets.filter((t) => t.executiveId === ex.executiveId);
      const exVisits = scopedVisits.filter((v) => v.executiveId === ex.executiveId);
      const exTicketsMtd = exTickets.filter((t) => monthKey(t.createdAt) === thisMonthKey);
      const exVisitsMtd = exVisits.filter((v) => monthKey(v.visitDate) === thisMonthKey);

      const done = exVisitsMtd.filter((v) => visitExecutedWithReport(v)).length;
      const scheduled = exVisitsMtd.length;
      const rated = exVisitsMtd.filter((v) => typeof v.customerRating === "number");
      const satisfaction = rated.length
        ? Math.round(
            (rated.reduce((s, v) => s + Number(v.customerRating), 0) / rated.length) * 10
          ) / 10
        : null;
      const resolved = exTicketsMtd.filter((t) => ["resolved", "closed"].includes(t.status)).length;
      const responseHours = avgResponseHours(
        exTicketsMtd.filter((t) => ["resolved", "closed"].includes(t.status))
      );

      return {
        executiveId: ex.executiveId,
        name: `${ex.firstName} ${ex.lastName}`,
        done,
        scheduled,
        satisfaction,
        avgResponse: formatHours(responseHours),
        resolved,
        score: computePerformanceScore(satisfaction, done, scheduled, resolved),
      };
    });

    const topPerformers = [...scorecards]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.satisfaction ?? 0) - (a.satisfaction ?? 0);
      })
      .slice(0, 3);

    return {
      summary: {
        customersHandled: managerCorporates.length,
        issuesResolvedMtd,
        issuesResolvedTrend: formatTrend(issuesResolvedMtd, issuesResolvedLastMonth),
        visitsCompletedMtd,
        visitsScheduledMtd,
        avgSatisfaction,
      },
      scorecards: scorecards.sort((a, b) => a.name.localeCompare(b.name)),
      topPerformers,
    };
  }, [profile, tickets, visits, executiveProfiles, managerCorporates]);

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
    { key: "templates", label: "Control Card Templates" },
    { key: "sla", label: "SLA Configuration" },
    { key: "upgrade", label: "Role Upgrades" },
    { key: "audit", label: "Audit Log" },
    { key: "settings", label: "Profile Settings" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Manager / Supervisor Portal</h2>
          <p className="text-sm text-slate-500">Executive management, SLA configuration, and template administration</p>
        </div>
        <Badge variant="default" className="text-sm px-3 py-1 bg-mtc-blue-dark text-white border-transparent w-fit">Manager / Supervisor</Badge>
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
        <div className="space-y-6">
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
                    { label: "Total Executives", value: String(eligibleExecutives.length), color: "text-mtc-blue" },
                    { label: "Supervisors", value: String(supervisorGroups.length), color: "text-slate-900" },
                    { label: "Active Corporates", value: String(managerCorporates.length), color: "text-green-600" },
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

          {isManagerOrSupervisor && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-mtc-blue" /> Create Executive
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Add a new executive to your department. Portal credentials will be emailed after you confirm the details.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label>First Name <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="First name"
                      value={createExecutiveForm.firstName}
                      onChange={(e) => setCreateExecutiveForm((f) => ({ ...f, firstName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="Last name"
                      value={createExecutiveForm.lastName}
                      onChange={(e) => setCreateExecutiveForm((f) => ({ ...f, lastName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email <span className="text-red-500">*</span></Label>
                    <Input
                      type="email"
                      placeholder="name@mtc.com.na"
                      value={createExecutiveForm.email}
                      onChange={(e) => setCreateExecutiveForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      placeholder="+264 ..."
                      value={createExecutiveForm.phone}
                      onChange={(e) => setCreateExecutiveForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Select
                      value={createExecutiveForm.region}
                      onChange={(e) => setCreateExecutiveForm((f) => ({ ...f, region: e.target.value }))}
                    >
                      <option value="">Select Region...</option>
                      <option value="Windhoek Central">Windhoek Central</option>
                      <option value="Northern Region">Northern Region</option>
                      <option value="Southern Region">Southern Region</option>
                      <option value="Coastal Region">Coastal Region</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Reports to Manager</Label>
                    <Input value={displayName} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Input value={profile?.department || "—"} readOnly />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                  <Button variant="outline" onClick={resetCreateExecutiveForm}>Reset</Button>
                  <Button onClick={handleCreateExecutiveSubmit}>
                    <UserPlus className="h-4 w-4 mr-1" /> Submit
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* CONTROL CARD TEMPLATE BUILDER */}
      {activeTab === "templates" && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5 text-mtc-blue" /> Control Card Template Builder</CardTitle>
            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => {
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
                <div key={section.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
                  <span className="flex items-center justify-center h-7 w-7 rounded-full bg-mtc-blue text-white text-xs font-bold shrink-0">{idx + 1}</span>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-center">
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

      {activeTab === "sla" && <SlaConfigurationPanel />}

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
          {teamDataLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
              <p className="text-sm">Loading executive performance…</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "Total Customers Handled",
                    value: String(performanceData.summary.customersHandled),
                    sub: "Active corporate accounts",
                    color: "text-mtc-blue",
                  },
                  {
                    label: "Issues Resolved (MTD)",
                    value: String(performanceData.summary.issuesResolvedMtd),
                    sub: performanceData.summary.issuesResolvedTrend,
                    color: "text-green-600",
                  },
                  {
                    label: "Visits Completed (MTD)",
                    value: String(performanceData.summary.visitsCompletedMtd),
                    sub: `${performanceData.summary.visitsScheduledMtd} scheduled this month`,
                    color: "text-mtc-blue-dark",
                  },
                  {
                    label: "Avg Satisfaction Score",
                    value:
                      performanceData.summary.avgSatisfaction != null
                        ? `${performanceData.summary.avgSatisfaction} / 5`
                        : "—",
                    sub: "Team average from visit ratings (MTD)",
                    color: "text-amber-600",
                  },
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" /> Top Performing Executives
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {performanceData.topPerformers.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">
                      No executive performance data yet for this month.
                    </p>
                  ) : (
                    <div className="grid md:grid-cols-3 gap-4">
                      {performanceData.topPerformers.map((e, index) => {
                        const rank = index + 1;
                        const sat = e.satisfaction ?? 0;
                        return (
                          <div
                            key={e.executiveId}
                            className="flex items-start gap-3 p-4 rounded-lg border border-slate-100 bg-slate-50"
                          >
                            <span
                              className={`flex items-center justify-center h-8 w-8 rounded-full text-white font-bold text-sm shrink-0 ${
                                rank === 1
                                  ? "bg-yellow-500"
                                  : rank === 2
                                  ? "bg-slate-400"
                                  : "bg-orange-400"
                              }`}
                            >
                              #{rank}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-900 text-sm">{e.name}</p>
                              <p
                                className={`text-xl font-bold ${
                                  sat >= 4.5
                                    ? "text-green-600"
                                    : sat >= 4.0
                                    ? "text-amber-600"
                                    : sat > 0
                                    ? "text-red-600"
                                    : "text-slate-400"
                                }`}
                              >
                                {e.satisfaction != null ? `${e.satisfaction} ★` : "No ratings"}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Visits: {e.done}/{e.scheduled} · Issues: {e.resolved} · Resp: {e.avgResponse}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Monthly Performance Scorecards</CardTitle>
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
                    {performanceData.scorecards.map((e) => {
                      const sat = e.satisfaction;
                      const ragColor =
                        sat == null
                          ? "bg-slate-300"
                          : sat >= 4.0
                          ? "bg-green-500"
                          : sat >= 3.0
                          ? "bg-amber-500"
                          : "bg-red-500";
                      const ragLabel =
                        sat == null
                          ? "No ratings"
                          : sat >= 4.0
                          ? "Green"
                          : sat >= 3.0
                          ? "Amber"
                          : "Red";
                      return (
                        <TableRow key={e.executiveId}>
                          <TableCell className="font-medium text-slate-900">{e.name}</TableCell>
                          <TableCell>
                            {e.done} / {e.scheduled}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-2.5 w-2.5 rounded-full ${ragColor}`} />
                              <span className="text-xs">
                                {sat != null ? `${ragLabel} (${sat})` : ragLabel}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell>{e.avgResponse}</TableCell>
                          <TableCell>{e.resolved}</TableCell>
                          <TableCell>
                            <span
                              className={`font-bold ${
                                e.score >= 80
                                  ? "text-green-600"
                                  : e.score >= 60
                                  ? "text-amber-600"
                                  : "text-red-600"
                              }`}
                            >
                              {e.score}%
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {performanceData.scorecards.length === 0 && (
                      <TableRow>
                        <td colSpan={6} className="text-center text-slate-500 py-6">
                          No executives on your team yet.
                        </td>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </div>
      )}

      {/* CREATE EXECUTIVE CONFIRMATION MODAL */}
      {showCreateExecutiveConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle className="text-lg">Confirm Executive Details</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                disabled={creatingExecutive}
                onClick={() => setShowCreateExecutiveConfirm(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <p className="text-sm text-slate-600">
                Review the details below. A one-time password will be generated and emailed to the executive. They must change it on first login.
              </p>
              <div className="space-y-3 text-sm">
                {[
                  { label: "Full Name", value: `${createExecutiveForm.firstName.trim()} ${createExecutiveForm.lastName.trim()}` },
                  { label: "Email", value: createExecutiveForm.email.trim() },
                  { label: "Phone", value: createExecutiveForm.phone.trim() || "—" },
                  { label: "Region", value: createExecutiveForm.region || "—" },
                  { label: "Reports to Manager", value: displayName },
                  { label: "Department", value: profile?.department || "—" },
                  { label: "Role", value: "Executive Staff" },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                    <span className="text-slate-500 shrink-0">{row.label}</span>
                    <span className="font-medium text-slate-900 text-right">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={creatingExecutive}
                  onClick={() => setShowCreateExecutiveConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={creatingExecutive}
                  onClick={handleConfirmCreateExecutive}
                >
                  {creatingExecutive ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
                  ) : (
                    <><Key className="h-4 w-4 mr-1" /> Confirm and Generate Credentials</>
                  )}
                </Button>
              </div>
            </CardContent>
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

      {activeTab === "audit" && <AuditLogPanel />}

      {/* PROFILE SETTINGS */}
      {activeTab === "settings" && profile && (
        <ProfileEditSection profile={profile} onProfileUpdated={(updated) => setProfile(updated)} />
      )}
    </div>
  );
}
