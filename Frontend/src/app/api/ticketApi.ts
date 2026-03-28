const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

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
  title: string;
  description?: string;
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
}

export const createTicket = async (
  payload: TicketPayload,
): Promise<TicketRecord> => {
  const response = await fetch(`${API_BASE_URL}/tickets`, {
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
  payload: { status?: string; resolution?: string; notes?: string },
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
