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

export interface VisitPayload {
  corporateId?: number;
  accountId?: number;
  meetingType: "online" | "in_person";
  purpose: string;
  agenda?: string;
  visitDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  onlineLink?: string;
  attendees?: string[];
}

export interface VisitRecord {
  visitId: number;
  visitNumber: string;
  accountId: number;
  corporateId?: number | null;
  corporateName?: string | null;
  executiveId: number;
  executiveName: string;
  executiveEmail: string;
  accountName: string;
  meetingType: "online" | "in_person";
  purpose: string;
  agenda: string | null;
  visitDate: string;
  startTime: string;
  endTime: string;
  location: string | null;
  onlineLink: string | null;
  attendees: string[];
  status:
    | "pending"
    | "approved"
    | "declined"
    | "confirmed"
    /** AVR submitted — exec still owes §6 feedback + §7 account health */
    | "follow_up_pending"
    | "completed"
    | "cancelled"
    | "rescheduled";
  customerResponse: string | null;
  customerRespondedAt: string | null;
  rescheduleDate: string | null;
  rescheduleStartTime: string | null;
  rescheduleEndTime: string | null;
  rescheduleReason: string | null;
  execRescheduleStatus: "pending_approval" | "approved" | "rejected" | null;
  execRescheduleReason: string | null;
  execRescheduleMotivation: string | null;
  execRescheduleNewDate: string | null;
  execRescheduleNewTime: string | null;
  customerRating: number | null;
  customerRatingComment: string | null;
  customerRatedAt: string | null;
  /** First time the executive opened “Start visit” with GPS (server). */
  meetingStartedAt?: string | null;
  startGeoLatitude?: number | null;
  startGeoLongitude?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Open map at meeting start coordinates (new tab). */
export function openStreetMapMeetingStartLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=16`;
}

export interface ControlCardRecord {
  controlCardId: number;
  visitId: number;
  executiveId: number;
  accountId: number;
  accountName: string;
  visitDate: string;
  csrManager: string | null;
  customerParticipants: string | null;
  visitObjective: string | null;
  slaCompliance: string | null;
  openTickets: string | null;
  criticalIncidents: string | null;
  risksOperational: string | null;
  risksCommercial: string | null;
  risksCompetitive: string | null;
  opportunitiesUpsell: string | null;
  opportunitiesProcess: string | null;
  actionItems: Array<{
    item?: string;
    action?: string;
    quantity?: string;
    dueDate?: string;
    deadline?: string;
    owner?: string;
    notes?: string;
    category?: string;
    requestType?: string;
  }>;
  submittedAt: string;
  geoLatitude: number | null;
  geoLongitude: number | null;
  customerFeedback: string | null;
  accountHealth: "green" | "amber" | "red" | null;
  createdAt: string;
  updatedAt: string;
}

// Executive creates a visit
export const createVisit = async (payload: VisitPayload): Promise<VisitRecord> => {
  const response = await fetch(`${API_BASE_URL}/visits`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to create visit");
  return data.visit as VisitRecord;
};

// Executive gets their visits
export const getMyVisits = async (): Promise<VisitRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/visits/my`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to fetch visits");
  return data.visits as VisitRecord[];
};

/** Persist GPS when the executive starts a visit (AVR modal). Server keeps the first capture only. */
export const recordVisitMeetingStart = async (
  visitId: number,
  coords: { latitude: number; longitude: number },
): Promise<VisitRecord> => {
  const response = await fetch(`${API_BASE_URL}/visits/${visitId}/meeting-start`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude }),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to record meeting start");
  return data.visit as VisitRecord;
};

// Customer gets their visits
export const getCustomerVisits = async (): Promise<VisitRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/visits/customer`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to fetch visits");
  return data.visits as VisitRecord[];
};

// Manager / admin gets all visits
export const getAllVisits = async (): Promise<VisitRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/visits/all`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to fetch visits");
  return data.visits as VisitRecord[];
};

// Customer responds to a visit (approve / decline / reschedule)
export const respondToVisit = async (
  visitId: number,
  payload: {
    action: "approve" | "decline" | "reschedule";
    customerResponse?: string;
    rescheduleDate?: string;
    rescheduleStartTime?: string;
    rescheduleEndTime?: string;
    rescheduleReason?: string;
  },
): Promise<VisitRecord> => {
  const response = await fetch(`${API_BASE_URL}/visits/${visitId}/respond`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to respond to visit");
  return data.visit as VisitRecord;
};

// Executive requests reschedule (needs manager approval)
export const requestReschedule = async (
  visitId: number,
  payload: {
    reason: string;
    motivation: string;
    newDate: string;
    newTime: string;
  },
): Promise<VisitRecord> => {
  const response = await fetch(`${API_BASE_URL}/visits/${visitId}/request-reschedule`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to request reschedule");
  return data.visit as VisitRecord;
};

// Executive / manager updates visit (accept reschedule, complete, cancel)
export const updateVisit = async (
  visitId: number,
  payload: { action?: string; status?: string },
): Promise<VisitRecord> => {
  const response = await fetch(`${API_BASE_URL}/visits/${visitId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to update visit");
  return data.visit as VisitRecord;
};

// Executive submits control card
export const submitControlCard = async (
  visitId: number,
  controlCardData: Record<string, unknown>,
): Promise<{
  controlCard: ControlCardRecord;
  visit: VisitRecord;
  ticketsCreated?: number;
  ticketNumbers?: string[];
}> => {
  const response = await fetch(`${API_BASE_URL}/visits/${visitId}/control-card`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ controlCardData }),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to submit control card");
  return {
    controlCard: data.controlCard as ControlCardRecord,
    visit: data.visit as VisitRecord,
    ticketsCreated: typeof data.ticketsCreated === "number" ? data.ticketsCreated : 0,
    ticketNumbers: Array.isArray(data.ticketNumbers) ? data.ticketNumbers : [],
  };
};

// Get control card for a visit
export const getControlCard = async (visitId: number): Promise<ControlCardRecord> => {
  const response = await fetch(`${API_BASE_URL}/visits/${visitId}/control-card`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to get control card");
  return data.controlCard as ControlCardRecord;
};

// Executive updates control card (post-completion fields)
export const updateControlCard = async (
  visitId: number,
  payload: { customerFeedback?: string; accountHealth?: "green" | "amber" | "red" },
): Promise<{ controlCard: ControlCardRecord; visit?: VisitRecord }> => {
  const response = await fetch(`${API_BASE_URL}/visits/${visitId}/control-card`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to update control card");
  return {
    controlCard: data.controlCard as ControlCardRecord,
    visit: data.visit as VisitRecord | undefined,
  };
};

// Customer submits rating for a completed visit
export const submitVisitRating = async (
  visitId: number,
  payload: {
    rating: number;
    comment?: string;
  },
): Promise<VisitRecord> => {
  const response = await fetch(`${API_BASE_URL}/visits/${visitId}/rating`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to submit rating");
  return data.visit as VisitRecord;
};

export interface DepartmentTeamMember {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: "manager" | "supervisor" | "executive_staff" | "admin" | string;
}

export interface DepartmentTeamResponse {
  department: string | null;
  members: DepartmentTeamMember[];
}

// Executive / supervisor / manager fetches their department teammates
// for the Attendees picker on the schedule-visit form.
export const getDepartmentTeam = async (): Promise<DepartmentTeamResponse> => {
  const response = await fetch(`${API_BASE_URL}/visits/department-team`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to fetch department team");
  return {
    department: data.department ?? null,
    members: (data.members ?? []) as DepartmentTeamMember[],
  };
};

// Manager gets visits scoped to their executives
export const getManagerVisits = async (): Promise<VisitRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/visits/manager/visits`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to fetch manager visits");
  return data.visits as VisitRecord[];
};

// Manager gets control cards scoped to their executives
export const getManagerControlCards = async (): Promise<ControlCardRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/visits/manager/control-cards`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to fetch control cards");
  return data.controlCards as ControlCardRecord[];
};

// Manager gets pending reschedule requests
export const getPendingReschedules = async (): Promise<VisitRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/visits/reschedules/pending`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to fetch reschedule requests");
  return data.visits as VisitRecord[];
};

// Manager approves or rejects a reschedule request
export const approveReschedule = async (
  visitId: number,
  decision: "approved" | "rejected",
): Promise<VisitRecord> => {
  const response = await fetch(`${API_BASE_URL}/visits/${visitId}/approve-reschedule`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ decision }),
  });

  if (response.status === 401) { handleUnauthorized(); throw new Error("Session expired"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to process reschedule");
  return data.visit as VisitRecord;
};
