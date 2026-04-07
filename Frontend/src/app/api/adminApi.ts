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
  executiveIds?: number[];
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
  created_at: string;
  updated_at: string;
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
