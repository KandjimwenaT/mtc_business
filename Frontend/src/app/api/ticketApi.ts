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

export interface TicketPayload {
  category: "request" | "complaint";
  type: string;
  priority?: string;
  title?: string;
  description?: string;
  accountId?: number;
  createdForAccountId?: number;
  sourceChannel?: "portal" | "email" | "phone";
  sourceContextNote?: string;
  attachment?: File | null;
}

export interface TicketRecord {
  ticketId: number;
  ticketNumber: string;
  category: "request" | "complaint";
  accountId: number;
  executiveId: number | null;
  type: string;
  priority: string;
  title: string;
  description: string | null;
  status: string;
  submittedBy: string;
  createdByUserId?: number | null;
  createdByRole?: string | null;
  createdByName?: string | null;
  createdForAccountId?: number | null;
  createdForCustomerUserId?: number | null;
  sourceChannel?: "portal" | "email" | "phone";
  sourceContextNote?: string | null;
  attachmentUrl?: string | null;
  assignedTo: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  slaDeadline: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated on assigned / all tickets
  accountName?: string;
  accountNumber?: string;
  corporateId?: number | null;
  corporateName?: string | null;
  internalNotes?: TicketInternalNoteRecord[];
  activityLog?: TicketActivityLogRecord[];
}

export interface TicketActivityLogRecord {
  activityId: number;
  ticketId: number;
  actorUserId: number;
  actorName: string;
  actorRole: string;
  previousStatus: string | null;
  newStatus: string | null;
  actionTaken: string | null;
  resolutionPreview: string | null;
  notesPreview: string | null;
  createdAt: string;
}

export interface TicketInternalNoteRecord {
  noteId: number;
  ticketId: number;
  authorUserId: number;
  authorName: string;
  authorRole: string;
  note: string;
  createdAt: string;
}

export const createTicket = async (
  payload: TicketPayload,
): Promise<TicketRecord> => {
  const token = localStorage.getItem("accessToken");
  const formData = new FormData();
  formData.append("category", payload.category);
  formData.append("type", payload.type);
  if (payload.priority) formData.append("priority", payload.priority);
  if (payload.title) formData.append("title", payload.title);
  if (payload.description) formData.append("description", payload.description);
  if (payload.accountId != null) formData.append("accountId", String(payload.accountId));
  if (payload.createdForAccountId != null) formData.append("createdForAccountId", String(payload.createdForAccountId));
  if (payload.sourceChannel) formData.append("sourceChannel", payload.sourceChannel);
  if (payload.sourceContextNote) formData.append("sourceContextNote", payload.sourceContextNote);
  if (payload.attachment) formData.append("attachment", payload.attachment);

  const response = await fetch(`${API_BASE_URL}/tickets`, {
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
    throw new Error(data.message || "Failed to create ticket");
  }

  return data.ticket as TicketRecord;
};

export const getMyTickets = async (): Promise<TicketRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/tickets/my`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch tickets");
  }

  return data.tickets as TicketRecord[];
};

export const getAssignedTickets = async (): Promise<TicketRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/tickets/assigned`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch assigned tickets");
  }

  return data.tickets as TicketRecord[];
};

export const getAllTickets = async (): Promise<TicketRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/tickets/all`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch all tickets");
  }

  return data.tickets as TicketRecord[];
};

export const getTicketById = async (ticketId: number): Promise<TicketRecord> => {
  const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch ticket");
  }
  return data.ticket as TicketRecord;
};

export const updateTicket = async (
  ticketId: number,
  payload: { status?: string; resolution?: string; notes?: string; actionTaken?: string },
): Promise<TicketRecord> => {
  const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
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
    throw new Error(data.message || "Failed to update ticket");
  }

  return data.ticket as TicketRecord;
};

export const addInternalTicketNote = async (
  ticketId: number,
  note: string,
): Promise<TicketInternalNoteRecord> => {
  const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/internal-notes`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ note }),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to add internal note");
  }

  return data.note as TicketInternalNoteRecord;
};
