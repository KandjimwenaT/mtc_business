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

export interface SlaConfigRecord {
  slaConfigId: number | null;
  department: string | null;
  category: "request" | "complaint";
  ticketType: string;
  typeLabel?: string;
  targetHours: number;
  warningHours: number;
  atRiskHours: number;
  escalateL1Hours: number;
  escalateL2Hours: number;
  escalateL3Hours: number;
  autoEscalate: boolean;
  isDefault?: boolean;
  updatedAt?: string | null;
}

export interface SlaConfigPayload {
  department: string | null;
  canEdit: boolean;
  catalog: {
    request: { value: string; label: string }[];
    complaint: { value: string; label: string }[];
  };
  configs: SlaConfigRecord[];
}

async function parseSlaResponse(response: Response): Promise<SlaConfigPayload> {
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to load SLA configuration");
  }
  return {
    department: data.department ?? null,
    canEdit: Boolean(data.canEdit),
    catalog: data.catalog || { request: [], complaint: [] },
    configs: (data.configs || []) as SlaConfigRecord[],
  };
}

export const getSlaConfigs = async (): Promise<SlaConfigPayload> => {
  const response = await fetch(`${API_BASE_URL}/sla-configs`, {
    method: "GET",
    headers: authHeaders(),
  });
  return parseSlaResponse(response);
};

export const saveSlaConfigs = async (configs: SlaConfigRecord[]): Promise<SlaConfigPayload> => {
  const response = await fetch(`${API_BASE_URL}/sla-configs`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ configs }),
  });
  return parseSlaResponse(response);
};
