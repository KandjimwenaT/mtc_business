import { API_BASE_URL } from "./apiBase";

function handleUnauthorized() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("currentUser");
  window.location.href = "/login";
}

export interface LeadPayload {
  companyName: string;
  contactPerson: string;
  contactPhone?: string;
  contactEmail?: string;
  leadSource: string;
  estimatedLines?: string;
  productInterest: string;
  priority?: string;
  expectedCloseDate?: string;
  notes?: string;
  status?: "pending" | "in_progress" | "ongoing" | "completed";
}

export interface LeadRecord {
  leadId: number;
  companyName: string;
  contactPerson: string;
  contactPhone: string | null;
  contactEmail: string | null;
  leadSource: string;
  estimatedLines: string | null;
  productInterest: string;
  priority: string | null;
  expectedCloseDate: string | null;
  notes: string | null;
  status: "pending" | "in_progress" | "ongoing" | "completed";
  createdAt: string;
  updatedAt: string;
}

export interface TeamLeadRecord extends LeadRecord {
  executive: {
    executiveId: number;
    userId: number;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
  } | null;
}

const authHeaders = () => {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const createLead = async (payload: LeadPayload): Promise<LeadRecord> => {
  const res = await fetch(`${API_BASE_URL}/leads`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to create lead");
  return data.lead;
};

export const getMyLeads = async (): Promise<LeadRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/leads`, {
    headers: authHeaders(),
  });
  if (res.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch leads");
  return data.leads ?? [];
};

export const getTeamLeads = async (): Promise<TeamLeadRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/leads/team`, {
    headers: authHeaders(),
  });
  if (res.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch team leads");
  return data.leads ?? [];
};
