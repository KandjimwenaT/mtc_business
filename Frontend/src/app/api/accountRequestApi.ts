import { API_BASE_URL } from "./apiBase";

const authHeaders = () => {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const handleUnauthorized = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("currentUser");
  window.location.href = "/";
};

export interface AccountRequestPayload {
  type: string;
  priority: string;
  title: string;
  description: string;
}

export interface AccountRequestRecord {
  requestId: number;
  accountId: number;
  executiveId: number | null;
  type: string;
  priority: string;
  title: string;
  description: string;
  status: string;
  submittedBy: string;
  processedBy: string | null;
  processedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated on assigned requests
  accountName?: string;
  accountNumber?: string;
}

export const submitAccountRequest = async (
  payload: AccountRequestPayload,
): Promise<AccountRequestRecord> => {
  const response = await fetch(`${API_BASE_URL}/account-requests`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to submit request");
  }

  return data.request as AccountRequestRecord;
};

export const getMyAccountRequests = async (): Promise<AccountRequestRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/account-requests/my`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch requests");
  }

  return data.requests as AccountRequestRecord[];
};

export const getAssignedAccountRequests = async (): Promise<AccountRequestRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/account-requests/assigned`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch assigned requests");
  }

  return data.requests as AccountRequestRecord[];
};

export const updateAccountRequestStatus = async (
  requestId: number,
  payload: { status?: string; notes?: string },
): Promise<AccountRequestRecord> => {
  const response = await fetch(`${API_BASE_URL}/account-requests/${requestId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to update request");
  }

  return data.request as AccountRequestRecord;
};
