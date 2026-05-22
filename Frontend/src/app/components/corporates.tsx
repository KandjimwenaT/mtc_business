import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { toast } from "sonner";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  Badge,
  Input,
  Button,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./ui-components";
import { Building2, Search, Users, Star, X, FileText, Database, Loader2, CheckCircle, UserPlus, Trash2, AlertTriangle, ArrowRightLeft } from "lucide-react";
import {
  getAccounts, getAccountContracts, getAccountServices, getPersonsByType,
  createAccount, createContract, createService, createCorporate, getCorporates,
  getExpiringContracts,
  updateAccountServiceStatus, deleteAccountService,
  submitCorporateForApproval, approveCorporate, reassignCorporateExecutive,
  getCorporateContactPersons, assignContactPersonToCorporate, removeContactPersonFromCorporate,
  type AccountRecord, type ContractRecord, type ServiceRecord, type PersonRecord, type CorporateRecord, type ExpiringContractRecord,
  type AccountPayload, type ContractPayload, type ServicePayload, type CorporatePayload,
} from "../api/adminApi";
import {
  getMyExpiringContracts,
  getMyAccountManagers,
  getMyCorporateContactPersons,
  assignContactPersonToMyCorporate,
  removeContactPersonFromMyCorporate,
  createContactPersonForMyCorporate,
  type ExecutiveAccountRecord,
  type ExpiringContractRecord as ExecutiveExpiringContractRecord,
  type ExecutiveContactPersonPayload,
} from "../api/authApi";
import { getAllTickets, type TicketRecord } from "../api/ticketApi";
import { Mail, Phone } from "lucide-react";
import AdminCorporateWizard from "./admin/adminCorporateWizard";
import { isExecutiveRole, isManagerRole, isSupervisorRole } from "../utils/roleCapabilities";
import type { StaffLayoutOutletContext } from "../layoutOutletContext";
import { defaultSupervisorBadges } from "../hooks/useSupervisorHybridBadges";
import { useExecutiveData } from "../hooks/useExecutiveData";

const mockCorporates = [
  { 
    id: "C-001", name: "First National Bank", industry: "Banking", accounts: 12, exec: "Jane Smith", health: "Healthy", rating: 4.8, since: "2018",
    childAccounts: [
      { id: "ACC-1002-392", loc: "Head Office IT", services: "Fiber, Colocation" },
      { id: "ACC-1002-393", loc: "Branch Network", services: "LTE Routers" },
      { id: "ACC-1002-394", loc: "Executive Mobility", services: "50x Voice Lines" },
    ]
  },
  { 
    id: "C-002", name: "Namibia Breweries", industry: "FMCG", accounts: 5, exec: "Jane Smith", health: "Warning", rating: 3.5, since: "2020",
    childAccounts: [
      { id: "ACC-2001-101", loc: "Head Office", services: "Fiber Internet" },
      { id: "ACC-2001-102", loc: "Factory Floor", services: "IoT Sensors, LTE" },
    ]
  },
  { 
    id: "C-003", name: "Ministry of Finance", industry: "Government", accounts: 45, exec: "John Doe", health: "Healthy", rating: 4.2, since: "2016",
    childAccounts: [
      { id: "ACC-3001-001", loc: "Main Building", services: "Fiber, MPLS VPN" },
      { id: "ACC-3001-002", loc: "Regional Offices (x12)", services: "LTE Routers" },
      { id: "ACC-3001-003", loc: "Executive Suite", services: "25x Voice Lines" },
    ]
  },
  { 
    id: "C-004", name: "Ohlthaver & List", industry: "Conglomerate", accounts: 22, exec: "Sarah Lee", health: "At Risk", rating: 2.4, since: "2019",
    childAccounts: [
      { id: "ACC-4001-201", loc: "Head Office", services: "Fiber Internet" },
      { id: "ACC-4001-202", loc: "Retail Network", services: "LTE, POS Systems" },
    ]
  },
];

type AccountContactLike = {
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactEmail?: string | null;
};

// Treat blank contact fields and legacy "Imported Contact" / "@placeholder.local"
// dummy values from the bulk Excel import as a missing contact person.
const isAccountContactMissing = (acc: AccountContactLike | null | undefined) => {
  if (!acc) return true;
  const fn = (acc.contactFirstName || "").trim();
  const ln = (acc.contactLastName || "").trim();
  const em = (acc.contactEmail || "").trim().toLowerCase();
  const looksLikeImportPlaceholder =
    (fn === "Imported" && ln === "Contact") ||
    em.endsWith("@placeholder.local") ||
    em.endsWith(".contact@placeholder.local");
  return looksLikeImportPlaceholder || (!fn && !ln && !em);
};

const formatContactName = (acc: AccountContactLike | null | undefined) => {
  if (!acc) return "Not assigned";
  if (isAccountContactMissing(acc)) return "Not assigned";
  return `${acc.contactFirstName || ""} ${acc.contactLastName || ""}`.trim() || "Not assigned";
};

const formatContactEmail = (acc: AccountContactLike | null | undefined) => {
  if (!acc) return "Not assigned";
  if (isAccountContactMissing(acc)) return "Not assigned";
  return (acc.contactEmail || "").trim() || "Not assigned";
};

export default function Corporates() {
  const formatNad = (value: string | number | null | undefined) =>
    `N$ ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const navigate = useNavigate();
  const outletCtx = useOutletContext<StaffLayoutOutletContext | undefined>();
  const supervisorBadges = outletCtx?.supervisorBadges ?? defaultSupervisorBadges();
  // Detect user role
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "null"); } catch { return null; }
  })();
  const isSupervisor = isSupervisorRole(currentUser?.role);
  const hasManagerScope = isManagerRole(currentUser?.role);
  const hasExecutiveScope = isExecutiveRole(currentUser?.role);
  const [supervisorView, setSupervisorView] = useState<"executive" | "manager">("executive");
  const isManager = hasManagerScope && (!isSupervisor || supervisorView === "manager");
  const isExecutive = hasExecutiveScope && (!isSupervisor || supervisorView === "executive");
  const isAdmin = currentUser?.role === "admin";
  const profileHref =
    currentUser?.role === "admin" ? "/super-admin-profile" :
    currentUser?.role === "customer" ? "/account-manager-profile" :
    isSupervisor ? "/supervisor-profile" :
    hasManagerScope ? "/management-profile" :
    currentUser?.role === "gm" ? "/gm-crm-profile" :
    hasExecutiveScope ? "/executive-profile" :
    "/dashboard";
  const showCorporatePanel = isAdmin || isManager;
  const canManageCorporates = isManager || isAdmin;
  const CARD_PAGE_SIZE = 12;
  const ALPHABET_FILTER_OPTIONS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Shared state
  const [searchQuery, setSearchQuery] = useState("");
  const [expiryFilterMonths, setExpiryFilterMonths] = useState<0 | 1 | 3 | 6 | 12>(0);
  const [alphabetFilter, setAlphabetFilter] = useState<string>("all");
  const [executiveFilter, setExecutiveFilter] = useState<string>("all");
  const [currentListPage, setCurrentListPage] = useState(1);

  // === Mock data state (non-manager roles) ===
  const [selectedCorp, setSelectedCorp] = useState(mockCorporates[0]);
  const [showAccountDetail, setShowAccountDetail] = useState<typeof mockCorporates[0]["childAccounts"][0] | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);

  // === Manager state (real API data) ===
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [corporates, setCorporates] = useState<CorporateRecord[]>([]);
  const [executives, setExecutives] = useState<PersonRecord[]>([]);
  const [managers, setManagers] = useState<PersonRecord[]>([]);
  const [accountManagers, setAccountManagers] = useState<PersonRecord[]>([]);
  const [managerExpiringContracts, setManagerExpiringContracts] = useState<ExpiringContractRecord[]>([]);
  const [allTickets, setAllTickets] = useState<TicketRecord[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedCorporate, setSelectedCorporate] = useState<CorporateRecord | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountRecord | null>(null);

  // Detail modal state
  const [detailAccount, setDetailAccount] = useState<AccountRecord | null>(null);
  const [detailContracts, setDetailContracts] = useState<ContractRecord[]>([]);
  const [detailServices, setDetailServices] = useState<ServiceRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newDetailService, setNewDetailService] = useState<ServicePayload>({ msisdn: "", serviceType: "", status: "active" });
  const [addingDetailService, setAddingDetailService] = useState(false);
  const [updatingServiceId, setUpdatingServiceId] = useState<number | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<number | null>(null);
  const [submittingCorporateApproval, setSubmittingCorporateApproval] = useState(false);
  const [approvingCorporate, setApprovingCorporate] = useState(false);
  const [reassigningCorporateExecutive, setReassigningCorporateExecutive] = useState(false);
  const [corporateReassignOpen, setCorporateReassignOpen] = useState(false);
  const [corporateReassignDraft, setCorporateReassignDraft] = useState("");
  const [detailReassignOpen, setDetailReassignOpen] = useState(false);
  const [detailReassignDraft, setDetailReassignDraft] = useState("");

  // Approve modal state
  const [corporateExecId, setCorporateExecId] = useState<string>("");

  // Corporate contact-persons (M:N AM ↔ Corporate)
  const [corporateContactPersons, setCorporateContactPersons] = useState<PersonRecord[]>([]);
  const [loadingCorporateContacts, setLoadingCorporateContacts] = useState(false);
  const [showContactPersonModal, setShowContactPersonModal] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [assigningContactId, setAssigningContactId] = useState<number | null>(null);
  const [removingContactId, setRemovingContactId] = useState<number | null>(null);

  // Create corporate wizard (admin)
  const [showCreateCorporateWizard, setShowCreateCorporateWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [submittingWizard, setSubmittingWizard] = useState(false);
  const [createdCorporateId, setCreatedCorporateId] = useState<number | null>(null);
  const [createdChildAccountId, setCreatedChildAccountId] = useState<number | null>(null);
  const [corporateForm, setCorporateForm] = useState<CorporatePayload>({
    corporateNumber: "",
    corporateName: "",
    corporateType: "",
    businessEmail: "",
    managerId: 0,
    industry: "",
    isActive: true,
  });
  const [childAccountForm, setChildAccountForm] = useState<AccountPayload>({
    accountNumber: "",
    accountName: "",
    accountType: "",
    executiveId: null,
    managerId: null,
    parentAccountId: null,
    contactFirstName: "",
    contactLastName: "",
    contactEmail: "",
    contactPhone: "",
    industry: "",
    isActive: true,
  });
  const [childAccountExtraForm, setChildAccountExtraForm] = useState({
    billCycleDay: "",
    currentServiceOwner: "",
    serviceStatus: "active" as "active" | "suspended" | "inactive",
    expired: "no" as "yes" | "no",
  });
  const [contractForm, setContractForm] = useState<ContractPayload>({
    contractType: "",
    contractStartDate: "",
    contractEndDate: "",
    contractEffectiveDate: "",
    srNumber: "",
    srCreatedDate: "",
    srSubmittedDate: "",
    srAcceptedDate: "",
    usageLimit: "",
    entitlement: "",
    notes: "",
  });
  const [serviceLines, setServiceLines] = useState<ServicePayload[]>([
    { msisdn: "", serviceType: "", status: "active" },
  ]);

  // === Executive state (own assigned accounts) ===
  // Backed by ExecutiveDataProvider so revisiting Corporates does not trigger
  // another full reload of /auth/my-accounts.
  const {
    accounts: execAccounts,
    initialLoading: execInitialLoading,
    initialized: execInitialized,
    refreshAccounts: refreshExecAccounts,
  } = useExecutiveData();
  const loadingExecAccounts = execInitialLoading || (!execInitialized && hasExecutiveScope);
  const [execExpiringContracts, setExecExpiringContracts] = useState<ExecutiveExpiringContractRecord[]>([]);
  const [selectedExecAccount, setSelectedExecAccount] = useState<ExecutiveAccountRecord | null>(null);
  const [execDetailContracts, setExecDetailContracts] = useState<ContractRecord[]>([]);
  const [execDetailServices, setExecDetailServices] = useState<ServiceRecord[]>([]);
  const [loadingExecDetail, setLoadingExecDetail] = useState(false);

  // === Executive: corporate contact-person management ===
  const [execCorporateContacts, setExecCorporateContacts] = useState<PersonRecord[]>([]);
  const [loadingExecCorporateContacts, setLoadingExecCorporateContacts] = useState(false);
  const [execAccountManagers, setExecAccountManagers] = useState<PersonRecord[]>([]);
  const [showExecContactPersonModal, setShowExecContactPersonModal] = useState(false);
  const [showExecCreateContactModal, setShowExecCreateContactModal] = useState(false);
  const [execContactSearchQuery, setExecContactSearchQuery] = useState("");
  const [assigningExecContactId, setAssigningExecContactId] = useState<number | null>(null);
  const [removingExecContactId, setRemovingExecContactId] = useState<number | null>(null);
  const [creatingExecContact, setCreatingExecContact] = useState(false);
  const [newExecContactForm, setNewExecContactForm] = useState<ExecutiveContactPersonPayload>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  // Fetch accounts & executives for manager
  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const [accs, corps, execs, supervisorExecs, mgrs, acctMgrs] = await Promise.all([
        getAccounts(),
        getCorporates(),
        getPersonsByType("executive_staff"),
        getPersonsByType("supervisor"),
        getPersonsByType("manager"),
        getPersonsByType("customer"),
      ]);
      setAccounts(accs);
      setCorporates(corps);
      setExecutives([...execs, ...supervisorExecs]);
      setManagers(mgrs);
      setAccountManagers(acctMgrs);
      if (showCorporatePanel) {
        setSelectedCorporate((prev) => {
          if (!prev) return corps.length > 0 ? corps[0] : null;
          const fresh = corps.find((c) => c.corporateId === prev.corporateId);
          return fresh ?? (corps.length > 0 ? corps[0] : null);
        });
      } else {
        setSelectedAccount((prev) => {
          if (!prev) return accs.length > 0 ? accs[0] : null;
          const fresh = accs.find((a) => a.accountId === prev.accountId);
          return fresh ?? (accs.length > 0 ? accs[0] : null);
        });
      }
    } catch (err) {
      toast.error("Failed to load accounts", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoadingAccounts(false);
    }
  }, [showCorporatePanel]);

  const reassignExecutiveForCorporate = useCallback(
    async (corporateId: number, personId: number) => {
      setReassigningCorporateExecutive(true);
      try {
        await reassignCorporateExecutive(corporateId, personId);
        toast.success("Executive reassigned", {
          description:
            "Notifications were sent to the previous and new executives, and to contact persons who have portal access.",
        });
        setCorporateReassignOpen(false);
        setCorporateReassignDraft("");
        setDetailReassignOpen(false);
        setDetailReassignDraft("");
        await fetchAccounts();
        const freshAccs = await getAccounts();
        setDetailAccount((prev) => {
          if (!prev) return prev;
          const next = freshAccs.find((a) => a.accountId === prev.accountId);
          return next ?? prev;
        });
      } catch (err) {
        toast.error("Failed to reassign executive", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setReassigningCorporateExecutive(false);
      }
    },
    [fetchAccounts]
  );

  useEffect(() => {
    if (canManageCorporates) fetchAccounts();
  }, [canManageCorporates, fetchAccounts]);

  const refreshCorporateContactPersons = useCallback(
    async (corporateId: number | null | undefined) => {
      if (!corporateId) {
        setCorporateContactPersons([]);
        return;
      }
      setLoadingCorporateContacts(true);
      try {
        const persons = await getCorporateContactPersons(corporateId);
        setCorporateContactPersons(persons);
      } catch (err) {
        toast.error("Failed to load contact persons", {
          description: err instanceof Error ? err.message : undefined,
        });
        setCorporateContactPersons([]);
      } finally {
        setLoadingCorporateContacts(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!canManageCorporates) return;
    refreshCorporateContactPersons(selectedCorporate?.corporateId ?? null);
  }, [canManageCorporates, selectedCorporate?.corporateId, refreshCorporateContactPersons]);

  useEffect(() => {
    setCorporateReassignOpen(false);
    setCorporateReassignDraft("");
  }, [selectedCorporate?.corporateId]);

  useEffect(() => {
    setDetailReassignOpen(false);
    setDetailReassignDraft("");
  }, [detailAccount?.accountId]);

  // Existing contact persons (across the system) that are NOT yet linked to
  // the currently-selected corporate, filtered by the modal search query.
  const availableContactCandidates = useMemo(() => {
    const linkedIds = new Set(corporateContactPersons.map((c) => c.id));
    const q = contactSearchQuery.trim().toLowerCase();
    return accountManagers
      .filter((am) => !linkedIds.has(am.id))
      .filter((am) => {
        if (!q) return true;
        const fullName = `${am.firstName ?? ""} ${am.lastName ?? ""}`.toLowerCase();
        return (
          fullName.includes(q) ||
          (am.email ?? "").toLowerCase().includes(q) ||
          (am.phone ?? "").toLowerCase().includes(q) ||
          (am.department ?? "").toLowerCase().includes(q)
        );
      });
  }, [accountManagers, corporateContactPersons, contactSearchQuery]);

  const handleAssignContactPerson = async (accountManagerId: number) => {
    if (!selectedCorporate) return;
    setAssigningContactId(accountManagerId);
    try {
      await assignContactPersonToCorporate(selectedCorporate.corporateId, accountManagerId);
      toast.success("Contact person linked to corporate");
      await Promise.all([
        refreshCorporateContactPersons(selectedCorporate.corporateId),
        // Refresh global AM list so other corporate views reflect the new link.
        getPersonsByType("customer").then(setAccountManagers).catch(() => {}),
      ]);
      setShowContactPersonModal(false);
      setContactSearchQuery("");
    } catch (err) {
      toast.error("Failed to link contact person", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAssigningContactId(null);
    }
  };

  const handleRemoveContactPerson = async (accountManagerId: number) => {
    if (!selectedCorporate) return;
    if (!window.confirm("Remove this contact person from this corporate?")) return;
    setRemovingContactId(accountManagerId);
    try {
      await removeContactPersonFromCorporate(selectedCorporate.corporateId, accountManagerId);
      toast.success("Contact person removed");
      await Promise.all([
        refreshCorporateContactPersons(selectedCorporate.corporateId),
        getPersonsByType("customer").then(setAccountManagers).catch(() => {}),
      ]);
    } catch (err) {
      toast.error("Failed to remove contact person", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRemovingContactId(null);
    }
  };

  // Load detail for selected executive account (uses inline data from getMyAccounts)
  const handleExecAccountSelect = (acc: ExecutiveAccountRecord) => {
    setSelectedExecAccount(acc);
    setExecDetailContracts(acc.contracts as unknown as ContractRecord[]);
    setExecDetailServices(acc.services as unknown as ServiceRecord[]);
  };

  // Refresh the contact persons linked to the executive's currently selected
  // account's corporate. Mirrors the admin "Contact Persons" table on the
  // corporate detail view.
  const refreshExecCorporateContacts = useCallback(async (corporateId: number | null | undefined) => {
    if (!corporateId) {
      setExecCorporateContacts([]);
      return;
    }
    setLoadingExecCorporateContacts(true);
    try {
      const persons = await getMyCorporateContactPersons(corporateId);
      setExecCorporateContacts(persons);
    } catch (err) {
      toast.error("Failed to load contact persons", {
        description: err instanceof Error ? err.message : undefined,
      });
      setExecCorporateContacts([]);
    } finally {
      setLoadingExecCorporateContacts(false);
    }
  }, []);

  useEffect(() => {
    if (!isExecutive) return;
    refreshExecCorporateContacts(selectedExecAccount?.corporateId ?? null);
  }, [isExecutive, selectedExecAccount?.corporateId, refreshExecCorporateContacts]);

  // Load the pool of account managers the executive can pick from (everyone
  // already linked to one of their corporates).
  useEffect(() => {
    if (!isExecutive) return;
    getMyAccountManagers()
      .then(setExecAccountManagers)
      .catch((err) =>
        toast.error("Failed to load contact persons", {
          description: err instanceof Error ? err.message : undefined,
        })
      );
  }, [isExecutive]);

  const availableExecContactCandidates = useMemo(() => {
    const linkedIds = new Set(execCorporateContacts.map((c) => c.id));
    const q = execContactSearchQuery.trim().toLowerCase();
    return execAccountManagers
      .filter((am) => !linkedIds.has(am.id))
      .filter((am) => {
        if (!q) return true;
        const fullName = `${am.firstName ?? ""} ${am.lastName ?? ""}`.toLowerCase();
        return (
          fullName.includes(q) ||
          (am.email ?? "").toLowerCase().includes(q) ||
          (am.phone ?? "").toLowerCase().includes(q) ||
          (am.department ?? "").toLowerCase().includes(q)
        );
      });
  }, [execAccountManagers, execCorporateContacts, execContactSearchQuery]);

  const resetNewExecContactForm = () => {
    setNewExecContactForm({ firstName: "", lastName: "", email: "", phone: "" });
  };

  const handleAssignExecContactPerson = async (accountManagerId: number) => {
    if (!selectedExecAccount?.corporateId) return;
    setAssigningExecContactId(accountManagerId);
    try {
      await assignContactPersonToMyCorporate(selectedExecAccount.corporateId, accountManagerId);
      toast.success("Contact person linked to corporate");
      await Promise.all([
        refreshExecCorporateContacts(selectedExecAccount.corporateId),
        getMyAccountManagers().then(setExecAccountManagers).catch(() => {}),
        refreshExecAccounts(),
      ]);
      setShowExecContactPersonModal(false);
      setExecContactSearchQuery("");
    } catch (err) {
      toast.error("Failed to link contact person", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAssigningExecContactId(null);
    }
  };

  const handleRemoveExecContactPerson = async (accountManagerId: number) => {
    if (!selectedExecAccount?.corporateId) return;
    if (!window.confirm("Remove this contact person from this corporate?")) return;
    setRemovingExecContactId(accountManagerId);
    try {
      await removeContactPersonFromMyCorporate(selectedExecAccount.corporateId, accountManagerId);
      toast.success("Contact person removed");
      await Promise.all([
        refreshExecCorporateContacts(selectedExecAccount.corporateId),
        getMyAccountManagers().then(setExecAccountManagers).catch(() => {}),
        refreshExecAccounts(),
      ]);
    } catch (err) {
      toast.error("Failed to remove contact person", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRemovingExecContactId(null);
    }
  };

  const handleCreateExecContactPerson = async () => {
    if (!selectedExecAccount?.corporateId) return;
    const { firstName, lastName, email, phone } = newExecContactForm;
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error("First name, last name and email are required");
      return;
    }
    setCreatingExecContact(true);
    try {
      await createContactPersonForMyCorporate(selectedExecAccount.corporateId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone?.trim() || undefined,
      });
      toast.success("Contact person created and linked");
      await Promise.all([
        refreshExecCorporateContacts(selectedExecAccount.corporateId),
        getMyAccountManagers().then(setExecAccountManagers).catch(() => {}),
        refreshExecAccounts(),
      ]);
      setShowExecCreateContactModal(false);
      resetNewExecContactForm();
    } catch (err) {
      toast.error("Failed to create contact person", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreatingExecContact(false);
    }
  };

  // Auto-select the first cached account when executive data finishes loading.
  // The accounts themselves are now fetched once at Layout level, so navigation
  // back to Corporates is instant.
  useEffect(() => {
    if (!isExecutive) return;
    if (!execAccounts.length) return;
    if (selectedExecAccount) return;
    handleExecAccountSelect(execAccounts[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecutive, execAccounts]);

  useEffect(() => {
    if (expiryFilterMonths === 0) {
      setManagerExpiringContracts([]);
      return;
    }
    if (!isManager) return;
    getExpiringContracts(expiryFilterMonths)
      .then(setManagerExpiringContracts)
      .catch((err) => toast.error("Failed to load expiring contracts", { description: err instanceof Error ? err.message : undefined }));
  }, [isManager, expiryFilterMonths]);

  useEffect(() => {
    if (expiryFilterMonths === 0) {
      setExecExpiringContracts([]);
      return;
    }
    if (!isExecutive) return;
    getMyExpiringContracts(expiryFilterMonths)
      .then(setExecExpiringContracts)
      .catch((err) => toast.error("Failed to load expiring contracts", { description: err instanceof Error ? err.message : undefined }));
  }, [isExecutive, expiryFilterMonths]);

  useEffect(() => {
    if (!canManageCorporates) return;
    getAllTickets()
      .then(setAllTickets)
      .catch((err) =>
        toast.error("Failed to load tickets", {
          description: err instanceof Error ? err.message : undefined,
        })
      );
  }, [canManageCorporates]);

  // Open account detail modal (fetches contracts + services)
  const handleOpenDetail = async (acc: AccountRecord) => {
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
    setNewDetailService({ msisdn: "", serviceType: "", status: "active" });
  };

  const handleAddDetailService = async () => {
    if (!detailAccount || !newDetailService.serviceType.trim()) {
      toast.error("Service type is required");
      return;
    }
    setAddingDetailService(true);
    try {
      const created = await createService(detailAccount.accountId, newDetailService);
      setDetailServices((prev) => [created, ...prev]);
      setNewDetailService({ msisdn: "", serviceType: "", status: "active" });
      toast.success("Service line added");
    } catch (err) {
      toast.error("Failed to add service line", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setAddingDetailService(false);
    }
  };

  const handleUpdateDetailServiceStatus = async (
    serviceId: number,
    status: "active" | "suspended" | "inactive"
  ) => {
    if (!detailAccount) return;
    setUpdatingServiceId(serviceId);
    try {
      const updated = await updateAccountServiceStatus(detailAccount.accountId, serviceId, status);
      setDetailServices((prev) => prev.map((line) => (line.serviceId === serviceId ? updated : line)));
      toast.success("Service status updated");
    } catch (err) {
      toast.error("Failed to update status", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUpdatingServiceId(null);
    }
  };

  const handleDeleteDetailService = async (serviceId: number) => {
    if (!detailAccount) return;
    if (!window.confirm("Delete this service line?")) return;
    setDeletingServiceId(serviceId);
    try {
      await deleteAccountService(detailAccount.accountId, serviceId);
      setDetailServices((prev) => prev.filter((line) => line.serviceId !== serviceId));
      toast.success("Service line deleted");
    } catch (err) {
      toast.error("Failed to delete service line", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDeletingServiceId(null);
    }
  };

  const resetCreateWizard = () => {
    setShowCreateCorporateWizard(false);
    setWizardStep(1);
    setCreatedCorporateId(null);
    setCreatedChildAccountId(null);
    setCorporateForm({
      corporateNumber: "",
      corporateName: "",
      corporateType: "",
      businessEmail: "",
      managerId: 0,
      industry: "",
      isActive: true,
    });
    setChildAccountForm({
      accountNumber: "",
      accountName: "",
      accountType: "",
      executiveId: null,
      managerId: null,
      parentAccountId: null,
      contactFirstName: "",
      contactLastName: "",
      contactEmail: "",
      contactPhone: "",
      industry: "",
      isActive: true,
    });
    setChildAccountExtraForm({
      billCycleDay: "",
      currentServiceOwner: "",
      serviceStatus: "active",
      expired: "no",
    });
    setContractForm({
      contractType: "",
      contractStartDate: "",
      contractEndDate: "",
      contractEffectiveDate: "",
      srNumber: "",
      srCreatedDate: "",
      srSubmittedDate: "",
      srAcceptedDate: "",
      usageLimit: "",
      entitlement: "",
      notes: "",
    });
    setServiceLines([{ msisdn: "", serviceType: "", status: "active" }]);
  };

  const handleCreateCorporateStep = async () => {
    if (!corporateForm.corporateNumber || !corporateForm.corporateName || !corporateForm.businessEmail || !corporateForm.corporateType || !corporateForm.managerId) {
      toast.error("Please complete all required corporate fields");
      return;
    }
    setSubmittingWizard(true);
    try {
      const created = await createCorporate(corporateForm);
      toast.success("Corporate created successfully.");
      resetCreateWizard();
      fetchAccounts();
      setSelectedCorporate(created);
    } catch (err) {
      toast.error("Failed to create corporate", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmittingWizard(false);
    }
  };

  const handleStartAddAccount = (corporate: CorporateRecord) => {
    setShowCreateCorporateWizard(true);
    setWizardStep(2);
    setCreatedCorporateId(corporate.corporateId);
    setCreatedChildAccountId(null);
    setCorporateForm((prev) => ({
      ...prev,
      managerId: corporate.managerId ?? prev.managerId,
      businessEmail: corporate.businessEmail || prev.businessEmail,
    }));
    setChildAccountForm({
      accountNumber: "",
      accountName: "",
      accountType: "",
      executiveId: null,
      managerId: corporate.managerId ?? null,
      parentAccountId: null,
      corporateId: corporate.corporateId,
      contactFirstName: "",
      contactLastName: "",
      contactEmail: "",
      contactPhone: "",
      industry: "",
      isActive: true,
    });
    setContractForm({
      contractType: "",
      contractStartDate: "",
      contractEndDate: "",
      contractEffectiveDate: "",
      srNumber: "",
      srCreatedDate: "",
      srSubmittedDate: "",
      srAcceptedDate: "",
      usageLimit: "",
      entitlement: "",
      notes: "",
    });
    setServiceLines([{ msisdn: "", serviceType: "", status: "active" }]);
  };

  const handleCreateAccountStep = async () => {
    if (!createdCorporateId) return;
    if (!childAccountForm.accountNumber || !childAccountForm.accountName || !childAccountForm.accountType) {
      toast.error("Please complete all required account fields");
      return;
    }
    setSubmittingWizard(true);
    try {
      const created = await createAccount({
        ...childAccountForm,
        // Step 2 now owns account type.
        accountType: childAccountForm.accountType,
        // Contact details removed from step 2 UI; keep temporary placeholders until dedicated flow is added.
        contactFirstName: "Account",
        contactLastName: "Profile",
        contactEmail: corporateForm.businessEmail,
        contactPhone: "",
        // Expired yes/no mapped to active flag for now.
        isActive: childAccountExtraForm.expired === "yes" ? false : true,
        managerId: corporateForm.managerId || null,
        corporateId: createdCorporateId,
        parentAccountId: null,
      });
      setCreatedChildAccountId(created.accountId);
      setWizardStep(3);
      toast.success("Account details saved.");
    } catch (err) {
      toast.error("Failed to create account", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmittingWizard(false);
    }
  };

  const handleCreateContractStep = async () => {
    if (!createdChildAccountId) return;
    if (!contractForm.contractType) {
      toast.error("Contract type is required");
      return;
    }
    setSubmittingWizard(true);
    try {
      await createContract(createdChildAccountId, contractForm);
      setWizardStep(4);
      toast.success("Contract saved.");
    } catch (err) {
      toast.error("Failed to create contract", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmittingWizard(false);
    }
  };

  const handleCreateServicesStep = async () => {
    if (!createdChildAccountId) return;
    const lines = serviceLines.filter((line) => line.serviceType?.trim());
    if (lines.length === 0) {
      toast.error("Please add at least one service line");
      return;
    }
    setSubmittingWizard(true);
    try {
      for (const line of lines) {
        await createService(createdChildAccountId, line);
      }
      toast.success("Corporate setup submitted for manager follow-up and approval.");
      resetCreateWizard();
      fetchAccounts();
    } catch (err) {
      toast.error("Failed to create service lines", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmittingWizard(false);
    }
  };

  // Filter logic
  const executiveExpiringAccountIds = new Set(execExpiringContracts.map((contract) => contract.accountId));
  const managerExpiringCorporateIds = new Set(
    managerExpiringContracts
      .map((contract) => contract.corporateId)
      .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
  );
  const managerExpiringAccountIds = new Set(managerExpiringContracts.map((contract) => contract.accountId));
  const corporateActiveTicketCounts = allTickets.reduce<Record<number, number>>((acc, ticket) => {
    const corporateId = ticket.corporateId;
    if (!corporateId) return acc;
    const isClosedState = ["resolved", "closed", "rejected"].includes(ticket.status);
    if (isClosedState) return acc;
    acc[corporateId] = (acc[corporateId] || 0) + 1;
    return acc;
  }, {});
  const corporatesWithIncompleteAccount = new Set<number>(
    accounts
      .filter((a) => a.corporateId != null && isAccountContactMissing(a))
      .map((a) => a.corporateId as number)
  );

  const filteredExecAccounts = execAccounts.filter((a) => {
    const matchesExpiry = expiryFilterMonths === 0 || executiveExpiringAccountIds.has(a.accountId);
    if (!matchesExpiry) return false;
    if (searchQuery === "") return true;
    const q = searchQuery.toLowerCase();
    return (
      a.accountName.toLowerCase().includes(q) ||
      a.accountNumber.toLowerCase().includes(q) ||
      (a.industry || "").toLowerCase().includes(q)
    );
  });

  const filteredCorps = mockCorporates.filter(c =>
    searchQuery === "" ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.industry.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const normalizedSearchQuery = searchQuery.toLowerCase();
  const matchesAlphabetFilter = (name: string) =>
    alphabetFilter === "all" || (name || "").charAt(0).toUpperCase() === alphabetFilter;

  const filteredAccounts = accounts.filter(a =>
    searchQuery === "" ||
    a.accountName.toLowerCase().includes(normalizedSearchQuery) ||
    a.accountNumber.toLowerCase().includes(normalizedSearchQuery) ||
    (a.industry || "").toLowerCase().includes(normalizedSearchQuery)
  );
  // Note: corporate.executiveId references ExecutiveStaff.executiveId, which is a
  // different identifier than Person.id used in the dropdown. We therefore match
  // on the executive's full name (which is mirrored on both records server-side).
  const buildExecKey = (firstName?: string | null, lastName?: string | null) =>
    `${(firstName || "").trim()} ${(lastName || "").trim()}`.trim().toLowerCase();
  const matchesExecutiveFilter = (
    execId: number | null | undefined,
    firstName?: string | null,
    lastName?: string | null,
  ) => {
    if (executiveFilter === "all") return true;
    if (executiveFilter === "unassigned") return execId == null;
    return buildExecKey(firstName, lastName) === executiveFilter;
  };
  const filteredCorporateRecords = corporates.filter((c) =>
    (!isManager || expiryFilterMonths === 0 || managerExpiringCorporateIds.has(c.corporateId)) &&
    matchesExecutiveFilter(c.executiveId ?? null, c.executiveFirstName, c.executiveLastName) &&
    (
      searchQuery === "" ||
      c.corporateName.toLowerCase().includes(normalizedSearchQuery) ||
      c.corporateNumber.toLowerCase().includes(normalizedSearchQuery) ||
      (c.industry || "").toLowerCase().includes(normalizedSearchQuery)
    )
  );
  const alphabetFilteredCorporateRecords = filteredCorporateRecords.filter((corp) =>
    matchesAlphabetFilter(corp.corporateName || "")
  );
  const alphabetFilteredAccounts = filteredAccounts.filter((account) =>
    matchesAlphabetFilter(account.accountName || "")
  );
  const alphabetFilteredExecAccounts = filteredExecAccounts.filter((account) =>
    matchesAlphabetFilter(account.accountName || "")
  );
  const listItemsTotal = isExecutive
    ? alphabetFilteredExecAccounts.length
    : showCorporatePanel
    ? alphabetFilteredCorporateRecords.length
    : alphabetFilteredAccounts.length;
  const totalListPages = Math.max(1, Math.ceil(listItemsTotal / CARD_PAGE_SIZE));
  const paginatedCorporateRecords = alphabetFilteredCorporateRecords.slice(
    (currentListPage - 1) * CARD_PAGE_SIZE,
    currentListPage * CARD_PAGE_SIZE
  );
  const paginatedAccounts = alphabetFilteredAccounts.slice(
    (currentListPage - 1) * CARD_PAGE_SIZE,
    currentListPage * CARD_PAGE_SIZE
  );
  const paginatedExecAccounts = alphabetFilteredExecAccounts.slice(
    (currentListPage - 1) * CARD_PAGE_SIZE,
    currentListPage * CARD_PAGE_SIZE
  );
  const selectedCorporateChildAccounts = selectedCorporate
    ? accounts.filter((account) =>
        account.corporateId === selectedCorporate.corporateId &&
        (!isManager || expiryFilterMonths === 0 || managerExpiringAccountIds.has(account.accountId))
      )
    : [];
  const selectedCorporateContacts: Array<{
    name: string;
    email: string;
    phone: string;
    position: string;
    username: string;
    access: string;
  }> = [];

  useEffect(() => {
    if (!isExecutive) return;
    if (alphabetFilteredExecAccounts.length === 0) {
      if (selectedExecAccount) {
        setSelectedExecAccount(null);
      }
      setExecDetailContracts((prev) => (prev.length === 0 ? prev : []));
      setExecDetailServices((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    if (!selectedExecAccount || !alphabetFilteredExecAccounts.some((account) => account.accountId === selectedExecAccount.accountId)) {
      handleExecAccountSelect(alphabetFilteredExecAccounts[0]);
    }
  }, [isExecutive, alphabetFilteredExecAccounts, selectedExecAccount]);

  // Keep the currently selected exec account in sync with the upstream
  // execAccounts cache. The cache refreshes after contact-person mutations
  // so propagated contact info (name/email/phone) reflects immediately in
  // the right-hand Account Summary card.
  useEffect(() => {
    if (!isExecutive) return;
    if (!selectedExecAccount) return;
    const fresh = execAccounts.find((a) => a.accountId === selectedExecAccount.accountId);
    if (fresh && fresh !== selectedExecAccount) {
      setSelectedExecAccount(fresh);
      setExecDetailContracts(fresh.contracts as unknown as ContractRecord[]);
      setExecDetailServices(fresh.services as unknown as ServiceRecord[]);
    }
  }, [isExecutive, execAccounts, selectedExecAccount]);

  useEffect(() => {
    if (!isManager) return;
    if (!selectedCorporate || !alphabetFilteredCorporateRecords.some((corp) => corp.corporateId === selectedCorporate.corporateId)) {
      setSelectedCorporate(alphabetFilteredCorporateRecords[0] ?? null);
    }
  }, [isManager, alphabetFilteredCorporateRecords, selectedCorporate]);

  useEffect(() => {
    setCurrentListPage(1);
  }, [searchQuery, expiryFilterMonths, alphabetFilter, executiveFilter, showCorporatePanel]);

  useEffect(() => {
    if (currentListPage > totalListPages) {
      setCurrentListPage(totalListPages);
    }
  }, [currentListPage, totalListPages]);

  // Manager/supervisor should only see executives under their own team.
  const currentManagerPerson = managers.find((m) => m.email === currentUser?.email);
  const assignmentExecutives = (isManager && currentManagerPerson)
    ? executives.filter((e) => e.managerId === currentManagerPerson.id)
    : executives;

  const selectedCorporateExecPersonId = useMemo(() => {
    if (!selectedCorporate) return "";
    const key = buildExecKey(selectedCorporate.executiveFirstName, selectedCorporate.executiveLastName);
    if (!key) return "";
    const match = assignmentExecutives.find(
      (ex) => buildExecKey(ex.firstName, ex.lastName) === key
    );
    return match ? String(match.id) : "";
  }, [selectedCorporate, assignmentExecutives]);

  const detailAccountExecPersonId = useMemo(() => {
    if (!detailAccount) return "";
    const key = buildExecKey(detailAccount.executiveFirstName, detailAccount.executiveLastName);
    if (!key) return "";
    const match = assignmentExecutives.find(
      (ex) => buildExecKey(ex.firstName, ex.lastName) === key
    );
    return match ? String(match.id) : "";
  }, [detailAccount, assignmentExecutives]);

  const handleEditProfile = () => {
    setShowEditProfile(false);
    toast.success("Profile updated", {
      description: `${selectedCorp.name} profile has been saved successfully.`,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Corporates & Accounts</h2>
          <p className="text-sm text-slate-500">
            {canManageCorporates
              ? "Review accounts, assign executives, and approve customer portal access."
              : isExecutive
              ? "View corporate accounts assigned to you, their services, and contracts."
              : "Manage corporate profiles, child accounts, and overall relationship health."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => {
            resetCreateWizard();
            setShowCreateCorporateWizard(true);
          }}>
            <Building2 className="h-4 w-4 mr-2" />
            Create Corporate
          </Button>
        )}
      </div>
      {isSupervisor && (
        <div className="flex items-center gap-2">
          <Button
            variant={supervisorView === "executive" ? "primary" : "outline"}
            onClick={() => setSupervisorView("executive")}
            className="inline-flex items-center gap-2"
          >
            My Executive Work
            {supervisorBadges.executiveSideDot && supervisorView === "executive" && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Your executive queue needs attention" />
            )}
          </Button>
          <Button
            variant={supervisorView === "manager" ? "primary" : "outline"}
            onClick={() => setSupervisorView("manager")}
            className="inline-flex items-center gap-2"
          >
            Manager Oversight
            {supervisorBadges.managerSideDot && supervisorView === "manager" && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Team oversight queue needs attention" />
            )}
          </Button>
        </div>
      )}

      <div className="flex gap-4 mb-4">
         <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              className="pl-9"
              placeholder={isManager || isExecutive ? "Search accounts..." : "Search corporates..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
         </div>
         {canManageCorporates && (
           <Select
             value={executiveFilter}
             onChange={(e) => setExecutiveFilter(e.target.value)}
             className="w-64"
           >
             <option value="all">All Executives</option>
             <option value="unassigned">Unassigned</option>
             {assignmentExecutives
               .slice()
               .sort((a, b) =>
                 `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
               )
               .map((exec) => {
                 const key = buildExecKey(exec.firstName, exec.lastName);
                 return (
                   <option key={exec.id} value={key}>
                     {exec.firstName} {exec.lastName}
                   </option>
                 );
               })}
           </Select>
         )}
         {(isManager || isExecutive) && (
           <Select
             value={String(expiryFilterMonths)}
             onChange={(e) => setExpiryFilterMonths(Number(e.target.value) as 0 | 1 | 3 | 6 | 12)}
             className="w-64"
           >
             <option value="0">All Contract Timelines</option>
             <option value="1">Expiring within 1 month</option>
             <option value="3">Expiring within 3 months</option>
             <option value="6">Expiring within 6 months</option>
             <option value="12">Expiring within 12 months</option>
           </Select>
         )}
      </div>
      {(canManageCorporates || isExecutive) && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Button
            variant={alphabetFilter === "all" ? "primary" : "outline"}
            size="sm"
            onClick={() => setAlphabetFilter("all")}
          >
            All
          </Button>
          {ALPHABET_FILTER_OPTIONS.map((letter) => (
            <Button
              key={letter}
              variant={alphabetFilter === letter ? "primary" : "outline"}
              size="sm"
              onClick={() => setAlphabetFilter(letter)}
              className="min-w-9 px-3"
            >
              {letter}
            </Button>
          ))}
        </div>
      )}

      {/* ═══════════ EXECUTIVE VIEW: Own assigned accounts ═══════════ */}
      {isExecutive ? (
        loadingExecAccounts ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Left sidebar: account cards */}
            <div className="md:col-span-1 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              {paginatedExecAccounts.map((acc) => (
                <Card
                  key={acc.accountId}
                  className={`cursor-pointer transition-colors ${selectedExecAccount?.accountId === acc.accountId ? "border-mtc-blue ring-1 ring-mtc-blue" : "hover:border-mtc-blue"}`}
                  onClick={() => handleExecAccountSelect(acc)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-slate-900 text-sm leading-tight">{acc.accountName}</h3>
                      <Badge variant={
                        acc.approvalStatus === "approved" ? "success" :
                        acc.approvalStatus === "rejected" ? "danger" : "warning"
                      } className="text-[10px] shrink-0 ml-2">
                        {acc.approvalStatus === "approved" ? "Approved" : acc.approvalStatus === "rejected" ? "Rejected" : "Pending"}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 font-mono mb-1">{acc.accountNumber}</div>
                    <div className="text-sm text-slate-500 mb-3">{acc.industry || acc.accountType}</div>
                    <div className="flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-3">
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {acc.services.length} Services</span>
                      <Badge variant={acc.isActive ? "success" : "danger"} className="text-[10px]">{acc.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">Monthly spend: {formatNad(acc.monthlySpending)}</div>
                    {isAccountContactMissing(acc) && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        <AlertTriangle className="h-3 w-3" /> Profile incomplete
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {alphabetFilteredExecAccounts.length === 0 && (
                <div className="py-8 text-center text-slate-500 text-sm">
                  {execAccounts.length === 0 ? "No accounts assigned to you yet." : "No accounts match your search."}
                </div>
              )}
              {listItemsTotal > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <p className="text-xs text-slate-500">
                    Page {currentListPage} of {totalListPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentListPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentListPage === 1}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentListPage((prev) => Math.min(totalListPages, prev + 1))}
                      disabled={currentListPage >= totalListPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Right panel: selected account detail */}
            <div className="md:col-span-2">
              {selectedExecAccount ? (
                <div className="space-y-4">
                  {/* Account Summary Card */}
                  <Card className="border-mtc-blue-100 shadow-md">
                    <CardHeader className="bg-slate-50 border-b border-slate-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="h-5 w-5 text-mtc-blue" />
                            <CardTitle className="text-xl">{selectedExecAccount.accountName}</CardTitle>
                          </div>
                          <p className="text-sm text-slate-500">{selectedExecAccount.industry || selectedExecAccount.accountType} • {selectedExecAccount.accountNumber}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <Badge variant={selectedExecAccount.approvalStatus === "approved" ? "success" : selectedExecAccount.approvalStatus === "rejected" ? "danger" : "warning"}>
                            {selectedExecAccount.approvalStatus === "approved" ? "Approved" : selectedExecAccount.approvalStatus === "rejected" ? "Rejected" : "Pending"}
                          </Badge>
                          <Badge variant={selectedExecAccount.isActive ? "success" : "danger"}>{selectedExecAccount.isActive ? "Active" : "Inactive"}</Badge>
                          {isAccountContactMissing(selectedExecAccount) && (
                            <Badge variant="warning" className="inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Profile Incomplete
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-slate-200 border-b border-slate-200">
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Contact Person</div>
                          <div className={`font-semibold ${isAccountContactMissing(selectedExecAccount) ? "text-amber-700 italic" : "text-slate-900"}`}>{formatContactName(selectedExecAccount)}</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Contact Email</div>
                          {isAccountContactMissing(selectedExecAccount) ? (
                            <div className="font-semibold text-amber-700 italic text-sm">Not assigned</div>
                          ) : (
                            <div className="font-semibold text-slate-900 text-sm flex items-center justify-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400" />{formatContactEmail(selectedExecAccount)}</div>
                          )}
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Contact Phone</div>
                          <div className="font-semibold text-slate-900 text-sm flex items-center justify-center gap-1">{selectedExecAccount.contactPhone ? <><Phone className="h-3.5 w-3.5 text-slate-400" />{selectedExecAccount.contactPhone}</> : "—"}</div>
                        </div>
                      </div>

                      <div className="p-6">
                        <h4 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-500" /> Account Information
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-slate-400">Account Type</p>
                            <p className="font-medium text-slate-900 mt-0.5">{selectedExecAccount.accountType}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Industry</p>
                            <p className="font-medium text-slate-900 mt-0.5">{selectedExecAccount.industry || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Created</p>
                            <p className="font-medium text-slate-900 mt-0.5">{new Date(selectedExecAccount.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Corporate Contact Persons (executive can assign) */}
                  {selectedExecAccount.corporateId && (
                    <Card>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Users className="h-4 w-4 text-slate-500" /> Contact Person
                            </CardTitle>
                            <p className="text-xs text-slate-500 mt-1">
                              Linked to{" "}
                              <span className="font-medium text-slate-700">
                                {selectedExecAccount.corporateName || "this corporate"}
                              </span>
                              . Each corporate may have one contact person at a time —
                              remove the current contact to assign a new one.
                            </p>
                          </div>
                          {execCorporateContacts.length === 0 && !loadingExecCorporateContacts && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setShowExecContactPersonModal(true);
                                  setExecContactSearchQuery("");
                                }}
                              >
                                <UserPlus className="h-4 w-4 mr-1" /> Add Contact Person
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  resetNewExecContactForm();
                                  setShowExecCreateContactModal(true);
                                }}
                              >
                                <UserPlus className="h-4 w-4 mr-1" /> New Contact Person
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border border-slate-200 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                              <tr className="text-left text-slate-500">
                                <th className="px-4 py-2.5">Name</th>
                                <th className="px-4 py-2.5">Email</th>
                                <th className="px-4 py-2.5">Phone</th>
                                <th className="px-4 py-2.5">Portal Access</th>
                                <th className="px-4 py-2.5 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {loadingExecCorporateContacts ? (
                                <tr>
                                  <td colSpan={5} className="px-4 py-3 text-slate-500">
                                    <span className="inline-flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" /> Loading contact persons…
                                    </span>
                                  </td>
                                </tr>
                              ) : execCorporateContacts.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-4 py-3 text-slate-500">
                                    No contact person added.
                                  </td>
                                </tr>
                              ) : (
                                execCorporateContacts.map((cp) => (
                                  <tr key={cp.id}>
                                    <td className="px-4 py-3 font-medium">
                                      {cp.firstName} {cp.lastName}
                                    </td>
                                    <td className="px-4 py-3">{cp.email}</td>
                                    <td className="px-4 py-3">{cp.phone || "—"}</td>
                                    <td className="px-4 py-3">
                                      {cp.hasPortalAccess ? (
                                        <Badge variant="success">Enabled</Badge>
                                      ) : (
                                        <Badge variant="warning">Not enabled</Badge>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveExecContactPerson(cp.id)}
                                        disabled={removingExecContactId === cp.id}
                                      >
                                        {removingExecContactId === cp.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-red-600">
                                            <Trash2 className="h-4 w-4" /> Remove
                                          </span>
                                        )}
                                      </Button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Contracts */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-500" /> Contracts ({loadingExecDetail ? "..." : execDetailContracts.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingExecDetail ? (
                        <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-mtc-blue" /></div>
                      ) : execDetailContracts.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">No contracts on this account.</p>
                      ) : (
                        <div className="space-y-3">
                          {execDetailContracts.map(c => (
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
                                {c.notes && <div className="md:col-span-4"><p className="text-xs text-slate-400">Notes</p><p className="font-medium text-slate-600">{c.notes}</p></div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Service Lines */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Database className="h-4 w-4 text-slate-500" /> Service Lines ({loadingExecDetail ? "..." : execDetailServices.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingExecDetail ? (
                        <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-mtc-blue" /></div>
                      ) : execDetailServices.length === 0 ? (
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
                              {execDetailServices.map(svc => (
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
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="h-full border-slate-200 flex items-center justify-center py-16">
                  <div className="text-center text-slate-400">
                    <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Select an account to view details</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )
      ) : canManageCorporates ? (
        loadingAccounts ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-mtc-blue" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Left sidebar: account cards */}
            <div className="md:col-span-1 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              {showCorporatePanel ? paginatedCorporateRecords.map((corp) => (
                <Card
                  key={corp.corporateId}
                  className={`cursor-pointer transition-colors ${selectedCorporate?.corporateId === corp.corporateId ? "border-mtc-blue ring-1 ring-mtc-blue" : "hover:border-mtc-blue"}`}
                  onClick={() => setSelectedCorporate(corp)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-slate-900 text-sm leading-tight">{corp.corporateName}</h3>
                      <Badge variant={corp.approvalStatus === "approved" ? "success" : corp.approvalStatus === "rejected" ? "danger" : "warning"} className="text-[10px] shrink-0 ml-2">
                        {corp.approvalStatus === "approved"
                          ? "Approved"
                          : corp.approvalStatus === "rejected"
                          ? "Rejected"
                          : corp.approvalStatus === "waiting_approval"
                          ? "Waiting Approval"
                          : "Pending"}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 font-mono mb-1">{corp.corporateNumber}</div>
                    <div className="text-sm text-slate-500 mb-3">{corp.industry || corp.corporateType}</div>
                    <div className="flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-3">
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {corp.corporateType}</span>
                      <Badge variant={corp.isActive ? "success" : "danger"} className="text-[10px]">{corp.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">Monthly spend: {formatNad(corp.monthlySpending)}</div>
                    {corporatesWithIncompleteAccount.has(corp.corporateId) && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        <AlertTriangle className="h-3 w-3" /> Profile incomplete
                      </div>
                    )}
                  </CardContent>
                </Card>
              )) : paginatedAccounts.map((acc) => (
                <Card
                  key={acc.accountId}
                  className={`cursor-pointer transition-colors ${selectedAccount?.accountId === acc.accountId ? "border-mtc-blue ring-1 ring-mtc-blue" : "hover:border-mtc-blue"}`}
                  onClick={() => setSelectedAccount(acc)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-slate-900 text-sm leading-tight">{acc.accountName}</h3>
                      <Badge variant={acc.approvalStatus === "approved" ? "success" : acc.approvalStatus === "rejected" ? "danger" : "warning"} className="text-[10px] shrink-0 ml-2">
                        {acc.approvalStatus === "approved" ? "Approved" : acc.approvalStatus === "rejected" ? "Rejected" : "Pending"}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 font-mono mb-1">{acc.accountNumber}</div>
                    <div className="text-sm text-slate-500 mb-3">{acc.industry || acc.accountType}</div>
                    <div className="flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-3">
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {acc.accountType}</span>
                      <Badge variant={acc.isActive ? "success" : "danger"} className="text-[10px]">{acc.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">Monthly spend: {formatNad(acc.monthlySpending)}</div>
                    {isAccountContactMissing(acc) && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        <AlertTriangle className="h-3 w-3" /> Profile incomplete
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {(showCorporatePanel ? alphabetFilteredCorporateRecords.length === 0 : alphabetFilteredAccounts.length === 0) && (
                <div className="py-8 text-center text-slate-500 text-sm">
                  {showCorporatePanel
                    ? (corporates.length === 0 ? "No corporates created yet." : "No corporates match your search.")
                    : (accounts.length === 0 ? "No accounts created yet." : "No corporate accounts match your search.")}
                </div>
              )}
              {listItemsTotal > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <p className="text-xs text-slate-500">
                    Page {currentListPage} of {totalListPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentListPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentListPage === 1}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentListPage((prev) => Math.min(totalListPages, prev + 1))}
                      disabled={currentListPage >= totalListPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Right panel: selected account summary */}
            <div className="md:col-span-2">
              {(showCorporatePanel ? Boolean(selectedCorporate) : Boolean(selectedAccount)) ? (
                showCorporatePanel ? (
                  <Card className="h-full border-mtc-blue-100 shadow-md">
                    <CardHeader className="bg-slate-50 border-b border-slate-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="h-5 w-5 text-mtc-blue" />
                            <CardTitle className="text-xl">{selectedCorporate?.corporateName}</CardTitle>
                          </div>
                          <p className="text-sm text-slate-500">{selectedCorporate?.corporateType} • {selectedCorporate?.corporateNumber}</p>
                          <p className="text-sm text-slate-500 mt-0.5">{selectedCorporate?.businessEmail || "—"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge
                            variant={
                              selectedCorporate?.approvalStatus === "approved"
                                ? "success"
                                : selectedCorporate?.approvalStatus === "rejected"
                                ? "danger"
                                : "warning"
                            }
                          >
                          {selectedCorporate?.approvalStatus === "approved"
                            ? "Approved"
                            : selectedCorporate?.approvalStatus === "rejected"
                            ? "Rejected"
                            : selectedCorporate?.approvalStatus === "waiting_approval"
                            ? "Waiting Approval"
                            : "Pending Approval"}
                          </Badge>
                          {isAdmin && selectedCorporate?.approvalStatus === "pending" && (
                            <Button
                              onClick={async () => {
                                if (!selectedCorporate) return;
                                const hasAccounts = selectedCorporateChildAccounts.length > 0;
                                const hasContact = corporateContactPersons.length > 0;

                                if (!hasAccounts) {
                                  toast.error("Add at least one account before submitting for approval.");
                                  return;
                                }
                                if (!hasContact) {
                                  toast.error("Add a contact person (Account Manager) before submitting for approval.");
                                  return;
                                }

                                setSubmittingCorporateApproval(true);
                                try {
                                  const updated = await submitCorporateForApproval(selectedCorporate.corporateId);
                                  toast.success("Corporate submitted for approval");
                                  setSelectedCorporate(updated);
                                  await fetchAccounts();
                                } catch (err) {
                                  toast.error("Failed to submit for approval", {
                                    description: err instanceof Error ? err.message : undefined,
                                  });
                                } finally {
                                  setSubmittingCorporateApproval(false);
                                }
                              }}
                              disabled={
                                submittingCorporateApproval ||
                                selectedCorporateChildAccounts.length === 0 ||
                                corporateContactPersons.length === 0
                              }
                            >
                              {submittingCorporateApproval ? "Submitting..." : "Submit for Approval"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {isManager && selectedCorporate?.approvalStatus === "waiting_approval" && (
                        <div className="p-4 border-b border-slate-200 bg-slate-50/60">
                          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium text-slate-700">
                                Assign Executive for this Corporate
                              </label>
                              <Select
                                value={corporateExecId}
                                onChange={(e) => setCorporateExecId(e.target.value)}
                                className="w-full"
                              >
                                <option value="">Select an executive...</option>
                                {assignmentExecutives.map((exec) => (
                                  <option key={exec.id} value={String(exec.id)}>
                                    {exec.firstName} {exec.lastName}{exec.region ? ` — ${exec.region}` : ""}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <Button
                              onClick={async () => {
                                if (!selectedCorporate) return;
                                if (!corporateExecId) {
                                  toast.error("Select an executive before approving.");
                                  return;
                                }
                                setApprovingCorporate(true);
                                try {
                                  const updated = await approveCorporate(
                                    selectedCorporate.corporateId,
                                    parseInt(corporateExecId, 10)
                                  );
                                  toast.success("Corporate approved");
                                  setSelectedCorporate(updated);
                                  await fetchAccounts();
                                } catch (err) {
                                  toast.error("Failed to approve corporate", {
                                    description: err instanceof Error ? err.message : undefined,
                                  });
                                } finally {
                                  setApprovingCorporate(false);
                                }
                              }}
                              disabled={
                                approvingCorporate ||
                                selectedCorporate?.approvalStatus !== "waiting_approval" ||
                                !corporateExecId
                              }
                            >
                              {approvingCorporate ? "Approving..." : "Approve"}
                            </Button>
                          </div>
                        </div>
                      )}
                      {isManager && selectedCorporate?.approvalStatus === "approved" && (
                        <div className="p-4 border-b border-slate-200 bg-slate-50/40">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700">Executive assignment</p>
                              <p className="text-xs text-slate-500">
                                Reassign for this corporate and every child account. When you confirm, the previous executive,
                                the new executive, and each linked contact person with portal access receive a notification.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                setCorporateReassignOpen((open) => !open);
                                setCorporateReassignDraft("");
                              }}
                              disabled={reassigningCorporateExecutive || assignmentExecutives.length === 0}
                            >
                              <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                              {corporateReassignOpen ? "Close" : "Reassign executive"}
                            </Button>
                          </div>
                          {corporateReassignOpen && (
                            <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-white space-y-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-600">New executive</label>
                                <Select
                                  className="w-full sm:max-w-md h-9 text-sm"
                                  value={corporateReassignDraft}
                                  onChange={(e) => setCorporateReassignDraft(e.target.value)}
                                  disabled={reassigningCorporateExecutive}
                                >
                                  <option value="">Choose an executive…</option>
                                  {assignmentExecutives.map((exec) => (
                                    <option
                                      key={exec.id}
                                      value={String(exec.id)}
                                      disabled={String(exec.id) === selectedCorporateExecPersonId}
                                    >
                                      {exec.firstName} {exec.lastName}
                                      {exec.region ? ` — ${exec.region}` : ""}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  type="button"
                                  onClick={async () => {
                                    if (!selectedCorporate || !corporateReassignDraft) {
                                      toast.error("Select an executive first");
                                      return;
                                    }
                                    const nextPersonId = parseInt(corporateReassignDraft, 10);
                                    if (
                                      Number.isNaN(nextPersonId) ||
                                      corporateReassignDraft === selectedCorporateExecPersonId
                                    ) {
                                      toast.error("Choose a different executive than the one currently assigned");
                                      return;
                                    }
                                    await reassignExecutiveForCorporate(selectedCorporate.corporateId, nextPersonId);
                                  }}
                                  disabled={
                                    reassigningCorporateExecutive ||
                                    !corporateReassignDraft ||
                                    corporateReassignDraft === selectedCorporateExecPersonId
                                  }
                                >
                                  {reassigningCorporateExecutive ? (
                                    <span className="inline-flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" /> Working…
                                    </span>
                                  ) : (
                                    "Confirm reassignment"
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setCorporateReassignOpen(false);
                                    setCorporateReassignDraft("");
                                  }}
                                  disabled={reassigningCorporateExecutive}
                                >
                                  Cancel
                                </Button>
                              </div>
                              {assignmentExecutives.length === 0 && (
                                <p className="text-xs text-amber-700">
                                  No executives on your team were found. Check that your manager profile is linked correctly.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Assigned Executive</div>
                          <div className="font-semibold text-slate-900">
                            {selectedCorporate?.executiveFirstName
                              ? `${selectedCorporate.executiveFirstName} ${selectedCorporate.executiveLastName ?? ""}`.trim()
                              : <span className="text-amber-600">Not assigned yet</span>}
                          </div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Expired Child Accounts</div>
                          <div className="font-semibold text-amber-600">{selectedCorporate?.expiredAccountsCount ?? 0}</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Total Renewals</div>
                          <div className="font-semibold text-blue-600">{selectedCorporate?.renewalCount ?? 0}</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Total Active Tickets</div>
                          <div className="font-semibold text-slate-900">
                            {selectedCorporate ? corporateActiveTicketCounts[selectedCorporate.corporateId] || 0 : 0}
                          </div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Monthly Spending</div>
                          <div className="font-semibold text-emerald-700">{formatNad(selectedCorporate?.monthlySpending)}</div>
                        </div>
                      </div>

                      <div className="p-6 space-y-8">
                        <div>
                          <h4 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                            <Users className="h-4 w-4 text-slate-500" /> Child Accounts
                          </h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Account ID</TableHead>
                                <TableHead>Location / Dept</TableHead>
                                <TableHead>Services</TableHead>
                                  <TableHead>Monthly Spending</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedCorporateChildAccounts.length === 0 ? (
                                <TableRow>
                                  <td colSpan={5} className="p-4 text-slate-500">No sub-accounts yet.</td>
                                </TableRow>
                              ) : (
                                selectedCorporateChildAccounts.map((account) => (
                                  <TableRow key={account.accountId}>
                                    <TableCell className="font-medium">{account.accountNumber}</TableCell>
                                    <TableCell>{account.accountName}</TableCell>
                                    <TableCell>{account.accountType}</TableCell>
                                    <TableCell>{formatNad(account.monthlySpending)}</TableCell>
                                    <TableCell className="text-right">
                                      <Button variant="ghost" size="sm" onClick={() => handleOpenDetail(account)}>Details</Button>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                          <div className="flex justify-end mt-4">
                            {isAdmin && selectedCorporate && <Button onClick={() => handleStartAddAccount(selectedCorporate)}>Add Account</Button>}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                            <Users className="h-4 w-4 text-slate-500" /> Contact Persons
                          </h4>
                          <div className="rounded-lg border border-slate-200 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50">
                                <tr className="text-left text-slate-500">
                                  <th className="px-4 py-2.5">Name</th>
                                  <th className="px-4 py-2.5">Email</th>
                                  <th className="px-4 py-2.5">Phone</th>
                                  <th className="px-4 py-2.5">Position</th>
                                  <th className="px-4 py-2.5">Portal Access</th>
                                  {isAdmin && <th className="px-4 py-2.5 text-right">Action</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {loadingCorporateContacts ? (
                                  <tr>
                                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-3 text-slate-500">
                                      <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Loading contact persons…
                                      </span>
                                    </td>
                                  </tr>
                                ) : corporateContactPersons.length === 0 ? (
                                  <tr>
                                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-3 text-slate-500">
                                      No contact person added.
                                    </td>
                                  </tr>
                                ) : (
                                  corporateContactPersons.map((cp) => (
                                    <tr key={cp.id}>
                                      <td className="px-4 py-3 font-medium">
                                        {cp.firstName} {cp.lastName}
                                      </td>
                                      <td className="px-4 py-3">{cp.email}</td>
                                      <td className="px-4 py-3">{cp.phone || "—"}</td>
                                      <td className="px-4 py-3">Account Manager</td>
                                      <td className="px-4 py-3">
                                        {cp.hasPortalAccess ? (
                                          <Badge variant="success">Enabled</Badge>
                                        ) : (
                                          <Badge variant="warning">Not enabled</Badge>
                                        )}
                                      </td>
                                      {isAdmin && (
                                        <td className="px-4 py-3 text-right">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveContactPerson(cp.id)}
                                            disabled={removingContactId === cp.id}
                                          >
                                            {removingContactId === cp.id ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <span className="inline-flex items-center gap-1 text-red-600">
                                                <Trash2 className="h-4 w-4" /> Remove
                                              </span>
                                            )}
                                          </Button>
                                        </td>
                                      )}
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                          {isAdmin && (
                            <div className="flex justify-end mt-4 gap-2">
                              <Button onClick={() => { setShowContactPersonModal(true); setContactSearchQuery(""); }}>
                                <UserPlus className="h-4 w-4 mr-1" /> Add Contact Person
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="h-full border-mtc-blue-100 shadow-md">
                    <CardHeader className="bg-slate-50 border-b border-slate-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 className="h-5 w-5 text-mtc-blue" />
                            <CardTitle className="text-xl">{selectedAccount!.accountName}</CardTitle>
                          </div>
                          <p className="text-sm text-slate-500">{selectedAccount!.industry || selectedAccount!.accountType} • {selectedAccount!.accountNumber}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <Badge variant={
                            selectedAccount!.approvalStatus === "approved" ? "success" :
                            selectedAccount!.approvalStatus === "rejected" ? "danger" : "warning"
                          }>
                            {selectedAccount!.approvalStatus === "approved" ? "Approved" : selectedAccount!.approvalStatus === "rejected" ? "Rejected" : "Pending Approval"}
                          </Badge>
                          {isAccountContactMissing(selectedAccount) && (
                            <Badge variant="warning" className="inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Profile Incomplete
                            </Badge>
                          )}
                          <Button size="sm" onClick={() => handleOpenDetail(selectedAccount!)}>
                            View Details & Manage
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200">
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Contact Person</div>
                          <div className={`font-semibold ${isAccountContactMissing(selectedAccount) ? "text-amber-700 italic" : "text-slate-900"}`}>{formatContactName(selectedAccount)}</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Contact Email</div>
                          <div className={`font-semibold text-sm ${isAccountContactMissing(selectedAccount) ? "text-amber-700 italic" : "text-slate-900"}`}>{formatContactEmail(selectedAccount)}</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Assigned Executive</div>
                          <div className="font-semibold text-slate-900">
                            {selectedAccount!.executiveId
                              ? (selectedAccount!.executiveFirstName ? `${selectedAccount!.executiveFirstName} ${selectedAccount!.executiveLastName}` : `ID #${selectedAccount!.executiveId}`)
                              : <span className="text-amber-600">Not Assigned</span>
                            }
                          </div>
                        </div>
                      </div>
                      <div className="p-6">
                        <h4 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-500" /> Account Information
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          <div><p className="text-xs text-slate-400">Account Type</p><p className="font-medium text-slate-900 mt-0.5">{selectedAccount!.accountType}</p></div>
                          <div><p className="text-xs text-slate-400">Industry</p><p className="font-medium text-slate-900 mt-0.5">{selectedAccount!.industry || "—"}</p></div>
                          <div><p className="text-xs text-slate-400">Created</p><p className="font-medium text-slate-900 mt-0.5">{new Date(selectedAccount!.created_at).toLocaleDateString()}</p></div>
                          <div><p className="text-xs text-slate-400">Contact Phone</p><p className="font-medium text-slate-900 mt-0.5">{selectedAccount!.contactPhone || "—"}</p></div>
                          <div><p className="text-xs text-slate-400">Status</p><Badge variant={selectedAccount!.isActive ? "success" : "danger"} className="mt-0.5">{selectedAccount!.isActive ? "Active" : "Inactive"}</Badge></div>
                          <div><p className="text-xs text-slate-400">Approval Status</p><Badge variant={selectedAccount!.approvalStatus === "approved" ? "success" : selectedAccount!.approvalStatus === "rejected" ? "danger" : "warning"} className="mt-0.5">{selectedAccount!.approvalStatus}</Badge></div>
                        </div>
                        {selectedAccount!.approvalStatus === "pending" && (
                          <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
                            <p className="text-sm text-amber-800 flex items-center gap-2">
                              <UserPlus className="h-4 w-4" />
                              This account is pending approval. Click <strong>"View Details & Manage"</strong> to assign an executive and approve.
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              ) : (
                <Card className="h-full border-slate-200 flex items-center justify-center py-16">
                  <div className="text-center text-slate-400">
                    <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{showCorporatePanel ? "Select a corporate to view details" : "Select an account to view details"}</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )
      ) : (
        /* ═══════════ NON-MANAGER VIEW: Original mock data ═══════════ */
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-1 space-y-4">
            {filteredCorps.map((corp) => (
              <Card
                key={corp.id}
                className={`cursor-pointer transition-colors ${selectedCorp.id === corp.id ? "border-mtc-blue ring-1 ring-mtc-blue" : "hover:border-mtc-blue"}`}
                onClick={() => setSelectedCorp(corp)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-slate-900">{corp.name}</h3>
                    <Badge variant={
                      corp.health === 'Healthy' ? 'success' : 
                      corp.health === 'Warning' ? 'warning' : 'danger'
                    }>{corp.health}</Badge>
                  </div>
                  <div className="text-sm text-slate-500 mb-3">{corp.industry}</div>
                  <div className="flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {corp.accounts} Accounts</span>
                    <span className="flex items-center gap-1 text-blue-500 font-medium"><Star className="h-3 w-3 fill-current" /> {corp.rating}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredCorps.length === 0 && (
              <div className="py-8 text-center text-slate-500 text-sm">No corporates match your search.</div>
            )}
          </div>

          <div className="md:col-span-2">
            <Card className="h-full border-mtc-blue-100 shadow-md">
               <CardHeader className="bg-slate-50 border-b border-slate-200">
                 <div className="flex justify-between items-start">
                   <div>
                     <div className="flex items-center gap-2 mb-1">
                       <Building2 className="h-5 w-5 text-mtc-blue" />
                       <CardTitle className="text-xl">{selectedCorp.name}</CardTitle>
                     </div>
                     <p className="text-sm text-slate-500">{selectedCorp.industry} • Client since {selectedCorp.since}</p>
                   </div>
                   <Button size="sm" onClick={() => setShowEditProfile(true)}>Edit Profile</Button>
                 </div>
               </CardHeader>
               <CardContent className="p-0">
                 <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200">
                   <div className="p-4 text-center">
                     <div className="text-sm text-slate-500 mb-1">Assigned Executive</div>
                     <div className="font-semibold text-slate-900">{selectedCorp.exec}</div>
                   </div>
                   <div className="p-4 text-center">
                     <div className="text-sm text-slate-500 mb-1">Total Active Tickets</div>
                     <div className="font-semibold text-slate-900">{selectedCorp.accounts > 20 ? 8 : 4}</div>
                   </div>
                   <div className="p-4 text-center">
                     <div className="text-sm text-slate-500 mb-1">Avg Rating (YTD)</div>
                     <div className="font-semibold text-blue-500 flex items-center justify-center gap-1">
                       {selectedCorp.rating} <Star className="h-4 w-4 fill-current" />
                     </div>
                   </div>
                 </div>

                 <div className="p-6">
                   <h4 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                     <Users className="h-4 w-4 text-slate-500" /> Child Accounts
                   </h4>
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>Account ID</TableHead>
                         <TableHead>Location / Dept</TableHead>
                         <TableHead>Services</TableHead>
                         <TableHead className="text-right">Action</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {selectedCorp.childAccounts.map((acc) => (
                         <TableRow key={acc.id}>
                           <TableCell className="font-medium">{acc.id}</TableCell>
                           <TableCell>{acc.loc}</TableCell>
                           <TableCell>{acc.services}</TableCell>
                           <TableCell className="text-right">
                             <Button variant="ghost" size="sm" onClick={() => setShowAccountDetail(acc)}>Details</Button>
                           </TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                 </div>
               </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════ MANAGER: Account Detail + Assign/Approve Modal ═══════════ */}
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
                <Badge variant={detailAccount.approvalStatus === "approved" ? "success" : detailAccount.approvalStatus === "rejected" ? "danger" : "warning"}>
                  {detailAccount.approvalStatus === "approved" ? "Approved" : detailAccount.approvalStatus === "rejected" ? "Rejected" : "Pending Approval"}
                </Badge>
                <Badge variant={detailAccount.isActive ? "success" : "danger"}>{detailAccount.isActive ? "Active" : "Inactive"}</Badge>
                {isAccountContactMissing(detailAccount) && (
                  <Badge variant="warning" className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Profile Incomplete
                  </Badge>
                )}
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
                    <div>
                      <p className="text-xs text-slate-400">Contact Name</p>
                      <p className={`text-sm font-medium mt-0.5 ${isAccountContactMissing(detailAccount) ? "text-amber-700 italic" : "text-slate-900"}`}>
                        {formatContactName(detailAccount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Contact Email</p>
                      <p className={`text-sm font-medium mt-0.5 ${isAccountContactMissing(detailAccount) ? "text-amber-700 italic" : "text-slate-900"}`}>
                        {formatContactEmail(detailAccount)}
                      </p>
                    </div>
                    <div><p className="text-xs text-slate-400">Contact Phone</p><p className="text-sm font-medium text-slate-900 mt-0.5">{detailAccount.contactPhone || "—"}</p></div>
                    <div>
                      <p className="text-xs text-slate-400">Assigned Executive</p>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">
                        {detailAccount.executiveId
                          ? (detailAccount.executiveFirstName ? `${detailAccount.executiveFirstName} ${detailAccount.executiveLastName}` : `ID #${detailAccount.executiveId}`)
                          : "—"
                        }
                      </p>
                    </div>
                    {detailAccount.parentAccountId && (
                      <div><p className="text-xs text-slate-400">Parent Account ID</p><p className="text-sm font-medium text-slate-900 mt-0.5">#{detailAccount.parentAccountId}</p></div>
                    )}
                  </div>
                  {isManager && detailAccount.corporateId && detailAccount.approvalStatus === "approved" && (
                    <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-white space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div>
                          <label className="text-xs font-medium text-slate-600">Executive assignment</label>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Reassignment is at corporate level (all child accounts stay in sync). Confirm to notify
                            executives and contact persons with portal access.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            setDetailReassignOpen((open) => !open);
                            setDetailReassignDraft("");
                          }}
                          disabled={reassigningCorporateExecutive || assignmentExecutives.length === 0}
                        >
                          <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                          {detailReassignOpen ? "Close" : "Reassign executive"}
                        </Button>
                      </div>
                      {detailReassignOpen && (
                        <div className="pt-1 space-y-3 border-t border-slate-100">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">New executive</label>
                            <Select
                              className="w-full max-w-md h-9 text-sm"
                              value={detailReassignDraft}
                              onChange={(e) => setDetailReassignDraft(e.target.value)}
                              disabled={reassigningCorporateExecutive}
                            >
                              <option value="">Choose an executive…</option>
                              {assignmentExecutives.map((exec) => (
                                <option
                                  key={exec.id}
                                  value={String(exec.id)}
                                  disabled={String(exec.id) === detailAccountExecPersonId}
                                >
                                  {exec.firstName} {exec.lastName}
                                  {exec.region ? ` — ${exec.region}` : ""}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              type="button"
                              onClick={async () => {
                                if (!detailAccount.corporateId || !detailReassignDraft) {
                                  toast.error("Select an executive first");
                                  return;
                                }
                                const nextPersonId = parseInt(detailReassignDraft, 10);
                                if (
                                  Number.isNaN(nextPersonId) ||
                                  detailReassignDraft === detailAccountExecPersonId
                                ) {
                                  toast.error("Choose a different executive than the one currently assigned");
                                  return;
                                }
                                await reassignExecutiveForCorporate(detailAccount.corporateId, nextPersonId);
                              }}
                              disabled={
                                reassigningCorporateExecutive ||
                                !detailReassignDraft ||
                                detailReassignDraft === detailAccountExecPersonId
                              }
                            >
                              {reassigningCorporateExecutive ? (
                                <span className="inline-flex items-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Working…
                                </span>
                              ) : (
                                "Confirm reassignment"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDetailReassignOpen(false);
                                setDetailReassignDraft("");
                              }}
                              disabled={reassigningCorporateExecutive}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 mb-3">
                    <Input
                      placeholder="Cellphone Number (optional)"
                      value={newDetailService.msisdn ?? ""}
                      onChange={(e) => setNewDetailService((f) => ({ ...f, msisdn: e.target.value }))}
                    />
                    <Select
                      value={newDetailService.serviceType}
                      onChange={(e) => setNewDetailService((f) => ({ ...f, serviceType: e.target.value }))}
                    >
                      <option value="">Select service type...</option>
                      <option value="Mobile Voice">Mobile Voice</option>
                      <option value="Fiber Internet">Fiber Internet</option>
                      <option value="LTE Data">LTE Data</option>
                      <option value="MPLS VPN">MPLS VPN</option>
                      <option value="Cloud Services">Cloud Services</option>
                      <option value="IoT">IoT</option>
                      <option value="Server Colocation">Server Colocation</option>
                      <option value="Other">Other</option>
                    </Select>
                    <Select
                      value={newDetailService.status ?? "active"}
                      onChange={(e) => setNewDetailService((f) => ({ ...f, status: e.target.value as ServicePayload["status"] }))}
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="inactive">Inactive</option>
                    </Select>
                    <Button onClick={handleAddDetailService} disabled={addingDetailService}>
                      {addingDetailService ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding...</> : "Add Service Line"}
                    </Button>
                  </div>
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
                            <th className="text-left px-4 py-2.5">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detailServices.map(svc => (
                            <tr key={svc.serviceId}>
                              <td className="px-4 py-2.5 font-mono text-xs">{svc.msisdn || "—"}</td>
                              <td className="px-4 py-2.5">{svc.serviceType}</td>
                              <td className="px-4 py-2.5">
                                <Select
                                  value={svc.status}
                                  onChange={(e) => handleUpdateDetailServiceStatus(svc.serviceId, e.target.value as "active" | "suspended" | "inactive")}
                                  disabled={updatingServiceId === svc.serviceId}
                                >
                                  <option value="active">active</option>
                                  <option value="suspended">suspended</option>
                                  <option value="inactive">inactive</option>
                                </Select>
                              </td>
                              <td className="px-4 py-2.5 text-slate-400 text-xs">{svc.created_at ? new Date(svc.created_at).toLocaleDateString() : "—"}</td>
                              <td className="px-4 py-2.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteDetailService(svc.serviceId)}
                                  disabled={deletingServiceId === svc.serviceId}
                                >
                                  {deletingServiceId === svc.serviceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-600" />}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {isManager && detailAccount.approvalStatus === "approved" && !isAccountContactMissing(detailAccount) && (
                  <div className="border-t border-slate-200 pt-6">
                    <div className="p-4 rounded-lg bg-green-50 border border-green-200 flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-green-800">Account Approved</p>
                        <p className="text-xs text-green-700 mt-0.5">
                          Login credentials have been sent to {detailAccount.contactEmail}. Executive assigned:{" "}
                          {detailAccount.executiveFirstName ? `${detailAccount.executiveFirstName} ${detailAccount.executiveLastName}` : `ID #${detailAccount.executiveId}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {isManager && detailAccount.approvalStatus === "approved" && isAccountContactMissing(detailAccount) && (
                  <div className="border-t border-slate-200 pt-6">
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Profile Incomplete</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          No contact person has been assigned to this account yet. Add a contact name, email, and phone before sending portal credentials.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end px-6 py-4 border-t border-slate-200">
              <Button variant="outline" onClick={handleCloseDetail}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ EXECUTIVE: Select Contact Person Modal ═══════════ */}
      {isExecutive && showExecContactPersonModal && selectedExecAccount?.corporateId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-mtc-blue" />
                  Select Contact Person
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Choose an existing contact person to link to{" "}
                  <span className="font-medium text-slate-700">
                    {selectedExecAccount.corporateName || "this corporate"}
                  </span>
                  . A contact person can be linked to multiple corporates.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowExecContactPersonModal(false);
                  setExecContactSearchQuery("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4 flex-1 overflow-hidden flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  className="pl-9"
                  placeholder="Search by name, email, phone, or current corporate…"
                  value={execContactSearchQuery}
                  onChange={(e) => setExecContactSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="rounded-lg border border-slate-200 overflow-y-auto flex-1">
                {execAccountManagers.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500 text-center space-y-3">
                    <div>
                      You have no contact persons linked to your corporates yet.
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowExecContactPersonModal(false);
                        setExecContactSearchQuery("");
                        resetNewExecContactForm();
                        setShowExecCreateContactModal(true);
                      }}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Create New Contact Person
                    </Button>
                  </div>
                ) : availableExecContactCandidates.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500 text-center">
                    {execContactSearchQuery
                      ? "No contact persons match your search."
                      : "All existing contact persons are already linked to this corporate."}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left text-slate-500">
                        <th className="px-4 py-2.5">Name</th>
                        <th className="px-4 py-2.5">Email</th>
                        <th className="px-4 py-2.5">Phone</th>
                        <th className="px-4 py-2.5">Current Corporate</th>
                        <th className="px-4 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {availableExecContactCandidates.map((cp) => (
                        <tr key={cp.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {cp.firstName} {cp.lastName}
                          </td>
                          <td className="px-4 py-3 text-slate-700 inline-flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" /> {cp.email}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {cp.phone ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3 text-slate-400" /> {cp.phone}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{cp.department || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              onClick={() => handleAssignExecContactPerson(cp.id)}
                              disabled={assigningExecContactId !== null}
                            >
                              {assigningExecContactId === cp.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Linking…
                                </span>
                              ) : (
                                "Select"
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                Can't find the contact person you're looking for? Use{" "}
                <span className="font-medium">New Contact Person</span> to create one
                and link it to this corporate.
              </div>
            </CardContent>
            <div className="flex flex-col-reverse gap-2 px-6 py-4 border-t border-slate-200 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setShowExecContactPersonModal(false);
                  setExecContactSearchQuery("");
                }}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setShowExecContactPersonModal(false);
                  setExecContactSearchQuery("");
                  resetNewExecContactForm();
                  setShowExecCreateContactModal(true);
                }}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Create New Contact Person
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════ EXECUTIVE: Create New Contact Person Modal ═══════════ */}
      {isExecutive && showExecCreateContactModal && selectedExecAccount?.corporateId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-mtc-blue" />
                  New Contact Person
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Create a new contact person and link them to{" "}
                  <span className="font-medium text-slate-700">
                    {selectedExecAccount.corporateName || "this corporate"}
                  </span>
                  .
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowExecCreateContactModal(false);
                  resetNewExecContactForm();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">First name</label>
                  <Input
                    className="mt-1"
                    value={newExecContactForm.firstName}
                    onChange={(e) =>
                      setNewExecContactForm((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Last name</label>
                  <Input
                    className="mt-1"
                    value={newExecContactForm.lastName}
                    onChange={(e) =>
                      setNewExecContactForm((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Email</label>
                <Input
                  className="mt-1"
                  type="email"
                  value={newExecContactForm.email}
                  onChange={(e) =>
                    setNewExecContactForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="john.doe@example.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Phone (optional)</label>
                <Input
                  className="mt-1"
                  value={newExecContactForm.phone ?? ""}
                  onChange={(e) =>
                    setNewExecContactForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="+264 81 000 0000"
                />
              </div>
            </CardContent>
            <div className="flex flex-col-reverse gap-2 px-6 py-4 border-t border-slate-200 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowExecCreateContactModal(false);
                  resetNewExecContactForm();
                }}
                disabled={creatingExecContact}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateExecContactPerson} disabled={creatingExecContact}>
                {creatingExecContact ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                  </span>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-1" /> Create &amp; Link
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════ Add / Select Contact Person Modal (admin) ═══════════ */}
      {isAdmin && showContactPersonModal && selectedCorporate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-mtc-blue" />
                  Select Contact Person
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Choose an existing contact person to link to{" "}
                  <span className="font-medium text-slate-700">{selectedCorporate.corporateName}</span>.
                  A contact person can be linked to multiple corporates.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowContactPersonModal(false); setContactSearchQuery(""); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4 flex-1 overflow-hidden flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  className="pl-9"
                  placeholder="Search by name, email, phone, or current corporate…"
                  value={contactSearchQuery}
                  onChange={(e) => setContactSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="rounded-lg border border-slate-200 overflow-y-auto flex-1">
                {accountManagers.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500 text-center space-y-3">
                    <div>No contact persons exist yet.</div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowContactPersonModal(false);
                        setContactSearchQuery("");
                        navigate(profileHref);
                      }}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Create New Account Manager
                    </Button>
                  </div>
                ) : availableContactCandidates.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500 text-center">
                    {contactSearchQuery
                      ? "No contact persons match your search."
                      : "All existing contact persons are already linked to this corporate."}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left text-slate-500">
                        <th className="px-4 py-2.5">Name</th>
                        <th className="px-4 py-2.5">Email</th>
                        <th className="px-4 py-2.5">Phone</th>
                        <th className="px-4 py-2.5">Current Corporate</th>
                        <th className="px-4 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {availableContactCandidates.map((cp) => (
                        <tr key={cp.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {cp.firstName} {cp.lastName}
                          </td>
                          <td className="px-4 py-3 text-slate-700 inline-flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" /> {cp.email}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {cp.phone ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3 text-slate-400" /> {cp.phone}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{cp.department || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              onClick={() => handleAssignContactPerson(cp.id)}
                              disabled={assigningContactId !== null}
                            >
                              {assigningContactId === cp.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Linking…
                                </span>
                              ) : (
                                "Select"
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                Can't find the contact person you're looking for? Create a new
                Account Manager on the My Profile page, then come back here to
                link them to this corporate.
              </div>
            </CardContent>
            <div className="flex flex-col-reverse gap-2 px-6 py-4 border-t border-slate-200 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={() => { setShowContactPersonModal(false); setContactSearchQuery(""); }}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setShowContactPersonModal(false);
                  setContactSearchQuery("");
                  navigate(profileHref);
                }}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Create New Account Manager
              </Button>
            </div>
          </Card>
        </div>
      )}

      <AdminCorporateWizard
        show={isAdmin && showCreateCorporateWizard}
        wizardStep={wizardStep}
        setWizardStep={setWizardStep}
        resetCreateWizard={resetCreateWizard}
        submittingWizard={submittingWizard}
        managers={managers}
        corporateForm={corporateForm}
        setCorporateForm={setCorporateForm}
        childAccountForm={childAccountForm}
        setChildAccountForm={setChildAccountForm}
        childAccountExtraForm={childAccountExtraForm as any}
        setChildAccountExtraForm={setChildAccountExtraForm as any}
        contractForm={contractForm}
        setContractForm={setContractForm}
        serviceLines={serviceLines}
        setServiceLines={setServiceLines}
        handleCreateCorporateStep={handleCreateCorporateStep}
        handleCreateAccountStep={handleCreateAccountStep}
        handleCreateContractStep={handleCreateContractStep}
        handleCreateServicesStep={handleCreateServicesStep}
      />

      {/* ═══════════ NON-MANAGER: Account Detail Modal (mock data) ═══════════ */}
      {showAccountDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle>Account Details — {showAccountDetail.id}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAccountDetail(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block mb-1">Account ID</span>
                  <span className="font-medium text-slate-900">{showAccountDetail.id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Corporate</span>
                  <span className="font-medium text-slate-900">{selectedCorp.name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Location / Department</span>
                  <span className="font-medium text-slate-900">{showAccountDetail.loc}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Active Services</span>
                  <span className="font-medium text-slate-900">{showAccountDetail.services}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Status</span>
                  <Badge variant="success">Active</Badge>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Open Tickets</span>
                  <span className="font-medium text-slate-900">1</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <Button variant="outline" onClick={() => setShowAccountDetail(null)}>Close</Button>
                <Button onClick={() => { setShowAccountDetail(null); toast.success("Navigating to account management..."); }}>Manage Account</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Profile Modal (non-manager) */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle>Edit Corporate Profile</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowEditProfile(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Corporate Name</label>
                <Input defaultValue={selectedCorp.name} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Industry</label>
                <Input defaultValue={selectedCorp.industry} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Assigned Executive</label>
                <Input defaultValue={selectedCorp.exec} />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <Button variant="outline" onClick={() => setShowEditProfile(false)}>Cancel</Button>
                <Button onClick={handleEditProfile}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
