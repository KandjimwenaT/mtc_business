import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../components/ui-components";
import { Progress } from "../components/ui/progress";
import {
  User, Shield, Users, Lock, Bell, FileText, Clock,
  Plus, Edit, X, CheckCircle, Search,
  Mail, Activity, Database, UserPlus, Key, Loader2, RefreshCw,
  Building2, ChevronRight, Settings, Eye, Trash2, UserCircle,
  UserCheck, Upload, FileSpreadsheet,
} from "lucide-react";
import {
  createPerson, getPersonsByType, createPortalAccess, getPortalUsers, revokePortalAccess, deletePersonWithoutPortalAccess,
  getExecutives, getCorporatesWithoutContactPersons,
  createAccount, getAccounts, createContract, createService, getAccountServices, getAccountContracts,
  getPendingImportedExecutives, completeImportedExecutive, importKeyAccountsFromExcel,
  importEbuFromExcel,
  getManagers,
  type PersonPayload, type PersonRecord, type PortalUser,
  type ExecutiveRecord,
  type AccountPayload, type AccountRecord, type ContractPayload, type ContractRecord, type CorporateRecord,
  type ServicePayload, type ServiceRecord,
  type PendingImportedExecutive,
  type ManagerRecord,
} from "../api/adminApi";
import { getMyProfile } from "../api/authApi";
import type { UserProfile } from "../api/authApi";
import ProfileEditSection from "../components/profile-edit-section";
import PortalUserHierarchyModal from "../components/admin/PortalUserHierarchyModal";

type Tab = "profile" | "users" | "noPortalUsers" | "pendingExecutives" | "roles" | "sla" | "notifications" | "audit" | "settings";

const USER_TYPES = [
  { value: "gm", label: "GM" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "executive_staff", label: "Executive Staff" },
  { value: "customer", label: "Account Manager" },
] as const;

const ACCOUNT_TYPES = ["Corporate", "SME", "Government", "Retail", "Other"];
const SERVICE_TYPES = ["Mobile Voice", "Fiber Internet", "LTE Data", "MPLS VPN", "Cloud Services", "IoT", "Server Colocation", "Other"];
const CONTRACT_TYPES = ["Postpaid", "Prepaid", "Fixed Term", "Month-to-Month", "Government", "SLA Agreement"];
const ROLE_LABELS: Record<string, string> = {
  customer: "Account Manager",
  executive_staff: "Executive Staff",
  gm: "GM",
  admin: "Admin",
  manager: "Manager",
};

export default function SuperAdminProfile() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [searchUsers, setSearchUsers] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    getMyProfile().then(setUserProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  const displayName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : "System Administrator";
  const initials = userProfile ? `${userProfile.firstName[0]}${userProfile.lastName[0]}` : "SA";

  // ── Create User (profile tab) state ─────────────────────────────
  const [createUserForm, setCreateUserForm] = useState<PersonPayload>({
    firstName: "", lastName: "", email: "", phone: "", type: "executive_staff", region: "", department: "",
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [gmList, setGmList] = useState<PersonRecord[]>([]);
  const [managerList, setManagerList] = useState<PersonRecord[]>([]);
  const [executivePersonList, setExecutivePersonList] = useState<PersonRecord[]>([]);
  const [availableCorporateList, setAvailableCorporateList] = useState<CorporateRecord[]>([]);
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [corporateSearchQuery, setCorporateSearchQuery] = useState("");
  const [corporateDropdownOpen, setCorporateDropdownOpen] = useState(false);
  const corporatePickerRef = useRef<HTMLDivElement | null>(null);

  // ── Create Portal Access (user management tab) state ────────────
  const [showPortalAccess, setShowPortalAccess] = useState(false);
  const [portalType, setPortalType] = useState<string>("");
  const [personsForType, setPersonsForType] = useState<PersonRecord[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonRecord | null>(null);
  const [grantingAccess, setGrantingAccess] = useState(false);

  // ── Portal users list ───────────────────────────────────────────
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [loadingPortalUsers, setLoadingPortalUsers] = useState(false);
  const [revokingUserId, setRevokingUserId] = useState<number | null>(null);
  const [noPortalUsers, setNoPortalUsers] = useState<PersonRecord[]>([]);
  const [loadingNoPortalUsers, setLoadingNoPortalUsers] = useState(false);
  const [deletingNoPortalId, setDeletingNoPortalId] = useState<number | null>(null);

  // ── Pending imported executives state ───────────────────────────
  const [pendingExecutives, setPendingExecutives] = useState<PendingImportedExecutive[]>([]);
  const [loadingPendingExecutives, setLoadingPendingExecutives] = useState(false);
  const [selectedPendingExec, setSelectedPendingExec] = useState<PendingImportedExecutive | null>(null);
  // Department-aware importer mode. EBU admins always see the EBU importer,
  // Key Accounts admins always see the KAM importer; super-admins (no
  // department) can switch between the two via the chooser at the top of the
  // tab. `null` means "let the profile decide", which the derivation below
  // converts to a concrete `"kam" | "ebu"` once the profile has loaded.
  const [importMode, setImportMode] = useState<"kam" | "ebu" | null>(null);
  const [keyAccountsImportDragging, setKeyAccountsImportDragging] = useState(false);
  const [keyAccountsImporting, setKeyAccountsImporting] = useState(false);
  const [keyAccountsImportProgress, setKeyAccountsImportProgress] = useState<{
    percent: number;
    processedRows: number;
    totalRows: number;
    status: "pending" | "running" | "completed" | "failed";
  } | null>(null);
  const [keyAccountsSheetName, setKeyAccountsSheetName] = useState("");
  const [keyAccountsImportManagers, setKeyAccountsImportManagers] = useState<ManagerRecord[]>([]);
  const [keyAccountsAssignedManagerProfileId, setKeyAccountsAssignedManagerProfileId] = useState<
    number | undefined
  >(undefined);
  const keyAccountsFileInputRef = useRef<HTMLInputElement | null>(null);
  const [onboardingForm, setOnboardingForm] = useState<{ firstName: string; lastName: string; email: string; phone: string; managerPersonId: number | undefined; existingExecutiveId: number | undefined }>({
    firstName: "", lastName: "", email: "", phone: "", managerPersonId: undefined, existingExecutiveId: undefined,
  });
  const [onboardingMode, setOnboardingMode] = useState<"new" | "existing">("new");
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);

  // ── User hierarchy modal (from Edit action) ────────────────────
  const [hierarchyModalUser, setHierarchyModalUser] = useState<PortalUser | null>(null);
  const [loadingHierarchyModal, setLoadingHierarchyModal] = useState(false);
  const [adminPersonList, setAdminPersonList] = useState<PersonRecord[]>([]);
  const [supervisorPersonList, setSupervisorPersonList] = useState<PersonRecord[]>([]);

  // ── Customer Accounts state ─────────────────────────────────────
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [showAccountWizard, setShowAccountWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [createdAccountId, setCreatedAccountId] = useState<number | null>(null);
  const [executiveList, setExecutiveList] = useState<ExecutiveRecord[]>([]);
  const [accountManagerList, setAccountManagerList] = useState<PersonRecord[]>([]);
  const [submittingWizard, setSubmittingWizard] = useState(false);

  const [accountForm, setAccountForm] = useState<AccountPayload>({
    accountNumber: "", accountName: "", accountType: "", executiveId: null,
    managerId: null, parentAccountId: null, contactFirstName: "", contactLastName: "",
    contactEmail: "", contactPhone: "", industry: "", isActive: true,
  });
  const [contractForm, setContractForm] = useState<ContractPayload>({
    contractType: "", contractStartDate: "", contractEndDate: "",
    contractEffectiveDate: "", srNumber: "", srCreatedDate: "",
    srSubmittedDate: "", srAcceptedDate: "", usageLimit: "", entitlement: "", notes: "",
  });
  const [serviceLines, setServiceLines] = useState<ServicePayload[]>([
    { msisdn: "", serviceType: "", status: "active" },
  ]);

  // Existing account services panel
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null);
  const [expandedServices, setExpandedServices] = useState<ServiceRecord[]>([]);
  const [addServiceForm, setAddServiceForm] = useState<ServicePayload>({ msisdn: "", serviceType: "", status: "active" });
  const [addingService, setAddingService] = useState(false);

  // Account detail modal
  const [detailAccount, setDetailAccount] = useState<AccountRecord | null>(null);
  const [detailContracts, setDetailContracts] = useState<ContractRecord[]>([]);
  const [detailServices, setDetailServices] = useState<ServiceRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "profile", label: "Super Admin Profile", icon: <User className="h-4 w-4" /> },
    { key: "users", label: "User Management", icon: <Users className="h-4 w-4" /> },
    { key: "noPortalUsers", label: "Users Without Portal Access", icon: <Lock className="h-4 w-4" /> },
    { key: "pendingExecutives", label: "Pending Imported Executives", icon: <UserCheck className="h-4 w-4" /> },
    { key: "settings", label: "Profile", icon: <UserCircle className="h-4 w-4" /> },
    // { key: "roles", label: "Role Management", icon: <Lock className="h-4 w-4" /> },
    // { key: "sla", label: "Global SLA Settings", icon: <Clock className="h-4 w-4" /> },
    // { key: "notifications", label: "Notification Templates", icon: <Bell className="h-4 w-4" /> },
    // { key: "audit", label: "Audit Log", icon: <FileText className="h-4 w-4" /> },
    // { key: "settings", label: "Profile Settings", icon: <Settings className="h-4 w-4" /> },
  ];

  const selectedManager = managerList.find((m) => m.id === createUserForm.managerId);

  // Department-aware importer wiring. EBU admin -> EBU importer; Key Accounts
  // admin -> KAM importer; super-admin (no department) -> use the manual
  // `importMode` toggle. Default the toggle to KAM for backwards compatibility.
  const effectiveImportMode: "kam" | "ebu" =
    userProfile?.department === "EBU"
      ? "ebu"
      : userProfile?.department === "Key Accounts"
      ? "kam"
      : importMode ?? "kam";

  const importDepartmentLabel: "EBU" | "Key Accounts" =
    effectiveImportMode === "ebu" ? "EBU" : "Key Accounts";

  // Only show managers in the matching department in the dropdown so admins
  // cannot accidentally pick a manager from the other segment.
  const filteredImportManagers = keyAccountsImportManagers.filter(
    (m) => m.department === importDepartmentLabel
  );

  // Onboarding-modal scoping. Departmented admins (EBU/Key Accounts) should
  // only see managers and existing executives from their own segment when
  // completing onboarding for a pending imported executive. Super-admins (no
  // department) see everything as before.
  const isDepartmentedAdmin = !!userProfile?.department;

  // PersonRecord.department lives directly on the row, so the manager dropdown
  // can be filtered without a join.
  const onboardingManagerOptions = isDepartmentedAdmin
    ? managerList.filter((m) => m.department === importDepartmentLabel)
    : managerList;

  // ExecutiveRecord has no department field. Derive it via
  // executive.managerId -> Manager.department using the same managers list
  // we already loaded for the import dropdown.
  const managerDepartmentById = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const m of keyAccountsImportManagers) {
      map.set(m.managerId, m.department ?? null);
    }
    return map;
  }, [keyAccountsImportManagers]);

  const onboardingExistingExecutiveOptions = (() => {
    const onboarded = executiveList.filter((ex) => !!ex.userId);
    if (!isDepartmentedAdmin) return onboarded;
    return onboarded.filter((ex) => {
      if (ex.managerId == null) return false; // orphans hidden from departmented admins
      return managerDepartmentById.get(ex.managerId) === importDepartmentLabel;
    });
  })();

  // Reset the manager selection whenever the effective mode changes; the
  // previously chosen manager almost certainly doesn't belong to the new
  // department.
  useEffect(() => {
    setKeyAccountsAssignedManagerProfileId(undefined);
  }, [effectiveImportMode]);

  // The EBU sheet ships with a sheet named "Update " (with a trailing space).
  // Pre-fill the sheet input for EBU mode the first time the user lands on it
  // so the file uploads work without manual entry. Leave KAM untouched.
  useEffect(() => {
    if (effectiveImportMode === "ebu" && keyAccountsSheetName.trim() === "") {
      setKeyAccountsSheetName("Update ");
    }
  }, [effectiveImportMode]);

  // ── Fetch portal users when User Management tab is active ───────
  const fetchPortalUsers = useCallback(async () => {
    setLoadingPortalUsers(true);
    try {
      const data = await getPortalUsers();
      setPortalUsers(data);
    } catch (err: unknown) {
      toast.error("Failed to load portal users", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoadingPortalUsers(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (err: unknown) {
      toast.error("Failed to load accounts", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const fetchNoPortalUsers = useCallback(async () => {
    setLoadingNoPortalUsers(true);
    try {
      const [persons, customers] = await Promise.all([
        getPersonsByType(),
        getPersonsByType("customer"),
      ]);
      const merged = [...persons, ...customers].filter((p) => !p.hasPortalAccess);
      setNoPortalUsers(merged);
    } catch (err: unknown) {
      toast.error("Failed to load users", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoadingNoPortalUsers(false);
    }
  }, []);

  const fetchPendingExecutives = useCallback(async () => {
    setLoadingPendingExecutives(true);
    try {
      const [pending, managers, portalManagers] = await Promise.all([
        getPendingImportedExecutives(),
        getPersonsByType("manager"),
        getManagers(),
      ]);
      setPendingExecutives(pending);
      setManagerList(managers);
      setKeyAccountsImportManagers(portalManagers);
      if (executiveList.length === 0) {
        const execs = await getExecutives();
        setExecutiveList(execs);
      }
    } catch (err: unknown) {
      toast.error("Failed to load pending executives", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoadingPendingExecutives(false);
    }
  }, []);

  const runKeyAccountsImportForFile = async (file: File | null | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx")) {
      toast.error("Please upload an Excel .xlsx file");
      return;
    }
    if (keyAccountsAssignedManagerProfileId == null) {
      toast.error("Please select a manager to link corporates to before importing");
      return;
    }
    setKeyAccountsImporting(true);
    setKeyAccountsImportProgress({
      percent: 0,
      processedRows: 0,
      totalRows: 0,
      status: "pending",
    });
    try {
      const result = await importKeyAccountsFromExcel(
        file,
        {
          sheet: keyAccountsSheetName.trim() || undefined,
          assignedManagerProfileId: keyAccountsAssignedManagerProfileId,
        },
        (progress) => setKeyAccountsImportProgress(progress)
      );
      setKeyAccountsImportProgress({
        percent: 100,
        processedRows: result.stats.totalRows,
        totalRows: result.stats.totalRows,
        status: "completed",
      });
      const s = result.stats;
      toast.success("Key accounts import completed", {
        description: `Sheet “${result.sheetName}”: corporates created ${s.created}, updated ${s.updated}; accounts +${s.accountsCreated} / ~${s.accountsUpdated}; services +${s.servicesCreated}; contracts +${s.contractsCreated}. New placeholder executives: ${result.createdExecutivesCount}.`,
      });
      if (result.unresolvedTotal > 0) {
        toast.message(`${result.unresolvedTotal} row(s) had no matching executive`, {
          description:
            "Those rows were skipped. Add executives in the system or enable consistent account-manager names in the file.",
        });
      }
      await fetchPendingExecutives();
    } catch (err: unknown) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : undefined });
      setKeyAccountsImportProgress(null);
    } finally {
      setKeyAccountsImporting(false);
      // Keep the final 100% state visible briefly, then clear it.
      setTimeout(() => setKeyAccountsImportProgress(null), 4000);
    }
  };

  const runEbuImportForFile = async (file: File | null | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx")) {
      toast.error("Please upload an Excel .xlsx file");
      return;
    }
    if (keyAccountsAssignedManagerProfileId == null) {
      toast.error("Please select an EBU manager to link corporates to before importing");
      return;
    }
    setKeyAccountsImporting(true);
    setKeyAccountsImportProgress({
      percent: 0,
      processedRows: 0,
      totalRows: 0,
      status: "pending",
    });
    try {
      const result = await importEbuFromExcel(
        file,
        {
          sheet: keyAccountsSheetName.trim() || undefined,
          assignedManagerProfileId: keyAccountsAssignedManagerProfileId,
        },
        (progress) => setKeyAccountsImportProgress(progress)
      );
      setKeyAccountsImportProgress({
        percent: 100,
        processedRows: result.stats.totalRows,
        totalRows: result.stats.totalRows,
        status: "completed",
      });
      const s = result.stats;
      toast.success("EBU import completed", {
        description: `Sheet “${result.sheetName}”: corporates created ${s.created}, updated ${s.updated}; accounts +${s.accountsCreated} / ~${s.accountsUpdated}; services +${s.servicesCreated}. New placeholder executives: ${result.createdExecutivesCount}.`,
      });
      if (result.unresolvedTotal > 0) {
        toast.message(`${result.unresolvedTotal} row(s) had no matching CSE`, {
          description:
            "Those rows were imported with the manager only. Add the executive later or correct the CSE Name in the file.",
        });
      }
      await fetchPendingExecutives();
    } catch (err: unknown) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : undefined });
      setKeyAccountsImportProgress(null);
    } finally {
      setKeyAccountsImporting(false);
      setTimeout(() => setKeyAccountsImportProgress(null), 4000);
    }
  };

  const runActiveImportForFile = (file: File | null | undefined) => {
    if (effectiveImportMode === "ebu") {
      return runEbuImportForFile(file);
    }
    return runKeyAccountsImportForFile(file);
  };

  useEffect(() => {
    if (activeTab === "users") fetchPortalUsers();
    if (activeTab === "noPortalUsers") fetchNoPortalUsers();
    if (activeTab === "pendingExecutives") fetchPendingExecutives();
    if (activeTab === "profile") {
      setLoadingHierarchy(true);
      Promise.all([getPersonsByType("gm"), getPersonsByType("manager"), getPersonsByType("executive_staff")])
        .then(([gms, managers, executives]) => { setGmList(gms); setManagerList(managers); setExecutivePersonList(executives); })
        .catch(() => {})
        .finally(() => setLoadingHierarchy(false));
    }
  }, [activeTab, fetchPortalUsers, fetchAccounts, fetchNoPortalUsers, fetchPendingExecutives]);

  // ── Fetch persons by type for portal access ─────────────────────
  useEffect(() => {
    if (!portalType) { setPersonsForType([]); setSelectedPerson(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingPersons(true);
      setSelectedPerson(null);
      try {
        const data = await getPersonsByType(portalType);
        if (!cancelled) setPersonsForType(data.filter(p => !p.hasPortalAccess));
      } catch (err: unknown) {
        if (!cancelled) toast.error("Failed to load users", { description: err instanceof Error ? err.message : undefined });
      } finally {
        if (!cancelled) setLoadingPersons(false);
      }
    })();
    return () => { cancelled = true; };
  }, [portalType]);

  // ── Reload hierarchy lists when user type changes ────────────────
  useEffect(() => {
    if (createUserForm.type === "manager" && gmList.length === 0) {
      getPersonsByType("gm").then(setGmList).catch(() => {});
    }
    if (createUserForm.type === "executive_staff" && managerList.length === 0) {
      getPersonsByType("manager").then(setManagerList).catch(() => {});
    }
    if (createUserForm.type === "customer" && availableCorporateList.length === 0) {
      getCorporatesWithoutContactPersons().then(setAvailableCorporateList).catch(() => {});
    }
  }, [createUserForm.type, gmList.length, managerList.length, availableCorporateList.length]);

  // Reset the corporate picker whenever the user-type changes away from customer
  useEffect(() => {
    if (createUserForm.type !== "customer") {
      setCorporateSearchQuery("");
      setCorporateDropdownOpen(false);
    }
  }, [createUserForm.type]);

  // Close the corporate-picker dropdown when clicking outside of it
  useEffect(() => {
    if (!corporateDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        corporatePickerRef.current &&
        !corporatePickerRef.current.contains(event.target as Node)
      ) {
        setCorporateDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [corporateDropdownOpen]);

  const selectedCorporate = useMemo(
    () =>
      availableCorporateList.find(
        (corporate) => corporate.corporateId === createUserForm.corporateId
      ) ?? null,
    [availableCorporateList, createUserForm.corporateId]
  );

  const filteredCorporateOptions = useMemo(() => {
    const q = corporateSearchQuery.trim().toLowerCase();
    if (!q) return availableCorporateList;
    return availableCorporateList.filter((corporate) => {
      return (
        corporate.corporateName.toLowerCase().includes(q) ||
        (corporate.corporateNumber || "").toLowerCase().includes(q) ||
        (corporate.industry || "").toLowerCase().includes(q) ||
        (corporate.businessEmail || "").toLowerCase().includes(q)
      );
    });
  }, [availableCorporateList, corporateSearchQuery]);

  // ── Handlers ────────────────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!createUserForm.firstName || !createUserForm.lastName || !createUserForm.email || !createUserForm.type) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (createUserForm.type === "customer" && (!createUserForm.corporateId || !createUserForm.phone)) {
      toast.error("Please provide corporate company and contact number for Account Manager");
      return;
    }
    if (createUserForm.type === "manager" && !createUserForm.gmId) {
      toast.error("Please select a GM for this Manager");
      return;
    }
    if (createUserForm.type === "manager" && !createUserForm.department) {
      toast.error("Please select a Department for this Manager");
      return;
    }
    if (createUserForm.type === "executive_staff" && !createUserForm.managerId) {
      toast.error("Please select a Manager for this Executive Staff member");
      return;
    }
    if (createUserForm.type === "admin" && !createUserForm.managerId) {
      toast.error("Please select a Manager for this Admin");
      return;
    }
    if (createUserForm.type === "admin" && !createUserForm.department) {
      toast.error("Admin must be linked to a department");
      return;
    }
    setCreatingUser(true);
    try {
      await createPerson(createUserForm);
      toast.success("User created successfully", {
        description: `${createUserForm.firstName} ${createUserForm.lastName} added as ${ROLE_LABELS[createUserForm.type] || createUserForm.type}`,
      });
      setCreateUserForm({ firstName: "", lastName: "", email: "", phone: "", type: "executive_staff", region: "", department: "" });
      if (createUserForm.type === "customer") {
        getCorporatesWithoutContactPersons().then(setAvailableCorporateList).catch(() => {});
      }
    } catch (err: unknown) {
      toast.error("Failed to create user", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRevokePortalAccess = async (user: PortalUser) => {
    if (!window.confirm(`Remove portal access for ${user.firstName} ${user.lastName}? Their person and profile records will be kept.`)) return;
    setRevokingUserId(user.id);
    try {
      await revokePortalAccess(user.id);
      toast.success("Portal access revoked", { description: `${user.firstName} ${user.lastName} can no longer log in` });
      fetchPortalUsers();
    } catch (err: unknown) {
      toast.error("Failed to revoke access", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setRevokingUserId(null);
    }
  };

  const openUserHierarchyModal = async (user: PortalUser) => {
    setLoadingHierarchyModal(true);
    try {
      const [gms, managers, supervisors, executives, admins] = await Promise.all([
        getPersonsByType("gm"),
        getPersonsByType("manager"),
        getPersonsByType("supervisor"),
        getPersonsByType("executive_staff"),
        getPersonsByType("admin"),
      ]);

      setGmList(gms);
      setManagerList(managers);
      setSupervisorPersonList(supervisors);
      setExecutivePersonList(executives);
      setAdminPersonList(admins);
    } catch {
      // Keep existing lists if the fetch fails.
    } finally {
      setHierarchyModalUser(user);
      setLoadingHierarchyModal(false);
    }
  };

  const handleGrantPortalAccess = async () => {
    if (!selectedPerson) return;
    setGrantingAccess(true);
    try {
      await createPortalAccess(selectedPerson.id, selectedPerson.type);
      toast.success("Portal access granted!", { description: `Credentials sent to ${selectedPerson.email}` });
      setSelectedPerson(null);
      setPortalType("");
      setShowPortalAccess(false);
      fetchPortalUsers();
    } catch (err: unknown) {
      toast.error("Failed to grant portal access", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setGrantingAccess(false);
    }
  };

  const handleDeleteNoPortalUser = async (person: PersonRecord) => {
    if (!window.confirm(`Delete ${person.firstName} ${person.lastName}? This cannot be undone.`)) return;
    setDeletingNoPortalId(person.id);
    try {
      await deletePersonWithoutPortalAccess(person.id, person.type);
      toast.success("User deleted successfully");
      await fetchNoPortalUsers();
    } catch (err: unknown) {
      toast.error("Failed to delete user", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDeletingNoPortalId(null);
    }
  };

  const openOnboardPendingExec = (exec: PendingImportedExecutive) => {
    setSelectedPendingExec(exec);
    setOnboardingForm({
      firstName: exec.firstName ?? "",
      lastName: exec.lastName ?? "",
      email: "",
      phone: exec.phone ?? "",
      managerPersonId: undefined,
      existingExecutiveId: undefined,
    });
    setOnboardingMode("new");
  };

  const closeOnboardPendingExec = () => {
    if (submittingOnboarding) return;
    setSelectedPendingExec(null);
    setOnboardingForm({ firstName: "", lastName: "", email: "", phone: "", managerPersonId: undefined, existingExecutiveId: undefined });
    setOnboardingMode("new");
  };

  const handleCompletePendingExec = async () => {
    if (!selectedPendingExec) return;
    setSubmittingOnboarding(true);
    try {
      if (onboardingMode === "existing") {
        const onboardedExecutiveList = executiveList.filter((ex) => !!ex.userId);
        if (!onboardingForm.existingExecutiveId) {
          toast.error("Please select an existing executive");
          return;
        }
        const selectedExisting = onboardedExecutiveList.find(
          (ex) => ex.executiveId === onboardingForm.existingExecutiveId
        );
        if (!selectedExisting) {
          toast.error("Please select an executive with completed onboarding");
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
        if (!onboardingForm.managerPersonId) {
          toast.error("Please select a manager");
          return;
        }
        const response = await completeImportedExecutive(selectedPendingExec.executiveId, {
          firstName,
          lastName,
          email,
          phone: onboardingForm.phone.trim() || undefined,
          managerPersonId: onboardingForm.managerPersonId,
        });
        const emailSent = response.emailSent !== false;
        toast.success("Executive onboarded", {
          description: emailSent
            ? `Credentials sent to ${email}`
            : `Email delivery failed. Temp password: ${response.user?.password ?? "(check server logs)"}`,
        });
      }
      setSelectedPendingExec(null);
      setOnboardingForm({ firstName: "", lastName: "", email: "", phone: "", managerPersonId: undefined, existingExecutiveId: undefined });
      setOnboardingMode("new");
      await Promise.all([fetchPendingExecutives(), fetchPortalUsers()]);
    } catch (err: unknown) {
      toast.error("Failed to onboard executive", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmittingOnboarding(false);
    }
  };

  // ── Account Wizard handlers ──────────────────────────────────────
  const resetWizard = () => {
    setShowAccountWizard(false);
    setWizardStep(1);
    setCreatedAccountId(null);
    setAccountForm({ accountNumber: "", accountName: "", accountType: "", executiveId: null, managerId: null, parentAccountId: null, contactFirstName: "", contactLastName: "", contactEmail: "", contactPhone: "", industry: "", isActive: true });
    setContractForm({ contractType: "", contractStartDate: "", contractEndDate: "", contractEffectiveDate: "", srNumber: "", srCreatedDate: "", srSubmittedDate: "", srAcceptedDate: "", usageLimit: "", entitlement: "", notes: "" });
    setServiceLines([{ msisdn: "", serviceType: "", status: "active" }]);
  };

  const handleWizardStep1 = async () => {
    if (!accountForm.accountNumber || !accountForm.accountName || !accountForm.accountType || !accountForm.contactFirstName || !accountForm.contactLastName || !accountForm.contactEmail) {
      toast.error("Please fill in all required account fields");
      return;
    }
    setSubmittingWizard(true);
    try {
      const account = await createAccount(accountForm);
      setCreatedAccountId(account.accountId);
      setWizardStep(2);
    } catch (err: unknown) {
      toast.error("Failed to create account", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmittingWizard(false);
    }
  };

  const handleWizardStep2 = async () => {
    if (!contractForm.contractType) {
      toast.error("Contract type is required");
      return;
    }
    if (!createdAccountId) return;
    setSubmittingWizard(true);
    try {
      await createContract(createdAccountId, contractForm);
      setWizardStep(3);
    } catch (err: unknown) {
      toast.error("Failed to save contract", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmittingWizard(false);
    }
  };

  const handleWizardStep3 = async () => {
    const validLines = serviceLines.filter(s => s.serviceType.trim());
    if (validLines.length === 0) {
      toast.error("Please add at least one service line");
      return;
    }
    if (!createdAccountId) return;
    setSubmittingWizard(true);
    let successCount = 0;
    for (const line of validLines) {
      try {
        await createService(createdAccountId, line);
        successCount++;
      } catch {
        // continue
      }
    }
    setSubmittingWizard(false);
    if (successCount === validLines.length) {
      toast.success("Account setup complete!", { description: `Account, contract and ${successCount} service line(s) created.` });
    } else {
      toast.warning(`${successCount}/${validLines.length} service lines created`, { description: "Some service lines failed — you can add them later." });
    }
    resetWizard();
    fetchAccounts();
  };

  const handleExpandAccount = async (accountId: number) => {
    if (expandedAccountId === accountId) { setExpandedAccountId(null); return; }
    setExpandedAccountId(accountId);
    try {
      const services = await getAccountServices(accountId);
      setExpandedServices(services);
    } catch {
      setExpandedServices([]);
    }
  };

  const handleAddServiceToAccount = async (accountId: number) => {
    if (!addServiceForm.serviceType.trim()) {
      toast.error("Service type is required");
      return;
    }
    setAddingService(true);
    try {
      await createService(accountId, addServiceForm);
      toast.success("Service added");
      setAddServiceForm({ msisdn: "", serviceType: "", status: "active" });
      const services = await getAccountServices(accountId);
      setExpandedServices(services);
    } catch (err: unknown) {
      toast.error("Failed to add service", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setAddingService(false);
    }
  };

  const handleOpenAccountDetail = async (acc: AccountRecord) => {
    setDetailAccount(acc);
    setLoadingDetail(true);
    try {
      const [contracts, services] = await Promise.all([
        getAccountContracts(acc.accountId),
        getAccountServices(acc.accountId),
      ]);
      setDetailContracts(contracts);
      setDetailServices(services);
    } catch {
      setDetailContracts([]);
      setDetailServices([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCloseDetail = () => {
    setDetailAccount(null);
    setDetailContracts([]);
    setDetailServices([]);
  };

  const filteredPortalUsers = portalUsers.filter(u =>
    searchUsers === "" ||
    u.firstName.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.lastName.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.email.toLowerCase().includes(searchUsers.toLowerCase()) ||
    u.role.toLowerCase().includes(searchUsers.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Super Admin Portal</h2>
          <p className="text-sm text-slate-500">System administration, user management, and global settings</p>
        </div>
        <Badge className="text-sm px-3 py-1 bg-slate-900 text-white border-transparent">Super Admin</Badge>
      </div>

      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === tab.key ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >{tab.icon}{tab.label}</button>
        ))}
      </div>

      {/* PROFILE + CREATE USER */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardContent className="pt-6 flex flex-col items-center text-center">
                <div className="h-24 w-24 rounded-full bg-slate-900 flex items-center justify-center text-white text-3xl font-bold mb-4">{initials}</div>
                <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
                <p className="text-sm text-slate-500">{userProfile?.personId ? `EMP-${userProfile.personId}` : "EMP-000001"} · Super Admin</p>
                <div className="mt-4 w-full space-y-2 text-left text-sm">
                  <div className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4 text-mtc-blue" /> {userProfile?.email || "admin@mtc.com.na"}</div>
                  <div className="flex items-center gap-2 text-slate-600"><Shield className="h-4 w-4 text-mtc-blue" /> Full System Access</div>
                  <div className="flex items-center gap-2 text-slate-600"><Lock className="h-4 w-4 text-mtc-blue" /> MFA Enabled</div>
                </div>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">System Health</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Users", value: "42", color: "text-mtc-blue" },
                    { label: "Active Sessions", value: "18", color: "text-green-600" },
                    { label: "Roles Configured", value: "7", color: "text-slate-900" },
                    { label: "Audit Entries (24h)", value: "1,247", color: "text-amber-600" },
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

          {/* ── CREATE USER FORM ─────────────────────────────── */}
          <Card className="border-mtc-blue/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-mtc-blue" /> Create User
              </CardTitle>
              <p className="text-xs text-slate-500">Add a new internal user to the database. Portal access is granted separately.</p>
            </CardHeader>
            <CardContent className="space-y-4">
          
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>User Type <span className="text-red-500">*</span></Label>
                  <Select value={createUserForm.type} onChange={(e) => setCreateUserForm(f => ({ ...f, type: e.target.value as PersonPayload["type"], gmId: undefined, managerId: undefined, corporateId: undefined, department: "" }))}>
                    {USER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>First Name <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. John" value={createUserForm.firstName} onChange={(e) => setCreateUserForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. Doe" value={createUserForm.lastName} onChange={(e) => setCreateUserForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Email <span className="text-red-500">*</span></Label>
                  <Input type="email" placeholder="name@mtc.com.na" value={createUserForm.email} onChange={(e) => setCreateUserForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{createUserForm.type === "customer" ? "Contact Number" : "Phone"}{createUserForm.type === "customer" ? <span className="text-red-500"> *</span> : null}</Label>
                  <Input placeholder="+264 ..." value={createUserForm.phone} onChange={(e) => setCreateUserForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                {createUserForm.type === "customer" && (
                  <div className="space-y-2">
                    <Label>Corporate Company <span className="text-red-500">*</span></Label>
                    <div className="relative" ref={corporatePickerRef}>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <Input
                          className="pl-9 pr-9"
                          placeholder={
                            availableCorporateList.length === 0
                              ? loadingHierarchy
                                ? "Loading corporates..."
                                : "No corporates available"
                              : "Search corporate by name or number..."
                          }
                          value={
                            corporateDropdownOpen
                              ? corporateSearchQuery
                              : selectedCorporate
                              ? `${selectedCorporate.corporateName} — ${selectedCorporate.corporateNumber}`
                              : corporateSearchQuery
                          }
                          onFocus={() => setCorporateDropdownOpen(true)}
                          onChange={(e) => {
                            setCorporateSearchQuery(e.target.value);
                            setCorporateDropdownOpen(true);
                            if (createUserForm.corporateId !== undefined) {
                              setCreateUserForm((f) => ({
                                ...f,
                                corporateId: undefined,
                                department: "",
                              }));
                            }
                          }}
                          disabled={availableCorporateList.length === 0 && !loadingHierarchy}
                        />
                        {(selectedCorporate || corporateSearchQuery) && (
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                            onClick={() => {
                              setCorporateSearchQuery("");
                              setCorporateDropdownOpen(true);
                              setCreateUserForm((f) => ({
                                ...f,
                                corporateId: undefined,
                                department: "",
                              }));
                            }}
                            aria-label="Clear corporate selection"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {corporateDropdownOpen && availableCorporateList.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                          {filteredCorporateOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-500">
                              No corporates match "{corporateSearchQuery}".
                            </div>
                          ) : (
                            filteredCorporateOptions.map((corporate) => {
                              const isSelected =
                                corporate.corporateId === createUserForm.corporateId;
                              return (
                                <button
                                  type="button"
                                  key={corporate.corporateId}
                                  onClick={() => {
                                    setCreateUserForm((f) => ({
                                      ...f,
                                      corporateId: corporate.corporateId,
                                      department: corporate.corporateName,
                                    }));
                                    setCorporateSearchQuery("");
                                    setCorporateDropdownOpen(false);
                                  }}
                                  className={`block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                                    isSelected ? "bg-mtc-blue-50 text-mtc-blue" : "text-slate-700"
                                  }`}
                                >
                                  <div className="font-medium">{corporate.corporateName}</div>
                                  <div className="text-xs text-slate-500">
                                    {corporate.corporateNumber}
                                    {corporate.industry ? ` • ${corporate.industry}` : ""}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Manager-specific fields */}
                {createUserForm.type === "manager" && (
                  <>
                    <div className="space-y-2">
                      <Label>Department <span className="text-red-500">*</span></Label>
                      <Select
                        value={createUserForm.department ?? ""}
                        onChange={(e) => setCreateUserForm(f => ({ ...f, department: e.target.value }))}
                      >
                        <option value="">Select Department...</option>
                        <option value="Key Accounts">Key Accounts</option>
                        <option value="EBU">EBU</option>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Reports to GM <span className="text-red-500">*</span></Label>
                      <Select
                        value={createUserForm.gmId?.toString() ?? ""}
                        onChange={(e) => setCreateUserForm(f => ({ ...f, gmId: e.target.value ? Number(e.target.value) : undefined }))}
                      >
                        <option value="">Select GM...{loadingHierarchy ? " (loading)" : ""}</option>
                        {gmList.map(g => <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>)}
                      </Select>
                    </div>
                  </>
                )}

                {/* Executive Staff-specific fields */}
                {createUserForm.type === "executive_staff" && (
                  <>
                    <div className="space-y-2">
                      <Label>Region</Label>
                      <Select value={createUserForm.region ?? ""} onChange={(e) => setCreateUserForm(f => ({ ...f, region: e.target.value }))}>
                        <option value="">Select Region...</option>
                        <option value="Windhoek Central">Windhoek Central</option>
                        <option value="Northern Region">Northern Region</option>
                        <option value="Southern Region">Southern Region</option>
                        <option value="Coastal Region">Coastal Region</option>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Reports to Manager <span className="text-red-500">*</span></Label>
                      <Select
                        value={createUserForm.managerId?.toString() ?? ""}
                        onChange={(e) => setCreateUserForm(f => ({ ...f, managerId: e.target.value ? Number(e.target.value) : undefined }))}
                      >
                        <option value="">Select Manager...{loadingHierarchy ? " (loading)" : ""}</option>
                        {managerList.map(m => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}{m.department ? ` — ${m.department}` : ""}</option>)}
                      </Select>
                    </div>
                  </>
                )}

                {/* Admin-specific fields */}
                {createUserForm.type === "admin" && (
                  <>
                    <div className="space-y-2">
                      <Label>Department Manager <span className="text-red-500">*</span></Label>
                      <Select
                        value={createUserForm.managerId?.toString() ?? ""}
                        onChange={(e) => {
                          const nextManagerId = e.target.value ? Number(e.target.value) : undefined;
                          const manager = managerList.find((m) => m.id === nextManagerId);
                          setCreateUserForm((f) => ({
                            ...f,
                            managerId: nextManagerId,
                            department: manager?.department ?? "",
                          }));
                        }}
                      >
                        <option value="">Select Manager...{loadingHierarchy ? " (loading)" : ""}</option>
                        {managerList.map(m => <option key={m.id} value={m.id}>{m.firstName} {m.lastName}{m.department ? ` — ${m.department}` : ""}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <Input value={selectedManager?.department ?? createUserForm.department ?? ""} readOnly />
                    </div>
                    <div className="space-y-2 md:col-span-2 lg:col-span-3">
                      <p className="text-xs text-slate-500">
                        Admin access is department-based. All admins in this department can action all department tickets.
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <Button variant="outline" onClick={() => setCreateUserForm({ firstName: "", lastName: "", email: "", phone: "", type: "executive_staff", region: "", department: "" })}>Reset</Button>
                <Button onClick={handleCreateUser} disabled={creatingUser}>
                  {creatingUser ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating...</> : <><UserPlus className="h-4 w-4 mr-1" /> Create User</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* USER MANAGEMENT + CREATE PORTAL ACCESS */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* ── CREATE PORTAL ACCESS PANEL ───────────────────── */}
          {showPortalAccess && (
            <Card className="border-green-200 bg-green-50/30 animate-in slide-in-from-top-4">
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2"><Key className="h-5 w-5 text-green-600" /> Create Portal Access</CardTitle>
                  <p className="text-xs text-slate-500 mt-1">Select a user type, pick an existing person, and generate login credentials.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setShowPortalAccess(false); setPortalType(""); setSelectedPerson(null); }}><X className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Step 1: Pick type */}
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>User Type <span className="text-red-500">*</span></Label>
                    <Select value={portalType} onChange={(e) => setPortalType(e.target.value)}>
                      <option value="">Select Type...</option>
                      {USER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </div>

                  {/* Step 2: Pick person */}
                  {portalType && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Select User {loadingPersons && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</Label>
                      {personsForType.length === 0 && !loadingPersons ? (
                        <p className="text-sm text-slate-500 italic pt-1">No users of this type without portal access.</p>
                      ) : (
                        <Select
                          value={selectedPerson?.id?.toString() ?? ""}
                          onChange={(e) => {
                            const p = personsForType.find(p => p.id === Number(e.target.value));
                            setSelectedPerson(p ?? null);
                          }}
                        >
                          <option value="">Choose a person...</option>
                          {personsForType.map(p => (
                            <option key={p.id} value={p.id}>{p.firstName} {p.lastName} — {p.email}</option>
                          ))}
                        </Select>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 3: Auto-filled details */}
                {selectedPerson && (
                  <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><User className="h-4 w-4 text-mtc-blue" /> Selected User Details</h4>
                    <div className="grid gap-3 md:grid-cols-3 text-sm">
                      <div><span className="text-slate-500">Name:</span> <span className="font-medium">{selectedPerson.firstName} {selectedPerson.lastName}</span></div>
                      <div><span className="text-slate-500">Email:</span> <span className="font-medium">{selectedPerson.email}</span></div>
                      <div><span className="text-slate-500">Phone:</span> <span className="font-medium">{selectedPerson.phone || "N/A"}</span></div>
                      <div><span className="text-slate-500">Role:</span> <Badge variant="default" className="text-xs ml-1">{ROLE_LABELS[selectedPerson.type] || selectedPerson.type}</Badge></div>
                      <div><span className="text-slate-500">Department:</span> <span className="font-medium">{selectedPerson.department || "N/A"}</span></div>
                      <div><span className="text-slate-500">Region:</span> <span className="font-medium">{selectedPerson.region || "N/A"}</span></div>
                    </div>
                  </div>
                )}

                {/* Action */}
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                  <Button variant="outline" onClick={() => { setShowPortalAccess(false); setPortalType(""); setSelectedPerson(null); }}>Cancel</Button>
                  <Button onClick={handleGrantPortalAccess} disabled={!selectedPerson || grantingAccess}>
                    {grantingAccess ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</> : <><Key className="h-4 w-4 mr-1" /> Generate Credentials & Send Email</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── PORTAL USERS TABLE ───────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-5 w-5 text-mtc-blue" /> Portal Users</CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                  <Input className="pl-9 w-56 h-9 text-sm" placeholder="Search portal users..." value={searchUsers} onChange={(e) => setSearchUsers(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={fetchPortalUsers} disabled={loadingPortalUsers}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${loadingPortalUsers ? "animate-spin" : ""}`} /> Refresh
                </Button>
                <Button size="sm" onClick={() => setShowPortalAccess(true)}>
                  <Key className="h-4 w-4 mr-1" /> Create Portal Access
                </Button>
              </div>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPortalUsers ? (
                  <TableRow><td colSpan={6} className="text-center py-8 text-slate-500 px-4"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading...</td></TableRow>
                ) : filteredPortalUsers.length === 0 ? (
                  <TableRow><td colSpan={6} className="text-center py-8 text-slate-400 px-4">No portal users found</td></TableRow>
                ) : filteredPortalUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs text-mtc-blue">{u.id}</TableCell>
                    <TableCell className="font-medium text-slate-900">{u.firstName} {u.lastName}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell><Badge variant="default">{ROLE_LABELS[u.role] || u.role}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openUserHierarchyModal(u)}
                          disabled={loadingHierarchyModal}
                          title="View user hierarchy"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRevokePortalAccess(u)}
                          disabled={revokingUserId === u.id}
                        >
                          {revokingUserId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {hierarchyModalUser && (
            <PortalUserHierarchyModal
              user={hierarchyModalUser}
              onClose={() => setHierarchyModalUser(null)}
              loading={loadingHierarchyModal}
              gmPersons={gmList}
              managerPersons={managerList}
              supervisorPersons={supervisorPersonList}
              executivePersons={executivePersonList}
              adminPersons={adminPersonList}
            />
          )}
        </div>
      )}

      {activeTab === "noPortalUsers" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-5 w-5 text-mtc-blue" />
              Users Created Without Portal Access
            </CardTitle>
            <Button size="sm" variant="outline" onClick={fetchNoPortalUsers} disabled={loadingNoPortalUsers}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loadingNoPortalUsers ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingNoPortalUsers ? (
                <TableRow>
                  <td colSpan={6} className="text-center py-8 text-slate-500 px-4">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading...
                  </td>
                </TableRow>
              ) : noPortalUsers.length === 0 ? (
                <TableRow>
                  <td colSpan={6} className="text-center py-8 text-slate-400 px-4">No users without portal access found</td>
                </TableRow>
              ) : (
                noPortalUsers.map((person) => (
                  <TableRow key={`${person.type}-${person.id}`}>
                    <TableCell className="font-mono text-xs text-mtc-blue">{person.id}</TableCell>
                    <TableCell className="font-medium text-slate-900">{person.firstName} {person.lastName}</TableCell>
                    <TableCell className="text-sm">{person.email}</TableCell>
                    <TableCell><Badge variant="neutral">{ROLE_LABELS[person.type] || person.type}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-500">{person.created_at ? new Date(person.created_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteNoPortalUser(person)}
                        disabled={deletingNoPortalId === person.id}
                      >
                        {deletingNoPortalId === person.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* PENDING IMPORTED EXECUTIVES (placeholders from Excel import) */}
      {activeTab === "pendingExecutives" && (
        <div className="space-y-6">
          {/* Super-admin chooser: only visible when the logged-in admin has no
              department (true super-admins). Departmented admins see only
              their own importer with no chooser. */}
          {userProfile && !userProfile.department && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Import mode:</span>
              <Button
                size="sm"
                variant={effectiveImportMode === "kam" ? "default" : "outline"}
                onClick={() => setImportMode("kam")}
                disabled={keyAccountsImporting}
              >
                Key Accounts
              </Button>
              <Button
                size="sm"
                variant={effectiveImportMode === "ebu" ? "default" : "outline"}
                onClick={() => setImportMode("ebu")}
                disabled={keyAccountsImporting}
              >
                EBU
              </Button>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-mtc-blue" />
                {effectiveImportMode === "ebu"
                  ? "Import EBU corporates from Excel"
                  : "Import key accounts from Excel"}
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                {effectiveImportMode === "ebu" ? (
                  <>
                    Upload the EBU customer list (.xlsx). Each row becomes a service under
                    an account scoped to its site; corporates are created or updated as
                    type <span className="font-mono">ebu</span>. Rows missing a CSE Name are
                    imported with only the chosen manager as the owner.
                  </>
                ) : (
                  <>
                    Upload the same .xlsx format as the backend import script. This creates or updates key-account corporates,
                    linked customer accounts, services (when MSISDN is present), and contracts. Missing account managers become placeholder executives
                    with @import.local emails — complete onboarding for them in the table below.
                  </>
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-md">
                <Label htmlFor="key-accounts-manager">
                  Link corporates to {importDepartmentLabel} manager <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="key-accounts-manager"
                  value={keyAccountsAssignedManagerProfileId?.toString() ?? ""}
                  onChange={(e) =>
                    setKeyAccountsAssignedManagerProfileId(
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  disabled={keyAccountsImporting}
                >
                  <option value="">Select a {importDepartmentLabel} manager...</option>
                  {filteredImportManagers.map((m) => (
                    <option key={m.managerId} value={m.managerId}>
                      {m.firstName} {m.lastName}
                      {m.department ? ` — ${m.department}` : ""} (ID&nbsp;{m.managerId})
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-slate-500">
                  Required. Every imported corporate, account and placeholder executive will
                  be linked to this {importDepartmentLabel} manager so it shows up under their
                  segment.
                  {filteredImportManagers.length === 0 && (
                    <span className="block mt-1 text-amber-600">
                      No {importDepartmentLabel} managers found. Create one in User Management first.
                    </span>
                  )}
                </p>
              </div>
              <div className="space-y-2 max-w-md">
                <Label htmlFor="key-accounts-sheet">Sheet name (optional)</Label>
                <Input
                  id="key-accounts-sheet"
                  placeholder="Leave blank to use the first sheet"
                  value={keyAccountsSheetName}
                  onChange={(e) => setKeyAccountsSheetName(e.target.value)}
                  disabled={keyAccountsImporting}
                />
              </div>
              <input
                ref={keyAccountsFileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  void runActiveImportForFile(f);
                  e.target.value = "";
                }}
              />
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!keyAccountsImporting) keyAccountsFileInputRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setKeyAccountsImportDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setKeyAccountsImportDragging(false);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setKeyAccountsImportDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  void runActiveImportForFile(f);
                }}
                className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  keyAccountsImportDragging
                    ? "border-mtc-blue bg-blue-50/50"
                    : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                } ${keyAccountsImporting ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
                onClick={() => {
                  if (!keyAccountsImporting) keyAccountsFileInputRef.current?.click();
                }}
              >
                {keyAccountsImporting ? (
                  <div className="flex flex-col items-center gap-3 text-slate-600">
                    <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
                    <span className="text-sm font-medium">
                      {keyAccountsImportProgress?.status === "pending"
                        ? "Uploading & preparing…"
                        : "Importing rows…"}
                    </span>
                    <div className="w-full max-w-md space-y-2">
                      <Progress value={keyAccountsImportProgress?.percent ?? 0} />
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {keyAccountsImportProgress?.totalRows
                            ? `${keyAccountsImportProgress.processedRows.toLocaleString()} / ${keyAccountsImportProgress.totalRows.toLocaleString()} rows`
                            : "Counting rows…"}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-700">
                          {Math.min(100, Math.max(0, Math.round(keyAccountsImportProgress?.percent ?? 0)))}%
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      You can leave this page — the import continues on the server.
                    </span>
                  </div>
                ) : keyAccountsImportProgress && keyAccountsImportProgress.status === "completed" ? (
                  <div className="flex flex-col items-center gap-3 text-slate-600">
                    <CheckCircle className="h-8 w-8 text-emerald-500" />
                    <span className="text-sm font-medium text-slate-800">
                      Import completed — {keyAccountsImportProgress.totalRows.toLocaleString()} rows processed
                    </span>
                    <div className="w-full max-w-md">
                      <Progress value={100} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-600">
                    <Upload className="h-8 w-8 text-mtc-blue" />
                    <span className="text-sm font-medium text-slate-800">
                      Drag and drop an .xlsx file here, or click to browse
                    </span>
                    <span className="text-xs text-slate-500">Max 50 MB · Admin only</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-mtc-blue" />
                {userProfile?.department
                  ? `${importDepartmentLabel} — Pending Imported Executives`
                  : "Pending Imported Executives"}
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Placeholder executive records created during the corporate import. Add their real email and assign a manager to give them portal access. Existing corporate and account links are preserved.
                {userProfile?.department && (
                  <span className="block mt-1">
                    Showing only executives scoped to the <span className="font-semibold">{importDepartmentLabel}</span> segment.
                  </span>
                )}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={fetchPendingExecutives} disabled={loadingPendingExecutives}>
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
                    No pending imported executives. All imported executives have portal access.
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
                      <Button
                        size="sm"
                        onClick={() => openOnboardPendingExec(exec)}
                      >
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







 

      {/* customer_accounts tab removed for admin */}

      {/* ── COMPLETE PENDING EXECUTIVE ONBOARDING MODAL ─────── */}
      {selectedPendingExec && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-start justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-mtc-blue" />
                  Complete Onboarding
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {selectedPendingExec.firstName} {selectedPendingExec.lastName} · {selectedPendingExec.linkedCorporatesCount} corporate{selectedPendingExec.linkedCorporatesCount === 1 ? "" : "s"}, {selectedPendingExec.linkedAccountsCount} account{selectedPendingExec.linkedAccountsCount === 1 ? "" : "s"} already linked
                </p>
              </div>
              <button
                onClick={closeOnboardPendingExec}
                disabled={submittingOnboarding}
                className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-xs text-slate-600">
                {onboardingMode === "existing"
                  ? "No credentials are generated in this mode. It only reassigns linked corporates and accounts to the selected already-onboarded executive."
                  : "Generates a temporary password and emails it to the address you enter. The executive can then log in and immediately see all linked corporate accounts."}
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
                      setOnboardingForm((f) => ({
                        ...f,
                        existingExecutiveId: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  >
                    <option value="">Select Executive...</option>
                    {onboardingExistingExecutiveOptions.map((ex) => (
                      <option key={ex.executiveId} value={ex.executiveId}>
                        {ex.firstName} {ex.lastName} — {ex.email}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-slate-500">
                    Only executives with completed onboarding and portal login are listed.
                    {isDepartmentedAdmin && (
                      <span className="block mt-1">
                        Scoped to the <span className="font-semibold">{importDepartmentLabel}</span> segment.
                      </span>
                    )}
                    {isDepartmentedAdmin && onboardingExistingExecutiveOptions.length === 0 && (
                      <span className="block mt-1 text-amber-600">
                        No {importDepartmentLabel} executives with portal access yet.
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
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Last name"
                    value={onboardingForm.lastName}
                    onChange={(e) => setOnboardingForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email <span className="text-red-500">*</span></Label>
                <Input
                  type="email"
                  placeholder="name@mtc.com.na"
                  value={onboardingForm.email}
                  onChange={(e) => setOnboardingForm((f) => ({ ...f, email: e.target.value }))}
                />
                <p className="text-xs text-slate-500">Replaces the placeholder email <span className="font-mono">{selectedPendingExec.currentEmail}</span>.</p>
              </div>

              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  placeholder="+264 ..."
                  value={onboardingForm.phone}
                  onChange={(e) => setOnboardingForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Reports to Manager <span className="text-red-500">*</span></Label>
                <Select
                  value={onboardingForm.managerPersonId?.toString() ?? ""}
                  onChange={(e) =>
                    setOnboardingForm((f) => ({
                      ...f,
                      managerPersonId: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                >
                  <option value="">Select Manager...</option>
                  {onboardingManagerOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}{m.department ? ` — ${m.department}` : ""}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-slate-500">
                  Only managers who already have portal access can be selected.
                  {isDepartmentedAdmin && (
                    <span className="block mt-1">
                      Scoped to the <span className="font-semibold">{importDepartmentLabel}</span> segment.
                    </span>
                  )}
                  {isDepartmentedAdmin && onboardingManagerOptions.length === 0 && (
                    <span className="block mt-1 text-amber-600">
                      No {importDepartmentLabel} managers found.
                    </span>
                  )}
                </p>
              </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <Button variant="outline" onClick={closeOnboardPendingExec} disabled={submittingOnboarding}>
                Cancel
              </Button>
              <Button onClick={handleCompletePendingExec} disabled={submittingOnboarding}>
                {submittingOnboarding ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Onboarding...</>
                ) : (
                  onboardingMode === "existing"
                    ? <><UserCheck className="h-4 w-4 mr-1" /> Reassign Linked Accounts</>
                    : <><Key className="h-4 w-4 mr-1" /> Generate Credentials & Send Email</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── ACCOUNT DETAIL MODAL ─────────────────────────────── */}
      {detailAccount && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-mtc-blue" />
                  {detailAccount.accountName}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5 font-mono">{detailAccount.accountNumber}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={detailAccount.isActive ? "success" : "danger"}>{detailAccount.isActive ? "Active" : "Inactive"}</Badge>
                <button onClick={handleCloseDetail} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {loadingDetail ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
              </div>
            ) : (
              <div className="p-6 space-y-6">

                {/* ── SECTION 1: Account Details ── */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Account Details
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <div><p className="text-xs text-slate-400">Account Type</p><p className="text-sm font-medium text-slate-900 mt-0.5">{detailAccount.accountType}</p></div>
                    <div><p className="text-xs text-slate-400">Industry</p><p className="text-sm font-medium text-slate-900 mt-0.5">{detailAccount.industry || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Created</p><p className="text-sm font-medium text-slate-900 mt-0.5">{new Date(detailAccount.created_at).toLocaleDateString()}</p></div>
                    {(() => {
                      const fn = (detailAccount.contactFirstName || "").trim();
                      const ln = (detailAccount.contactLastName || "").trim();
                      const em = (detailAccount.contactEmail || "").trim();
                      const looksDummy =
                        (fn === "Imported" && ln === "Contact") ||
                        em.toLowerCase().endsWith("@placeholder.local");
                      const missing = looksDummy || (!fn && !ln && !em);
                      const nameDisplay = missing ? "Not assigned" : `${fn} ${ln}`.trim();
                      const emailDisplay = missing ? "Not assigned" : em;
                      const cls = missing ? "text-amber-700 italic" : "text-slate-900";
                      return (
                        <>
                          <div><p className="text-xs text-slate-400">Contact Name</p><p className={`text-sm font-medium mt-0.5 ${cls}`}>{nameDisplay}</p></div>
                          <div><p className="text-xs text-slate-400">Contact Email</p><p className={`text-sm font-medium mt-0.5 ${cls}`}>{emailDisplay}</p></div>
                        </>
                      );
                    })()}
                    <div><p className="text-xs text-slate-400">Contact Phone</p><p className="text-sm font-medium text-slate-900 mt-0.5">{detailAccount.contactPhone || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Assigned Manager</p><p className="text-sm font-medium text-slate-900 mt-0.5">{(() => { const mgr = accountManagerList.find(m => m.id === detailAccount.managerId); return detailAccount.managerId ? (mgr ? `${mgr.firstName} ${mgr.lastName}` : `ID #${detailAccount.managerId}`) : "—"; })()}</p></div>
                    {detailAccount.parentAccountId && (
                      <div><p className="text-xs text-slate-400">Parent Account ID</p><p className="text-sm font-medium text-slate-900 mt-0.5">#{detailAccount.parentAccountId}</p></div>
                    )}
                  </div>
                </div>

                {/* ── SECTION 2: Contracts ── */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Contracts ({detailContracts.length})
                  </h3>
                  {detailContracts.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No contracts on this account.</p>
                  ) : (
                    <div className="space-y-3">
                      {detailContracts.map(c => (
                        <div key={c.contractId} className="p-4 rounded-lg border border-slate-200 bg-white">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-semibold text-slate-800">{c.contractType}</span>
                            {c.srNumber && <span className="text-xs font-mono text-mtc-blue bg-blue-50 px-2 py-0.5 rounded">{c.srNumber}</span>}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><p className="text-xs text-slate-400">Start Date</p><p className="font-medium">{c.contractStartDate ? new Date(c.contractStartDate).toLocaleDateString() : "—"}</p></div>
                            <div><p className="text-xs text-slate-400">End Date</p><p className="font-medium">{c.contractEndDate ? new Date(c.contractEndDate).toLocaleDateString() : "—"}</p></div>
                            <div><p className="text-xs text-slate-400">Effective Date</p><p className="font-medium">{c.contractEffectiveDate ? new Date(c.contractEffectiveDate).toLocaleDateString() : "—"}</p></div>
                            <div><p className="text-xs text-slate-400">Usage Limit</p><p className="font-medium">{c.usageLimit || "—"}</p></div>
                            {c.entitlement && <div className="md:col-span-2"><p className="text-xs text-slate-400">Entitlement</p><p className="font-medium">{c.entitlement}</p></div>}
                            {c.srCreatedDate && <div><p className="text-xs text-slate-400">SR Created</p><p className="font-medium">{new Date(c.srCreatedDate).toLocaleDateString()}</p></div>}
                            {c.srSubmittedDate && <div><p className="text-xs text-slate-400">SR Submitted</p><p className="font-medium">{new Date(c.srSubmittedDate).toLocaleDateString()}</p></div>}
                            {c.srAcceptedDate && <div><p className="text-xs text-slate-400">SR Accepted</p><p className="font-medium">{new Date(c.srAcceptedDate).toLocaleDateString()}</p></div>}
                            {c.notes && <div className="md:col-span-4"><p className="text-xs text-slate-400">Notes</p><p className="font-medium text-slate-600">{c.notes}</p></div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── SECTION 3: Service Lines ── */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Database className="h-4 w-4" /> Service Lines ({detailServices.length})
                  </h3>
                  {detailServices.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No service lines on this account.</p>
                  ) : (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <th className="text-left px-4 py-2.5">MSISDN</th>
                            <th className="text-left px-4 py-2.5">Service Type</th>
                            <th className="text-left px-4 py-2.5">Status</th>
                            <th className="text-left px-4 py-2.5">Added</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detailServices.map(svc => (
                            <tr key={svc.serviceId}>
                              <td className="px-4 py-2.5 font-mono text-xs">{svc.msisdn || "—"}</td>
                              <td className="px-4 py-2.5">{svc.serviceType}</td>
                              <td className="px-4 py-2.5">
                                <Badge variant={svc.status === "active" ? "success" : svc.status === "suspended" ? "warning" : "danger"} className="text-xs">{svc.status}</Badge>
                              </td>
                              <td className="px-4 py-2.5 text-slate-400 text-xs">{svc.created_at ? new Date(svc.created_at).toLocaleDateString() : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            )}

            <div className="flex justify-end px-6 py-4 border-t border-slate-200">
              <Button variant="outline" onClick={handleCloseDetail}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* PROFILE (edit name, phone, password) */}
      {activeTab === "settings" && (
        userProfile ? (
          <ProfileEditSection profile={userProfile} onProfileUpdated={(updated) => setUserProfile(updated)} />
        ) : (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
          </div>
        )
      )}
    </div>
  );
}
