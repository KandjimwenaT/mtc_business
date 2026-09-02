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

export interface AuditLogRecord {
  auditId: number;
  actorUserId: number | null;
  actorName: string;
  actorEmail: string | null;
  actorRole: string | null;
  department: string | null;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  message: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  logs: AuditLogRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export const getAuditLogs = async (params: {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: string;
  from?: string;
  to?: string;
} = {}): Promise<AuditLogPage> => {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  if (params.type) query.set("type", params.type);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);

  const response = await fetch(`${API_BASE_URL}/audit-logs?${query.toString()}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch audit logs");
  }

  return {
    logs: (data.logs || []) as AuditLogRecord[],
    pagination: data.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  };
};
