import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../components/ui-components";
import { Progress } from "../components/ui/progress";
import {
  Mail, Phone, Briefcase, FileText,
  Settings, Plus, Trash2, X, CheckCircle, ArrowUp, Shield, Loader2, UserPlus, Key,
  Search, RefreshCw, Users, Pencil, UserCheck, Upload, FileSpreadsheet
} from "lucide-react";
import { getActualRole, getMyProfile } from "../api/authApi";
import { normalizeDepartmentSegment } from "../utils/departmentSegment";
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
  getPortalUsers,
  updateManagedPortalUser,
  deleteManagedPortalUser,
  promoteExecutiveToSupervisor,
  demoteSupervisorToExecutive,
  getPendingImportedExecutives,
  completeImportedExecutive,
  importKeyAccountsFromExcel,
  importEbuFromExcel,
  type CorporateRecord,
  type PersonRecord,
  type ExecutiveRecord,
  type PortalUser,
  type PendingImportedExecutive,
} from "../api/adminApi";

type Tab = "profile" | "users" | "pendingExecutives" | "performance" | "templates" | "sla" | "upgrade" | "audit" | "settings";

const PORTAL_ROLE_LABELS: Record<string, string> = {
  customer: "Account Manager",
  executive_staff: "Executive",
  supervisor: "Supervisor",
  admin: "Admin",
  manager: "Manager",
  gm: "GM",
  super_admin: "Super Admin",
};

const EDITABLE_PORTAL_ROLES = [
  { value: "executive_staff", label: "Executive" },
  { value: "supervisor", label: "Supervisor" },
  { value: "admin", label: "Admin" },
];

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
    kind: "executive_staff" as "executive_staff" | "supervisor" | "customer" | "admin",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    region: "",
    corporateId: "",
  });
  const [showCreateExecutiveConfirm, setShowCreateExecutiveConfirm] = useState(false);
  const [creatingExecutive, setCreatingExecutive] = useState(false);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [loadingPortalUsers, setLoadingPortalUsers] = useState(false);
  const [searchUsers, setSearchUsers] = useState("");
  const [editingPortalUser, setEditingPortalUser] = useState<PortalUser | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editPortalAccess, setEditPortalAccess] = useState<"active" | "revoked">("active");
  const [savingPortalUser, setSavingPortalUser] = useState(false);
  const [deletingPortalUser, setDeletingPortalUser] = useState(false);
  const [pendingExecutives, setPendingExecutives] = useState<PendingImportedExecutive[]>([]);
  const [loadingPendingExecutives, setLoadingPendingExecutives] = useState(false);
  const [onboardedExecutives, setOnboardedExecutives] = useState<ExecutiveRecord[]>([]);
  const [selectedPendingExec, setSelectedPendingExec] = useState<PendingImportedExecutive | null>(null);
  const [onboardingForm, setOnboardingForm] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    existingExecutiveId: number | undefined;
  }>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    existingExecutiveId: undefined,
  });
  const [onboardingMode, setOnboardingMode] = useState<"new" | "existing">("new");
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);
  const [importDragging, setImportDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    percent: number;
    processedRows: number;
    totalRows: number;
    status: "pending" | "running" | "completed" | "failed";
  } | null>(null);
  const [importSheetName, setImportSheetName] = useState("");
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const isManagerOrSupervisor =
    profile?.role === "manager" || profile?.role === "supervisor";
  const previewingAsSuperAdmin = getActualRole() === "super_admin";
  const canManagePortalUsers = profile?.role === "manager" && !previewingAsSuperAdmin;

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

      const seesAll = getActualRole() === "super_admin";
      const corporatesForManager = seesAll
        ? allCorporates
        : allCorporates.filter(
            (c) =>
              c.managerId === currentProfile.roleProfileId ||
              c.managerId === currentProfile.personId
          );
      const executivesForManager = seesAll
        ? [...allExecutives, ...allSupervisors]
        : [...allExecutives, ...allSupervisors].filter(
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

  const loadPortalUsers = async () => {
    setLoadingPortalUsers(true);
    try {
      setPortalUsers(await getPortalUsers());
    } catch (err: unknown) {
      toast.error("Failed to load portal users", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoadingPortalUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "users" || !canManagePortalUsers) return;
    loadPortalUsers().catch(() => {});
  }, [activeTab, canManagePortalUsers]);

  const loadPendingExecutives = async () => {
    setLoadingPendingExecutives(true);
    try {
      const [pending, executives] = await Promise.all([
        getPendingImportedExecutives(),
        getExecutives().catch(() => [] as ExecutiveRecord[]),
      ]);
      setPendingExecutives(pending);
      setOnboardedExecutives(executives.filter((exec) => exec.userId));
    } catch (err: unknown) {
      toast.error("Failed to load pending executives", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoadingPendingExecutives(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "pendingExecutives" || !canManagePortalUsers) return;
    loadPendingExecutives().catch(() => {});
  }, [activeTab, canManagePortalUsers]);

  useEffect(() => {
    if (normalizeDepartmentSegment(profile?.department) !== "EBU") return;
    setImportSheetName((current) => (current.trim() === "" ? "Update " : current));
  }, [profile?.department]);

  const openOnboardPendingExec = (exec: PendingImportedExecutive) => {
    setSelectedPendingExec(exec);
    setOnboardingForm({
      firstName: exec.firstName ?? "",
      lastName: exec.lastName ?? "",
      email: "",
      phone: exec.phone ?? "",
      existingExecutiveId: undefined,
    });
    setOnboardingMode("new");
  };

  const closeOnboardPendingExec = () => {
    if (submittingOnboarding) return;
    setSelectedPendingExec(null);
    setOnboardingForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      existingExecutiveId: undefined,
    });
    setOnboardingMode("new");
  };

  const handleCompletePendingExec = async () => {
    if (!selectedPendingExec || !profile) return;
    setSubmittingOnboarding(true);
    try {
      if (onboardingMode === "existing") {
        if (!onboardingForm.existingExecutiveId) {
          toast.error("Please select an existing executive");
          return;
        }
        await completeImportedExecutive(selectedPendingExec.executiveId, {
          existingExecutiveId: onboardingForm.existingExecutiveId,
        });
        toast.success("Executive reassigned", {
          description: "Linked corporates and accounts were moved to the selected executive.",
        });
      } else {
        const firstName = onboardingForm.firstName.trim();
        const lastName = onboardingForm.lastName.trim();
        const email = onboardingForm.email.trim();
        if (!firstName || !lastName) {
          toast.error("Please provide first and last name");
          return;
        }
        if (!email) {
          toast.error("Please provide an email address");
          return;
        }
        if (!profile.personId) {
          toast.error("Your manager profile is not linked to a directory record");
          return;
        }
        const response = await completeImportedExecutive(selectedPendingExec.executiveId, {
          firstName,
          lastName,
          email,
          phone: onboardingForm.phone.trim() || undefined,
          managerPersonId: profile.personId,
        });
        const emailSent = response.emailSent !== false;
        toast.success("Executive onboarded", {
          description: emailSent
            ? `Credentials sent to ${email}`
            : "Email failed to send password",
        });
      }
      setSelectedPendingExec(null);
      setOnboardingForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        existingExecutiveId: undefined,
      });
      setOnboardingMode("new");
      await Promise.all([
        loadPendingExecutives(),
        loadManagerTeamData(profile).catch(() => {}),
      ]);
    } catch (err: unknown) {
      toast.error("Failed to onboard executive", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmittingOnboarding(false);
    }
  };

  const filteredPortalUsers = portalUsers.filter((user) => {
    const query = searchUsers.trim().toLowerCase();
    if (!query) return true;
    const roleLabel = PORTAL_ROLE_LABELS[user.role] || user.role;
    return [user.firstName, user.lastName, user.email, user.department, roleLabel]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const openPortalUserEditor = (user: PortalUser) => {
    setEditingPortalUser(user);
    setEditRole(user.role);
    setEditPortalAccess("active");
  };

  const handleSavePortalUser = async () => {
    if (!editingPortalUser) return;
    const removingAccess = editPortalAccess === "revoked";
    const roleChanged = editRole !== editingPortalUser.role;
    if (!removingAccess && !roleChanged) {
      setEditingPortalUser(null);
      return;
    }
    if (removingAccess) {
      const confirmed = window.confirm(
        `Remove portal access for ${editingPortalUser.firstName} ${editingPortalUser.lastName}? Their profile will be kept, and they will not be able to sign in.`
      );
      if (!confirmed) return;
    }

    setSavingPortalUser(true);
    try {
      await updateManagedPortalUser(
        editingPortalUser.id,
        removingAccess ? { portalAccess: false } : { role: editRole }
      );
      toast.success(removingAccess ? "Portal access revoked" : "Role updated", {
        description: removingAccess
          ? `${editingPortalUser.firstName} ${editingPortalUser.lastName} can no longer log in`
          : `${editingPortalUser.firstName} ${editingPortalUser.lastName} is now ${PORTAL_ROLE_LABELS[editRole] || editRole}`,
      });
      setEditingPortalUser(null);
      await loadPortalUsers();
    } catch (err: unknown) {
      toast.error(removingAccess ? "Failed to revoke access" : "Failed to update role", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingPortalUser(false);
    }
  };

  const handleDeletePortalUser = async () => {
    if (!editingPortalUser) return;
    const confirmed = window.confirm(
      `Delete ${editingPortalUser.firstName} ${editingPortalUser.lastName}? This removes their login and their profile. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingPortalUser(true);
    try {
      await deleteManagedPortalUser(editingPortalUser.id);
      toast.success("User deleted", {
        description: `${editingPortalUser.firstName} ${editingPortalUser.lastName} has been removed`,
      });
      setEditingPortalUser(null);
      await loadPortalUsers();
    } catch (err: unknown) {
      toast.error("Failed to delete user", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeletingPortalUser(false);
    }
  };

  const resetCreateExecutiveForm = () => {
    setCreateExecutiveForm({
      kind: "executive_staff",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      region: "",
      corporateId: "",
    });
  };

  const portalUserLabel =
    createExecutiveForm.kind === "supervisor"
      ? "Supervisor"
      : createExecutiveForm.kind === "customer"
        ? "Account Manager"
        : createExecutiveForm.kind === "admin"
          ? "Admin"
          : "Executive";

  const handleCreateExecutiveSubmit = () => {
    const firstName = createExecutiveForm.firstName.trim();
    const lastName = createExecutiveForm.lastName.trim();
    const email = createExecutiveForm.email.trim();

    if (!firstName || !lastName || !email) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (createExecutiveForm.kind === "customer" && (!createExecutiveForm.corporateId || !createExecutiveForm.phone.trim())) {
      toast.error("Choose a corporate and enter a phone number for the account manager");
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
        type: createExecutiveForm.kind,
        region: createExecutiveForm.kind === "customer" ? undefined : createExecutiveForm.region || undefined,
        corporateId: createExecutiveForm.kind === "customer" ? Number(createExecutiveForm.corporateId) : undefined,
        managerId: profile.personId,
      });

      if (!createResponse.person?.id) {
        throw new Error("User record was created but no person ID was returned");
      }

      const response = await createPortalAccess(createResponse.person.id, createExecutiveForm.kind);
      const emailSent = response.emailSent !== false;

      toast.success(`${portalUserLabel} created`, {
        description: emailSent
          ? `Account details sent to ${email}`
          : "Email failed to send password",
      });

      setShowCreateExecutiveConfirm(false);
      resetCreateExecutiveForm();
      await loadManagerTeamData(profile);
    } catch (err: unknown) {
      toast.error(`Failed to create ${portalUserLabel.toLowerCase()}`, {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreatingExecutive(false);
    }
  };

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const importSegment = normalizeDepartmentSegment(profile?.department);

  const runCorporateImport = async (file: File | null | undefined) => {
    if (!file || !profile) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please upload an Excel .xlsx file");
      return;
    }
    if (importSegment !== "EBU" && importSegment !== "Key Accounts") {
      toast.error("Set your department to Key Accounts or EBU before importing");
      return;
    }
    if (profile.roleProfileId == null) {
      toast.error("Your manager profile is not linked to a portal record");
      return;
    }

    setImporting(true);
    setImportProgress({
      percent: 0,
      processedRows: 0,
      totalRows: 0,
      status: "pending",
    });
    try {
      const options = {
        sheet: importSheetName.trim() || undefined,
        assignedManagerProfileId: profile.roleProfileId,
      };
      const result = importSegment === "EBU"
        ? await importEbuFromExcel(file, options, (progress) => setImportProgress(progress))
        : await importKeyAccountsFromExcel(file, options, (progress) => setImportProgress(progress));
      setImportProgress({
        percent: 100,
        processedRows: result.stats.totalRows,
        totalRows: result.stats.totalRows,
        status: "completed",
      });
      const stats = result.stats;
      toast.success(importSegment === "EBU" ? "EBU import completed" : "Key accounts import completed", {
        description: `Sheet “${result.sheetName}”: corporates created ${stats.created}, updated ${stats.updated}; accounts +${stats.accountsCreated} / ~${stats.accountsUpdated}; services +${stats.servicesCreated}. New placeholder executives: ${result.createdExecutivesCount}.`,
      });
      if (result.unresolvedTotal > 0) {
        toast.message(
          importSegment === "EBU"
            ? `${result.unresolvedTotal} row(s) had no matching CSE`
            : `${result.unresolvedTotal} row(s) had no matching executive`,
          {
            description: importSegment === "EBU"
              ? "Those rows were imported with you as the owner. Add the executive later or correct the CSE Name in the file."
              : "Those rows were skipped. Add executives in the system or use consistent account-manager names in the file.",
          }
        );
      }
      await Promise.all([
        loadPendingExecutives(),
        loadManagerTeamData(profile).catch(() => {}),
      ]);
      setTimeout(() => setImportProgress(null), 4000);
    } catch (err: unknown) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : undefined });
      setImportProgress(null);
    } finally {
      setImporting(false);
    }
  };
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
    ...(canManagePortalUsers ? [{ key: "users" as const, label: "User Management" }] : []),
    ...(canManagePortalUsers
      ? [{ key: "pendingExecutives" as const, label: "Pending Imported Executives" }]
      : []),
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
          <h2 className="text-3xl font-normal text-slate-800">Manager / Supervisor Portal</h2>
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

          {isManagerOrSupervisor && previewingAsSuperAdmin && (
            <p className="text-sm text-slate-500">
              This is the manager screen with every department’s data. Portal users are still created from a manager or supervisor account.
            </p>
          )}

          {isManagerOrSupervisor && !previewingAsSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-mtc-blue" /> Create Portal User
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Add an executive, supervisor, account manager, or admin in your department. Portal credentials are emailed after you confirm.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Portal user <span className="text-red-500">*</span></Label>
                    <Select
                      value={createExecutiveForm.kind}
                      onChange={(e) => setCreateExecutiveForm((f) => ({
                        ...f,
                        kind: e.target.value as "executive_staff" | "supervisor" | "customer" | "admin",
                        corporateId: "",
                      }))}
                    >
                      <option value="executive_staff">Executive</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="customer">Account Manager</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </div>
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
                    <Label>Phone{createExecutiveForm.kind === "customer" ? <span className="text-red-500"> *</span> : null}</Label>
                    <Input
                      placeholder="+264 ..."
                      value={createExecutiveForm.phone}
                      onChange={(e) => setCreateExecutiveForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  {createExecutiveForm.kind !== "customer" && createExecutiveForm.kind !== "admin" && (
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
                  )}
                  {createExecutiveForm.kind === "customer" && (
                  <div className="space-y-2">
                    <Label>Corporate <span className="text-red-500">*</span></Label>
                    <Select
                      value={createExecutiveForm.corporateId}
                      onChange={(e) => setCreateExecutiveForm((f) => ({ ...f, corporateId: e.target.value }))}
                    >
                      <option value="">Select corporate...</option>
                      {managerCorporates.map((corporate) => (
                        <option key={corporate.corporateId} value={corporate.corporateId}>
                          {corporate.corporateName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  )}
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

      {activeTab === "users" && canManagePortalUsers && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5 text-mtc-blue" /> Portal Users
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Executives, supervisors, account managers, and admins in your department who can sign in.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  className="pl-9 w-full sm:w-56 h-9 text-sm"
                  placeholder="Search portal users..."
                  value={searchUsers}
                  onChange={(e) => setSearchUsers(e.target.value)}
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => loadPortalUsers()} disabled={loadingPortalUsers} className="w-full sm:w-auto">
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingPortalUsers ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingPortalUsers ? (
                <TableRow>
                  <td colSpan={6} className="text-center py-8 text-slate-500 px-4">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading...
                  </td>
                </TableRow>
              ) : filteredPortalUsers.length === 0 ? (
                <TableRow>
                  <td colSpan={6} className="text-center py-8 text-slate-400 px-4">No portal users found</td>
                </TableRow>
              ) : filteredPortalUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium text-slate-900">{user.firstName} {user.lastName}</TableCell>
                  <TableCell className="text-sm">{user.email}</TableCell>
                  <TableCell><Badge variant="default">{PORTAL_ROLE_LABELS[user.role] || user.role}</Badge></TableCell>
                  <TableCell className="text-sm text-slate-600">{user.department || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-500">{user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Edit role and portal access"
                      onClick={() => openPortalUserEditor(user)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {activeTab === "pendingExecutives" && canManagePortalUsers && (
        <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-mtc-blue" />
              {importSegment === "EBU"
                ? "Import EBU corporates from Excel"
                : "Import key accounts from Excel"}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              {importSegment === "EBU" ? (
                <>
                  Upload the EBU customer list (.xlsx). Each row becomes a service under an account scoped to its site.
                  Corporates are created or updated as type <span className="font-mono">ebu</span> and linked to you.
                  Rows missing a CSE Name are imported with you as the owner.
                </>
              ) : importSegment === "Key Accounts" ? (
                <>
                  Upload the same .xlsx format as the super admin import. This creates or updates key-account corporates,
                  linked customer accounts, services, and contracts, all assigned to you. Missing account managers become
                  placeholder executives — complete onboarding for them in the table below.
                </>
              ) : (
                <>Your department needs to be Key Accounts or EBU before you can import corporates.</>
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 max-w-3xl">
              <div className="space-y-2">
                <Label>Linked manager</Label>
                <Input value={displayName} readOnly />
                <p className="text-xs text-slate-500">
                  Every imported corporate, account, and placeholder executive is linked to you.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-import-sheet">Sheet name (optional)</Label>
                <Input
                  id="manager-import-sheet"
                  placeholder="Leave blank to use the first sheet"
                  value={importSheetName}
                  onChange={(e) => setImportSheetName(e.target.value)}
                  disabled={importing || !importSegment}
                />
              </div>
            </div>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void runCorporateImport(file);
                e.target.value = "";
              }}
            />
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!importing && importSegment) importFileInputRef.current?.click();
                }
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (importSegment) setImportDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setImportDragging(false);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setImportDragging(false);
                if (!importSegment) return;
                void runCorporateImport(e.dataTransfer.files?.[0]);
              }}
              className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                importDragging
                  ? "border-mtc-blue bg-blue-50/50"
                  : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
              } ${importing || !importSegment ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
              onClick={() => {
                if (!importing && importSegment) importFileInputRef.current?.click();
              }}
            >
              {importing ? (
                <div className="flex flex-col items-center gap-3 text-slate-600">
                  <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
                  <span className="text-sm font-medium">
                    {importProgress?.status === "pending" ? "Uploading & preparing…" : "Importing rows…"}
                  </span>
                  <div className="w-full max-w-md space-y-2">
                    <Progress value={importProgress?.percent ?? 0} />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {importProgress?.totalRows
                          ? `${importProgress.processedRows.toLocaleString()} / ${importProgress.totalRows.toLocaleString()} rows`
                          : "Counting rows…"}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-700">
                        {Math.min(100, Math.max(0, Math.round(importProgress?.percent ?? 0)))}%
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    You can leave this page — the import continues on the server.
                  </span>
                </div>
              ) : importProgress?.status === "completed" ? (
                <div className="flex flex-col items-center gap-3 text-slate-600">
                  <CheckCircle className="h-8 w-8 text-emerald-500" />
                  <span className="text-sm font-medium text-slate-800">
                    Import completed — {importProgress.totalRows.toLocaleString()} rows processed
                  </span>
                  <div className="w-full max-w-md">
                    <Progress value={100} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-600">
                  <Upload className="h-8 w-8 text-mtc-blue" />
                  <span className="text-sm font-medium text-slate-800">
                    {importSegment
                      ? "Drag and drop an .xlsx file here, or click to browse"
                      : "Import is unavailable until your department is Key Accounts or EBU"}
                  </span>
                  <span className="text-xs text-slate-500">Max 50 MB</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-mtc-blue" /> Pending Imported Executives
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Placeholder executives created during the corporate import and linked to you.
                Add their real email to give them portal access. Existing corporate and account links are preserved.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => loadPendingExecutives()}
              disabled={loadingPendingExecutives}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loadingPendingExecutives ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Placeholder Email</TableHead>
                <TableHead>Region</TableHead>
                <TableHead className="text-right">Corporates</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingPendingExecutives ? (
                <TableRow>
                  <td colSpan={6} className="text-center py-8 text-slate-500 px-4">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading...
                  </td>
                </TableRow>
              ) : pendingExecutives.length === 0 ? (
                <TableRow>
                  <td colSpan={6} className="text-center py-8 text-slate-400 px-4">
                    No pending imported executives. All imported executives assigned to you have portal access.
                  </td>
                </TableRow>
              ) : (
                pendingExecutives.map((exec) => (
                  <TableRow key={exec.executiveId}>
                    <TableCell className="font-medium text-slate-900">{exec.firstName} {exec.lastName}</TableCell>
                    <TableCell className="text-sm text-slate-500 font-mono">{exec.currentEmail}</TableCell>
                    <TableCell className="text-sm">{exec.region || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={exec.linkedCorporatesCount > 0 ? "default" : "neutral"}>
                        {exec.linkedCorporatesCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={exec.linkedAccountsCount > 0 ? "default" : "neutral"}>
                        {exec.linkedAccountsCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => openOnboardPendingExec(exec)}>
                        <UserPlus className="h-4 w-4 mr-1" /> Complete Onboarding
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
        </div>
      )}

      {selectedPendingExec && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-4 sm:py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-4 sm:p-6 border-b border-slate-200">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-mtc-blue shrink-0" />
                  Complete Onboarding
                </h2>
                <p className="text-sm text-slate-500 mt-0.5 break-words">
                  {selectedPendingExec.firstName} {selectedPendingExec.lastName} · {selectedPendingExec.linkedCorporatesCount} corporate{selectedPendingExec.linkedCorporatesCount === 1 ? "" : "s"}, {selectedPendingExec.linkedAccountsCount} account{selectedPendingExec.linkedAccountsCount === 1 ? "" : "s"} already linked
                </p>
              </div>
              <button
                onClick={closeOnboardPendingExec}
                disabled={submittingOnboarding}
                className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors disabled:opacity-50 self-end sm:self-auto"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-xs text-slate-600">
                {onboardingMode === "existing"
                  ? "No credentials are generated in this mode. It only reassigns linked corporates and accounts to the selected already-onboarded executive."
                  : "Generates a one-time password and emails it to the address you enter. The executive must change that password on first login before using the portal."}
              </div>

              <div className="space-y-2">
                <Label>Onboarding Option</Label>
                <Select
                  value={onboardingMode}
                  onChange={(e) => setOnboardingMode((e.target.value as "new" | "existing") || "new")}
                >
                  <option value="new">Create portal access for this imported executive</option>
                  <option value="existing">Assign imported links to an existing executive</option>
                </Select>
              </div>

              {onboardingMode === "existing" ? (
                <div className="space-y-2">
                  <Label>Existing Executive <span className="text-red-500">*</span></Label>
                  <Select
                    value={onboardingForm.existingExecutiveId?.toString() ?? ""}
                    onChange={(e) =>
                      setOnboardingForm((form) => ({
                        ...form,
                        existingExecutiveId: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  >
                    <option value="">Select Executive...</option>
                    {onboardedExecutives.map((exec) => (
                      <option key={exec.executiveId} value={exec.executiveId}>
                        {exec.firstName} {exec.lastName} — {exec.email}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-slate-500">
                    Only executives on your team who already have portal access are listed.
                    {onboardedExecutives.length === 0 && (
                      <span className="block mt-1 text-amber-600">
                        No executives with portal access on your team yet.
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>First Name <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="First name"
                        value={onboardingForm.firstName}
                        onChange={(e) => setOnboardingForm((form) => ({ ...form, firstName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="Last name"
                        value={onboardingForm.lastName}
                        onChange={(e) => setOnboardingForm((form) => ({ ...form, lastName: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email <span className="text-red-500">*</span></Label>
                    <Input
                      type="email"
                      placeholder="name@mtc.com.na"
                      value={onboardingForm.email}
                      onChange={(e) => setOnboardingForm((form) => ({ ...form, email: e.target.value }))}
                    />
                    <p className="text-xs text-slate-500">
                      Replaces the placeholder email <span className="font-mono">{selectedPendingExec.currentEmail}</span>.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      placeholder="+264 ..."
                      value={onboardingForm.phone}
                      onChange={(e) => setOnboardingForm((form) => ({ ...form, phone: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Reports to Manager</Label>
                    <Input value={displayName} readOnly />
                    <p className="text-xs text-slate-500">
                      This executive stays on your team. The import already linked them to you.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={closeOnboardPendingExec} disabled={submittingOnboarding} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleCompletePendingExec} disabled={submittingOnboarding} className="w-full sm:w-auto">
                {submittingOnboarding ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Onboarding...</>
                ) : onboardingMode === "existing" ? (
                  <><UserCheck className="h-4 w-4 mr-1" /> Reassign Linked Accounts</>
                ) : (
                  <><Key className="h-4 w-4 mr-1" /> Generate Credentials & Send Email</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingPortalUser && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle className="text-lg">Edit Portal User</CardTitle>
              <Button variant="ghost" size="sm" disabled={savingPortalUser || deletingPortalUser} onClick={() => setEditingPortalUser(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1 text-sm">
                <p className="font-medium text-slate-900">{editingPortalUser.firstName} {editingPortalUser.lastName}</p>
                <p className="text-slate-500">{editingPortalUser.email}</p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                {editingPortalUser.role === "customer" ? (
                  <>
                    <Input value="Account Manager" readOnly />
                    <p className="text-xs text-slate-500">
                      Account manager role stays tied to their corporate. You can remove their portal access.
                    </p>
                  </>
                ) : (
                  <Select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                    {EDITABLE_PORTAL_ROLES.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label>Portal access</Label>
                <Select
                  value={editPortalAccess}
                  onChange={(e) => setEditPortalAccess(e.target.value as "active" | "revoked")}
                >
                  <option value="active">Active</option>
                  <option value="revoked">Remove access</option>
                </Select>
                <p className="text-xs text-slate-500">
                  Removing access deletes their login. Their profile stays, so access can be granted again later.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  disabled={savingPortalUser || deletingPortalUser}
                  onClick={handleDeletePortalUser}
                >
                  {deletingPortalUser ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Delete
                </Button>
                <Button variant="outline" className="flex-1" disabled={savingPortalUser || deletingPortalUser} onClick={() => setEditingPortalUser(null)}>
                  Cancel
                </Button>
                <Button className="flex-1" disabled={savingPortalUser || deletingPortalUser} onClick={handleSavePortalUser}>
                  {savingPortalUser ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
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
              <CardTitle className="text-lg">Confirm {portalUserLabel} Details</CardTitle>
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
                Review the details below. A one-time password will be generated and emailed to them. They must change it on first login.
              </p>
              <div className="space-y-3 text-sm">
                {[
                  { label: "Full Name", value: `${createExecutiveForm.firstName.trim()} ${createExecutiveForm.lastName.trim()}` },
                  { label: "Email", value: createExecutiveForm.email.trim() },
                  { label: "Phone", value: createExecutiveForm.phone.trim() || "—" },
                  { label: "Region", value: createExecutiveForm.kind === "customer" || createExecutiveForm.kind === "admin" ? "—" : (createExecutiveForm.region || "—") },
                  { label: "Corporate", value: createExecutiveForm.kind === "customer"
                    ? (managerCorporates.find((c) => String(c.corporateId) === createExecutiveForm.corporateId)?.corporateName || "—")
                    : "—" },
                  { label: "Reports to Manager", value: displayName },
                  { label: "Department", value: profile?.department || "—" },
                  { label: "Role", value: portalUserLabel },
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
