import { useState, useEffect, useCallback } from "react";
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
import { Building2, Search, Users, Star, X, FileText, Database, Loader2, CheckCircle, UserPlus, Trash2 } from "lucide-react";
import {
  getAccounts, getAccountContracts, getAccountServices, getPersonsByType,
  createAccount, createContract, createService, createCorporate, getCorporates,
  updateAccountServiceStatus, deleteAccountService,
  submitCorporateForApproval, approveCorporate,
  type AccountRecord, type ContractRecord, type ServiceRecord, type PersonRecord, type CorporateRecord,
  type AccountPayload, type ContractPayload, type ServicePayload, type CorporatePayload,
} from "../api/adminApi";
import { getMyAccounts, type ExecutiveAccountRecord } from "../api/authApi";
import { Mail, Phone } from "lucide-react";
import AdminCorporateWizard from "./admin/adminCorporateWizard";
import { isExecutiveRole, isManagerRole, isSupervisorRole } from "../utils/roleCapabilities";
import type { StaffLayoutOutletContext } from "../layoutOutletContext";
import { defaultSupervisorBadges } from "../hooks/useSupervisorHybridBadges";

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

export default function Corporates() {
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

  // Shared state
  const [searchQuery, setSearchQuery] = useState("");

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

  // Approve modal state
  const [corporateExecId, setCorporateExecId] = useState<string>("");

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
  const [execAccounts, setExecAccounts] = useState<ExecutiveAccountRecord[]>([]);
  const [loadingExecAccounts, setLoadingExecAccounts] = useState(false);
  const [selectedExecAccount, setSelectedExecAccount] = useState<ExecutiveAccountRecord | null>(null);
  const [execDetailContracts, setExecDetailContracts] = useState<ContractRecord[]>([]);
  const [execDetailServices, setExecDetailServices] = useState<ServiceRecord[]>([]);
  const [loadingExecDetail, setLoadingExecDetail] = useState(false);

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
        if (corps.length > 0 && !selectedCorporate) setSelectedCorporate(corps[0]);
      } else if (accs.length > 0 && !selectedAccount) {
        setSelectedAccount(accs[0]);
      }
    } catch (err) {
      toast.error("Failed to load accounts", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoadingAccounts(false);
    }
  }, [showCorporatePanel, selectedAccount, selectedCorporate]);

  useEffect(() => {
    if (canManageCorporates) fetchAccounts();
  }, [canManageCorporates, fetchAccounts]);

  const selectedAccountManager =
    selectedCorporate?.corporateId != null
      ? accountManagers.find((am) => am.corporateId === selectedCorporate.corporateId) ?? null
      : null;

  // Load detail for selected executive account (uses inline data from getMyAccounts)
  const handleExecAccountSelect = (acc: ExecutiveAccountRecord) => {
    setSelectedExecAccount(acc);
    setExecDetailContracts(acc.contracts as unknown as ContractRecord[]);
    setExecDetailServices(acc.services as unknown as ServiceRecord[]);
  };

  // Fetch executive's own accounts
  useEffect(() => {
    if (!isExecutive) return;
    setLoadingExecAccounts(true);
    getMyAccounts()
      .then((accs) => {
        setExecAccounts(accs);
        if (accs.length > 0) handleExecAccountSelect(accs[0]);
      })
      .catch((err) => toast.error("Failed to load accounts", { description: err instanceof Error ? err.message : undefined }))
      .finally(() => setLoadingExecAccounts(false));
  }, [isExecutive]);

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
  const filteredExecAccounts = execAccounts.filter(a =>
    searchQuery === "" ||
    a.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.accountNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.industry || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCorps = mockCorporates.filter(c =>
    searchQuery === "" ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.industry.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAccounts = accounts.filter(a =>
    searchQuery === "" ||
    a.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.accountNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.industry || "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredCorporateRecords = corporates.filter((c) =>
    searchQuery === "" ||
    c.corporateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.corporateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.industry || "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  const selectedCorporateChildAccounts = selectedCorporate
    ? accounts.filter((account) => account.corporateId === selectedCorporate.corporateId)
    : [];
  const selectedCorporateContacts: Array<{
    name: string;
    email: string;
    phone: string;
    position: string;
    username: string;
    access: string;
  }> = [];

  // Manager/supervisor should only see executives under their own team.
  const currentManagerPerson = managers.find((m) => m.email === currentUser?.email);
  const assignmentExecutives = (isManager && currentManagerPerson)
    ? executives.filter((e) => e.managerId === currentManagerPerson.id)
    : executives;

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
      </div>

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
              {filteredExecAccounts.map((acc) => (
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
                  </CardContent>
                </Card>
              ))}
              {filteredExecAccounts.length === 0 && (
                <div className="py-8 text-center text-slate-500 text-sm">
                  {execAccounts.length === 0 ? "No accounts assigned to you yet." : "No accounts match your search."}
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
                        <div className="flex items-center gap-2">
                          <Badge variant={selectedExecAccount.approvalStatus === "approved" ? "success" : selectedExecAccount.approvalStatus === "rejected" ? "danger" : "warning"}>
                            {selectedExecAccount.approvalStatus === "approved" ? "Approved" : selectedExecAccount.approvalStatus === "rejected" ? "Rejected" : "Pending"}
                          </Badge>
                          <Badge variant={selectedExecAccount.isActive ? "success" : "danger"}>{selectedExecAccount.isActive ? "Active" : "Inactive"}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-slate-200 border-b border-slate-200">
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Contact Person</div>
                          <div className="font-semibold text-slate-900">{selectedExecAccount.contactFirstName} {selectedExecAccount.contactLastName}</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Contact Email</div>
                          <div className="font-semibold text-slate-900 text-sm flex items-center justify-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400" />{selectedExecAccount.contactEmail}</div>
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
              {showCorporatePanel ? filteredCorporateRecords.map((corp) => (
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
                  </CardContent>
                </Card>
              )) : filteredAccounts.map((acc) => (
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
                  </CardContent>
                </Card>
              ))}
              {(showCorporatePanel ? filteredCorporateRecords.length === 0 : filteredAccounts.length === 0) && (
                <div className="py-8 text-center text-slate-500 text-sm">
                  {showCorporatePanel
                    ? (corporates.length === 0 ? "No corporates created yet." : "No corporates match your search.")
                    : (accounts.length === 0 ? "No accounts created yet." : "No corporate accounts match your search.")}
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
                                const hasContact = Boolean(selectedAccountManager);

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
                                !selectedAccountManager
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
                      <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200">
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Assigned Executive</div>
                          <div className="font-semibold text-slate-900">
                            {selectedCorporate?.executiveFirstName
                              ? `${selectedCorporate.executiveFirstName} ${selectedCorporate.executiveLastName ?? ""}`.trim()
                              : <span className="text-amber-600">Not assigned yet</span>}
                          </div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Total Active Tickets</div>
                          <div className="font-semibold text-slate-900">0</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Avg Rating (YTD)</div>
                          <div className="font-semibold text-blue-600">4.8 ⭐</div>
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
                                <TableHead className="text-right">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedCorporateChildAccounts.length === 0 ? (
                                <TableRow>
                                  <td colSpan={4} className="p-4 text-slate-500">No sub-accounts yet.</td>
                                </TableRow>
                              ) : (
                                selectedCorporateChildAccounts.map((account) => (
                                  <TableRow key={account.accountId}>
                                    <TableCell className="font-medium">{account.accountNumber}</TableCell>
                                    <TableCell>{account.accountName}</TableCell>
                                    <TableCell>{account.accountType}</TableCell>
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
                                  <th className="px-4 py-2.5">Username</th>
                                  <th className="px-4 py-2.5">Portal Access</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {selectedAccountManager ? (
                                  <tr>
                                    <td className="px-4 py-3 font-medium">
                                      {selectedAccountManager.firstName} {selectedAccountManager.lastName}
                                    </td>
                                    <td className="px-4 py-3">{selectedAccountManager.email}</td>
                                    <td className="px-4 py-3">{selectedAccountManager.phone || "—"}</td>
                                    <td className="px-4 py-3">Account Manager</td>
                                    <td className="px-4 py-3">{selectedAccountManager.email}</td>
                                    <td className="px-4 py-3">
                                      {selectedAccountManager.hasPortalAccess ? (
                                        <Badge variant="success">Enabled</Badge>
                                      ) : (
                                        <Badge variant="warning">Not enabled</Badge>
                                      )}
                                    </td>
                                  </tr>
                                ) : (
                                  <tr>
                                    <td colSpan={6} className="px-4 py-3 text-slate-500">No contact person added.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          {!selectedAccountManager && isAdmin && (
                            <div className="flex justify-end mt-4">
                              <Button onClick={() => navigate(profileHref)}>
                                Add Contact Person
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
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            selectedAccount!.approvalStatus === "approved" ? "success" :
                            selectedAccount!.approvalStatus === "rejected" ? "danger" : "warning"
                          }>
                            {selectedAccount!.approvalStatus === "approved" ? "Approved" : selectedAccount!.approvalStatus === "rejected" ? "Rejected" : "Pending Approval"}
                          </Badge>
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
                          <div className="font-semibold text-slate-900">{selectedAccount!.contactFirstName} {selectedAccount!.contactLastName}</div>
                        </div>
                        <div className="p-4 text-center">
                          <div className="text-sm text-slate-500 mb-1">Contact Email</div>
                          <div className="font-semibold text-slate-900 text-sm">{selectedAccount!.contactEmail}</div>
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
                    <div><p className="text-xs text-slate-400">Contact Name</p><p className="text-sm font-medium text-slate-900 mt-0.5">{detailAccount.contactFirstName} {detailAccount.contactLastName}</p></div>
                    <div><p className="text-xs text-slate-400">Contact Email</p><p className="text-sm font-medium text-slate-900 mt-0.5">{detailAccount.contactEmail}</p></div>
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

                {isManager && detailAccount.approvalStatus === "approved" && (
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
              </div>
            )}

            <div className="flex justify-end px-6 py-4 border-t border-slate-200">
              <Button variant="outline" onClick={handleCloseDetail}>Close</Button>
            </div>
          </div>
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
