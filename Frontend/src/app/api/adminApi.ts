import { API_BASE_URL } from "./apiBase";

export interface PersonPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  type: "executive_staff" | "supervisor" | "manager" | "gm" | "admin" | "customer";
  region?: string;
  department?: string;
  gmId?: number;
  managerId?: number;
  corporateId?: number;
}

export interface PersonRecord {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  type: string;
  region: string | null;
  department: string | null;
  gmId: number | null;
  managerId: number | null;
  corporateId: number | null;
  hasPortalAccess: boolean;
  created_at: string;
}

export interface PortalUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  created_at: string;
}

export interface GMRecord {
  gmId: number;
  userId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface ManagerRecord {
  managerId: number;
  userId: number | null;
  gmId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  department: string | null;
  /** Linked Person.type: "manager" | "supervisor" | null if no directory row */
  personType?: string | null;
}

export interface ExecutiveRecord {
  executiveId: number;
  userId: number | null;
  managerId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  region: string | null;
}

export interface AccountPayload {
  corporateId?: number | null;
  accountNumber: string;
  accountName: string;
  accountType: string;
  executiveId?: number | null;
  managerId?: number | null;
  parentAccountId?: number | null;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone?: string;
  industry?: string;
  isActive?: boolean;
}

export interface AccountRecord {
  accountId: number;
  corporateId: number | null;
  parentAccountId: number | null;
  accountNumber: string;
  accountName: string;
  accountType: string;
  executiveId: number | null;
  executiveFirstName?: string;
  executiveLastName?: string;
  managerId: number | null;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string | null;
  industry: string | null;
  isActive: boolean;
  approvalStatus: "pending" | "approved" | "rejected";
  monthlySpending?: string;
  created_at: string;
  updated_at: string;
}

export interface CorporatePayload {
  corporateNumber: string;
  corporateName: string;
  corporateType: string;
  businessEmail: string;
  industry?: string;
  managerId: number;
  isActive?: boolean;
}

export interface CorporateRecord {
  corporateId: number;
  corporateNumber: string;
  corporateName: string;
  corporateType: string;
  businessEmail: string;
  industry: string | null;
  managerId: number | null;
  executiveId?: number | null;
  executiveFirstName?: string;
  executiveLastName?: string;
  isActive: boolean;
  approvalStatus: "pending" | "waiting_approval" | "approved" | "rejected";
  expiredAccountsCount?: number;
  renewalCount?: number;
  monthlySpending?: string;
  /** Resolved segment for GM oversight toggle (EBU / Key Accounts). */
  department?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoicePayload {
  invoiceNumber: string;
  amount: number;
  currency?: string;
  status?: "issued" | "paid" | "overdue" | "cancelled";
  invoiceDate: string;
  paidAt?: string;
  notes?: string;
}

export interface InvoiceRecord {
  invoiceId: number;
  accountId: number;
  corporateId: number | null;
  invoiceNumber: string;
  amount: string;
  currency: string;
  status: "issued" | "paid" | "overdue" | "cancelled";
  invoiceDate: string;
  paidAt: string | null;
  created_at: string;
}

export interface SpendingSummaryRecord {
  total: string;
  currency: string;
  byCorporate: Record<string, string>;
  byAccount: Record<string, string>;
}

export interface SpendingTrendRecord {
  month: string;
  total: string;
  currency: string;
}

export interface ContractPayload {
  contractType: string;
  contractStartDate?: string;
  contractEndDate?: string;
  contractEffectiveDate?: string;
  srNumber?: string;
  srCreatedDate?: string;
  srSubmittedDate?: string;
  srAcceptedDate?: string;
  usageLimit?: string;
  entitlement?: string;
  notes?: string;
}

export interface ContractRecord {
  contractId: number;
  accountId: number | null;
  serviceId: number | null;
  contractType: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  contractEffectiveDate: string | null;
  srNumber: string | null;
  srCreatedDate: string | null;
  srSubmittedDate: string | null;
  srAcceptedDate: string | null;
  usageLimit: string | null;
  entitlement: string | null;
  notes: string | null;
  created_at: string;
}

export interface ExpiringContractRecord {
  contractId: number;
  accountId: number;
  corporateId: number | null;
  corporateName: string | null;
  accountName: string;
  contractType: string;
  contractEndDate: string;
  daysRemaining: number;
}

export interface ServicePayload {
  msisdn?: string;
  serviceType: string;
  status?: "active" | "suspended" | "inactive";
}

export interface ServiceRecord {
  serviceId: number;
  accountId: number;
  msisdn: string | null;
  serviceType: string;
  status: "active" | "suspended" | "inactive";
  created_at: string;
}

interface ApiResponse<T = unknown> {
  status: string;
  message: string;
  person?: T;
  persons?: T[];
  user?: T;
  users?: T[];
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** For multipart requests — do not set Content-Type (browser sets boundary). */
function authHeadersMultipart(): HeadersInit {
  const token = localStorage.getItem("accessToken");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function handleUnauthorized(status: number) {
  if (status === 401) {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("currentUser");
    window.location.href = "/";
  }
}

// ── Person (database record) CRUD ─────────────────────────────────

export const createPerson = async (
  payload: PersonPayload
): Promise<ApiResponse<PersonRecord>> => {
  const res = await fetch(`${API_BASE_URL}/admin/persons`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to create user"); }
  return data;
};

export const getPersonsByType = async (
  type?: string
): Promise<PersonRecord[]> => {
  const url = type
    ? `${API_BASE_URL}/admin/persons?type=${encodeURIComponent(type)}`
    : `${API_BASE_URL}/admin/persons`;
  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch persons"); }
  return data.persons ?? [];
};

export const deletePersonWithoutPortalAccess = async (
  personId: number,
  personType?: string
): Promise<void> => {
  const query = personType ? `?type=${encodeURIComponent(personType)}` : "";
  const res = await fetch(`${API_BASE_URL}/admin/persons/${personId}${query}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to delete user"); }
};

// ── Portal access ─────────────────────────────────────────────────

export const createPortalAccess = async (
  personId: number,
  personType?: string
): Promise<ApiResponse<PortalUser>> => {
  const res = await fetch(`${API_BASE_URL}/admin/portal-access`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ personId, personType }),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to create portal access"); }
  return data;
};

export const getPortalUsers = async (): Promise<PortalUser[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/portal-users`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch portal users"); }
  return data.users ?? [];
};

export const revokePortalAccess = async (userId: number): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/admin/portal-users/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to revoke portal access"); }
};

// ── Hierarchy dropdowns ───────────────────────────────────────────

export const getGMs = async (): Promise<GMRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/gms`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch GMs"); }
  return data.gms ?? [];
};

export const getManagers = async (): Promise<ManagerRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/managers`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch managers"); }
  return data.managers ?? [];
};

export const getExecutives = async (): Promise<ExecutiveRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/executives`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch executives"); }
  return data.executives ?? [];
};

export const promoteExecutiveToSupervisor = async (
  executivePersonId: number
): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/admin/executives/${executivePersonId}/promote-supervisor`, {
    method: "PUT",
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to promote executive"); }
};

export const demoteSupervisorToExecutive = async (
  supervisorPersonId: number
): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/admin/executives/${supervisorPersonId}/demote-executive`, {
    method: "PUT",
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to demote supervisor"); }
};

// ── Imported executive onboarding ─────────────────────────────────

export interface PendingImportedExecutive {
  executiveId: number;
  firstName: string;
  lastName: string;
  currentEmail: string;
  phone: string | null;
  region: string | null;
  linkedCorporatesCount: number;
  linkedAccountsCount: number;
}

export interface CompleteImportedExecutivePayload {
  email?: string;
  phone?: string;
  managerPersonId?: number;
  firstName?: string;
  lastName?: string;
  existingExecutiveId?: number;
}

export const getPendingImportedExecutives = async (): Promise<PendingImportedExecutive[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/executives/pending-onboarding`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch pending executives"); }
  return data.executives ?? [];
};

export interface CompleteImportedExecutiveResponse {
  status: string;
  message?: string;
  emailSent?: boolean;
  user?: PortalUser & { password?: string };
}

export const completeImportedExecutive = async (
  executiveId: number,
  payload: CompleteImportedExecutivePayload
): Promise<CompleteImportedExecutiveResponse> => {
  const res = await fetch(`${API_BASE_URL}/admin/executives/${executiveId}/complete-onboarding`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to complete onboarding"); }
  return data;
};

export interface KeyAccountsImportStats {
  totalRows: number;
  skipped: number;
  unresolvedExecutive: number;
  created: number;
  updated: number;
  accountsCreated: number;
  accountsUpdated: number;
  servicesCreated: number;
  servicesUpdated: number;
  contractsCreated: number;
  contractsUpdated: number;
  corporateNameDedupHits: number;
  accountNameDedupHits: number;
  skippedServiceRows: number;
}

export interface KeyAccountsImportResponse {
  status: string;
  message: string;
  sheetName: string;
  stats: KeyAccountsImportStats;
  createdExecutivesCount: number;
  unresolvedSample: Array<{ corporateNumber: string; corporateName: string; accountManager: string }>;
  unresolvedTotal: number;
}

export interface KeyAccountsImportProgress {
  /** 0-100, integer */
  percent: number;
  processedRows: number;
  totalRows: number;
  /** Current job phase from the backend. */
  status: "pending" | "running" | "completed" | "failed";
}

interface KeyAccountsImportJobStartResponse {
  status: string;
  message: string;
  jobId: string;
  sheetName: string | null;
  totalRows: number;
}

interface KeyAccountsImportJobStatus {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  sheetName: string | null;
  totalRows: number;
  processedRows: number;
  percent: number;
  stats: KeyAccountsImportStats | null;
  createdExecutivesCount: number;
  unresolvedSample: Array<{ corporateNumber: string; corporateName: string; accountManager: string }>;
  unresolvedTotal: number;
  message: string | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

// EBU import shares the same job/progress/stats shape as the KAM import, so
// we expose convenience aliases for clarity at the call site.
export type EbuImportProgress = KeyAccountsImportProgress;
export type EbuImportResponse = KeyAccountsImportResponse;
export type EbuImportStats = KeyAccountsImportStats;

/**
 * Shared upload + poll helper used by both the Key Accounts and EBU importers.
 * The backend returns 202 Accepted with a `jobId` immediately so we don't
 * hit reverse-proxy timeouts on large files; we then poll until the job
 * reports completed/failed.
 */
async function runExcelImportJob(args: {
  startUrl: string;
  statusUrlPrefix: string;
  file: File;
  sheet?: string;
  assignedManagerProfileId?: number;
  onProgress?: (progress: KeyAccountsImportProgress) => void;
}): Promise<KeyAccountsImportResponse> {
  const { startUrl, statusUrlPrefix, file, sheet, assignedManagerProfileId, onProgress } = args;

  const form = new FormData();
  form.append("file", file);
  if (sheet?.trim()) form.append("sheet", sheet.trim());
  if (
    assignedManagerProfileId != null &&
    Number.isInteger(assignedManagerProfileId) &&
    assignedManagerProfileId > 0
  ) {
    form.append("managerId", String(assignedManagerProfileId));
  }

  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: authHeadersMultipart(),
    body: form,
  });
  const startData = (await startRes.json()) as KeyAccountsImportJobStartResponse & {
    message?: string;
  };
  if (!startRes.ok) {
    handleUnauthorized(startRes.status);
    throw new Error(startData.message || "Failed to start import");
  }
  const { jobId } = startData;
  if (!jobId) {
    throw new Error("Server did not return an import job id");
  }

  onProgress?.({
    percent: 0,
    processedRows: 0,
    totalRows: startData.totalRows ?? 0,
    status: "pending",
  });

  const minIntervalMs = 2000;
  const maxIntervalMs = 10000;
  let intervalMs = minIntervalMs;
  const maxPolls = 1200;

  for (let i = 0; i < maxPolls; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    let pollRes: Response;
    try {
      pollRes = await fetch(`${statusUrlPrefix}${encodeURIComponent(jobId)}`, {
        headers: authHeaders(),
      });
    } catch (err) {
      continue;
    }

    if (pollRes.status === 429) {
      const retryAfter = Number(pollRes.headers.get("Retry-After"));
      intervalMs = Math.min(
        maxIntervalMs,
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.max(intervalMs * 2, minIntervalMs)
      );
      continue;
    }

    const pollData = await pollRes.json().catch(() => ({}));
    if (!pollRes.ok) {
      handleUnauthorized(pollRes.status);
      throw new Error(
        (pollData && (pollData as { message?: string }).message) || "Failed to fetch import status"
      );
    }

    intervalMs = minIntervalMs;

    const job = (pollData as { job?: KeyAccountsImportJobStatus }).job;
    if (!job) {
      throw new Error("Malformed import status response");
    }

    onProgress?.({
      percent: job.percent ?? 0,
      processedRows: job.processedRows ?? 0,
      totalRows: job.totalRows ?? 0,
      status: job.status,
    });

    if (job.status === "completed") {
      if (!job.stats) {
        throw new Error("Import finished but no stats were returned");
      }
      return {
        status: "Success",
        message: job.message || "Import completed",
        sheetName: job.sheetName || "",
        stats: job.stats,
        createdExecutivesCount: job.createdExecutivesCount,
        unresolvedSample: job.unresolvedSample,
        unresolvedTotal: job.unresolvedTotal,
      };
    }
    if (job.status === "failed") {
      throw new Error(job.error || "Import failed");
    }
  }

  throw new Error("Import timed out while waiting for the server to finish");
}

/**
 * Upload the Key Accounts spreadsheet, then poll the backend for progress
 * until the import completes.
 */
export const importKeyAccountsFromExcel = async (
  file: File,
  options?: { sheet?: string; assignedManagerProfileId?: number },
  onProgress?: (progress: KeyAccountsImportProgress) => void
): Promise<KeyAccountsImportResponse> =>
  runExcelImportJob({
    startUrl: `${API_BASE_URL}/admin/imports/key-accounts`,
    statusUrlPrefix: `${API_BASE_URL}/admin/imports/key-accounts/jobs/`,
    file,
    sheet: options?.sheet,
    assignedManagerProfileId: options?.assignedManagerProfileId,
    onProgress,
  });

/**
 * Upload the EBU customer list, then poll the backend for progress until the
 * import completes. `assignedManagerProfileId` is required server-side.
 */
export const importEbuFromExcel = async (
  file: File,
  options: { sheet?: string; assignedManagerProfileId: number },
  onProgress?: (progress: EbuImportProgress) => void
): Promise<EbuImportResponse> =>
  runExcelImportJob({
    startUrl: `${API_BASE_URL}/admin/imports/ebu`,
    statusUrlPrefix: `${API_BASE_URL}/admin/imports/ebu/jobs/`,
    file,
    sheet: options.sheet,
    assignedManagerProfileId: options.assignedManagerProfileId,
    onProgress,
  });

// ── Customer accounts ─────────────────────────────────────────────

export const createAccount = async (
  payload: AccountPayload
): Promise<AccountRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/accounts`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to create account"); }
  return data.account;
};

export const createCorporate = async (
  payload: CorporatePayload
): Promise<CorporateRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/corporates`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to create corporate"); }
  return data.corporate;
};

export const getCorporates = async (managerId?: number): Promise<CorporateRecord[]> => {
  const url = managerId
    ? `${API_BASE_URL}/admin/corporates?managerId=${encodeURIComponent(String(managerId))}`
    : `${API_BASE_URL}/admin/corporates`;
  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch corporates"); }
  return data.corporates ?? [];
};

export const getCorporatesWithoutContactPersons = async (): Promise<CorporateRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/corporates/no-contact-persons`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch corporates"); }
  return data.corporates ?? [];
};

export const submitCorporateForApproval = async (
  corporateId: number
): Promise<CorporateRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/corporates/${corporateId}/submit-approval`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to submit corporate for approval"); }
  return data.corporate as CorporateRecord;
};

export const approveCorporate = async (
  corporateId: number,
  executiveId: number
): Promise<CorporateRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/corporates/${corporateId}/approve`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ executiveId }),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to approve corporate"); }
  return data.corporate as CorporateRecord;
};

export const reassignCorporateExecutive = async (
  corporateId: number,
  executiveId: number
): Promise<CorporateRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/corporates/${corporateId}/reassign-executive`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ executiveId }),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to reassign corporate executive"); }
  return data.corporate as CorporateRecord;
};

// ── Corporate contact persons (M:N AccountManager ↔ Corporate) ──

export const getCorporateContactPersons = async (
  corporateId: number
): Promise<PersonRecord[]> => {
  const res = await fetch(
    `${API_BASE_URL}/admin/corporates/${corporateId}/contact-persons`,
    { headers: authHeaders() }
  );
  const data = await res.json();
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new Error(data.message || "Failed to load contact persons");
  }
  return (data.persons ?? []) as PersonRecord[];
};

export const assignContactPersonToCorporate = async (
  corporateId: number,
  accountManagerId: number
): Promise<PersonRecord> => {
  const res = await fetch(
    `${API_BASE_URL}/admin/corporates/${corporateId}/contact-persons`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ accountManagerId }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new Error(data.message || "Failed to link contact person");
  }
  return data.person as PersonRecord;
};

export const removeContactPersonFromCorporate = async (
  corporateId: number,
  accountManagerId: number
): Promise<void> => {
  const res = await fetch(
    `${API_BASE_URL}/admin/corporates/${corporateId}/contact-persons/${accountManagerId}`,
    { method: "DELETE", headers: authHeaders() }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new Error(data.message || "Failed to remove contact person");
  }
};

export const getAccounts = async (params?: {
  managerId?: number;
  executiveId?: number;
  corporateId?: number;
}): Promise<AccountRecord[]> => {
  const sp = new URLSearchParams();
  if (params?.managerId != null) sp.set("managerId", String(params.managerId));
  if (params?.executiveId != null) sp.set("executiveId", String(params.executiveId));
  if (params?.corporateId != null) sp.set("corporateId", String(params.corporateId));
  const q = sp.toString();
  const res = await fetch(`${API_BASE_URL}/admin/accounts${q ? `?${q}` : ""}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch accounts"); }
  return data.accounts ?? [];
};

export const createContract = async (
  accountId: number,
  payload: ContractPayload
): Promise<ApiResponse> => {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/contracts`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to create contract"); }
  return data;
};

export const createService = async (
  accountId: number,
  payload: ServicePayload
): Promise<ServiceRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/services`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to create service"); }
  return data.service;
};

export const getAccountServices = async (accountId: number): Promise<ServiceRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/services`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch services"); }
  return data.services ?? [];
};

export const updateAccountServiceStatus = async (
  accountId: number,
  serviceId: number,
  status: "active" | "suspended" | "inactive"
): Promise<ServiceRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/services/${serviceId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to update service status"); }
  return data.service;
};

export const deleteAccountService = async (
  accountId: number,
  serviceId: number
): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/services/${serviceId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to delete service line"); }
};

export const getAccountContracts = async (accountId: number): Promise<ContractRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/contracts`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch contracts"); }
  return data.contracts ?? [];
};

export const getExpiringContracts = async (withinMonths = 6): Promise<ExpiringContractRecord[]> => {
  const res = await fetch(
    `${API_BASE_URL}/admin/contracts/expiring?withinMonths=${encodeURIComponent(String(withinMonths))}`,
    { headers: authHeaders() }
  );
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch expiring contracts"); }
  return data.contracts ?? [];
};

export const createInvoice = async (accountId: number, payload: InvoicePayload): Promise<InvoiceRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/invoices`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to create invoice"); }
  return data.invoice as InvoiceRecord;
};

export const getInvoices = async (params?: {
  accountId?: number;
  corporateId?: number;
  managerId?: number;
  executiveId?: number;
  status?: "issued" | "paid" | "overdue" | "cancelled";
}): Promise<InvoiceRecord[]> => {
  const sp = new URLSearchParams();
  if (params?.accountId != null) sp.set("accountId", String(params.accountId));
  if (params?.corporateId != null) sp.set("corporateId", String(params.corporateId));
  if (params?.managerId != null) sp.set("managerId", String(params.managerId));
  if (params?.executiveId != null) sp.set("executiveId", String(params.executiveId));
  if (params?.status) sp.set("status", params.status);
  const q = sp.toString();
  const res = await fetch(`${API_BASE_URL}/admin/invoices${q ? `?${q}` : ""}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch invoices"); }
  return (data.invoices ?? []) as InvoiceRecord[];
};

export const getManagerMonthlySpendingSummary = async (): Promise<SpendingSummaryRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/spending/monthly-summary`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch spending summary"); }
  return data.summary as SpendingSummaryRecord;
};

export const getManagerMonthlySpendingTrend = async (months = 6): Promise<SpendingTrendRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/spending/monthly-trend?months=${encodeURIComponent(String(months))}`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to fetch spending trend"); }
  return (data.trend ?? []) as SpendingTrendRecord[];
};

export const approveAccount = async (
  accountId: number,
  executiveId: number
): Promise<AccountRecord> => {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/approve`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ executiveId }),
  });
  const data = await res.json();
  if (!res.ok) { handleUnauthorized(res.status); throw new Error(data.message || "Failed to approve account"); }
  return data.account;
};
