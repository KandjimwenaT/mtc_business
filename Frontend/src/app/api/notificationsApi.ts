import { API_BASE_URL, API_ORIGIN } from "./apiBase";

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

export type NotificationType = "ticket" | "visit" | "sla" | "escalation" | "rating" | "vehicle" | string;
export type NotificationPriority = "normal" | "high" | "critical";

export interface NotificationRecord {
  notificationId: number;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export const getNotifications = async (unreadOnly = false): Promise<NotificationRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/notifications${unreadOnly ? "?unreadOnly=true" : ""}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch notifications");
  }

  return data.notifications as NotificationRecord[];
};

export const markNotificationRead = async (id: number): Promise<NotificationRecord> => {
  const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
    method: "PATCH",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to mark notification as read");
  }

  return data.notification as NotificationRecord;
};

export const markAllNotificationsRead = async (): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: "PATCH",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to mark all notifications as read");
  }
};

/** Absolute URL for a notification attachment path from metadata (e.g. `/uploads/broadcasts/...`). */
export const resolveNotificationAttachmentUrl = (relativeOrAbsolute: string | undefined | null): string | null => {
  if (!relativeOrAbsolute || typeof relativeOrAbsolute !== "string") return null;
  const s = relativeOrAbsolute.trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  const path = s.startsWith("/") ? s : `/${s}`;
  return `${API_ORIGIN}${path}`;
};

export type BroadcastAudience = "customers" | "executives";

export const broadcastManagerNotification = async (params: {
  title: string;
  message: string;
  audience: BroadcastAudience;
  attachment?: File | null;
}): Promise<{ recipientCount: number; message?: string }> => {
  const token = localStorage.getItem("accessToken");
  const formData = new FormData();
  formData.append("title", params.title);
  formData.append("message", params.message);
  formData.append("audience", params.audience);
  if (params.attachment) {
    formData.append("attachment", params.attachment);
  }

  const response = await fetch(`${API_BASE_URL}/notifications/broadcast`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to send broadcast");
  }

  return {
    recipientCount: Number(data.recipientCount ?? 0),
    message: typeof data.message === "string" ? data.message : undefined,
  };
};

export const getUnreadNotificationCount = async (): Promise<number> => {
  const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch unread notification count");
  }

  return Number(data.unreadCount || 0);
};
