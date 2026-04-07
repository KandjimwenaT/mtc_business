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

export interface ComplaintPayload {
  type: string;
  priority: string;
  title: string;
  description: string;
}

export interface ComplaintRecord {
  complaintId: number;
  accountId: number;
  executiveId: number | null;
  type: string;
  priority: string;
  title: string;
  description: string;
  status: string;
  submittedBy: string;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated on assigned complaints
  accountName?: string;
  accountNumber?: string;
}

export const submitComplaint = async (
  payload: ComplaintPayload,
): Promise<ComplaintRecord> => {
  const response = await fetch(`${API_BASE_URL}/complaints`, {
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
    throw new Error(data.message || "Failed to submit complaint");
  }

  return data.complaint as ComplaintRecord;
};

export const getMyComplaints = async (): Promise<ComplaintRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/complaints/my`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch complaints");
  }

  return data.complaints as ComplaintRecord[];
};

export const getAssignedComplaints = async (): Promise<ComplaintRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/complaints/assigned`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch assigned complaints");
  }

  return data.complaints as ComplaintRecord[];
};

export const updateComplaintStatus = async (
  complaintId: number,
  payload: { status?: string; resolution?: string },
): Promise<ComplaintRecord> => {
  const response = await fetch(`${API_BASE_URL}/complaints/${complaintId}`, {
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
    throw new Error(data.message || "Failed to update complaint");
  }

  return data.complaint as ComplaintRecord;
};
