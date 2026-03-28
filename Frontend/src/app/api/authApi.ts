export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  status: string;
  message: string;
  accessToken: string;
  refreshToken: string;
  user: {
    id: number | string;
    firstName: string;
    email: string;
    role: string;
  };
}

export interface UserProfile {
  id: number | string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  department: string | null;
  region: string | null;
  personId: number | null;
  roleProfileId?: number;
  manager?: {
    managerId: number;
    firstName: string;
    lastName: string;
    email: string;
    department: string | null;
  } | null;
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface VerifyResetOTPPayload {
  email: string;
  otp: string;
}

export interface ResetPasswordPayload {
  email: string;
  otp: string;
  newPassword: string;
}

interface ApiErrorResponse {
  message?: string;
  status?: string;
}

const API_BASE_URL =
import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

export const loginUser = async (
  payload: LoginPayload,
): Promise<LoginResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as LoginResponse | ApiErrorResponse;

  if (!response.ok) {
    throw new Error(data.message || "Login failed");
  }

  return data as LoginResponse;
};

export const logoutUser = async (): Promise<void> => {
  const token = localStorage.getItem("accessToken");
  try {
    if (token) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch {
    // Proceed with local logout even if the API call fails
  } finally {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("currentUser");
  }
};

export const getCurrentUser = (): LoginResponse["user"] | null => {
  try {
    const raw = localStorage.getItem("currentUser");
    return raw ? (JSON.parse(raw) as LoginResponse["user"]) : null;
  } catch {
    return null;
  }
};

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

export const getMyProfile = async (): Promise<UserProfile> => {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch profile");
  }

  return data.profile as UserProfile;
};

export const updateMyProfile = async (
  payload: UpdateProfilePayload,
): Promise<UserProfile> => {
  const response = await fetch(`${API_BASE_URL}/auth/profile`, {
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
    throw new Error(data.message || "Failed to update profile");
  }

  // Sync localStorage with updated profile
  const currentUser = getCurrentUser();
  if (currentUser) {
    const updated = {
      ...currentUser,
      firstName: data.profile.firstName,
    };
    localStorage.setItem("currentUser", JSON.stringify(updated));
  }

  return data.profile as UserProfile;
};

export const changePassword = async (
  payload: ChangePasswordPayload,
): Promise<{ status: string; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
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
    throw new Error(data.message || "Failed to change password");
  }

  return data;
};

export const forgotPassword = async (
  payload: ForgotPasswordPayload,
): Promise<{ status: string; message: string; expiresIn?: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as
    | { status: string; message: string; expiresIn?: string }
    | ApiErrorResponse;

  if (!response.ok) {
    throw new Error(data.message || "Failed to send password reset OTP");
  }

  return data as { status: string; message: string; expiresIn?: string };
};

export const verifyResetOTP = async (
  payload: VerifyResetOTPPayload,
): Promise<{ status: string; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/verify-reset-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as
    | { status: string; message: string }
    | ApiErrorResponse;

  if (!response.ok) {
    throw new Error(data.message || "Failed to verify OTP");
  }

  return data as { status: string; message: string };
};

export const resetForgottenPassword = async (
  payload: ResetPasswordPayload,
): Promise<{ status: string; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as
    | { status: string; message: string }
    | ApiErrorResponse;

  if (!response.ok) {
    throw new Error(data.message || "Failed to reset password");
  }

  return data as { status: string; message: string };
};

// ── Customer Account Types & API ─────────────────────────────────

export interface CustomerAccountExecutive {
  executiveId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  region: string | null;
}

export interface CustomerService {
  serviceId: number;
  accountId: number;
  accountName: string | null;
  msisdn: string | null;
  serviceType: string;
  status: string;
}

export interface CustomerContract {
  contractId: number;
  accountId: number | null;
  accountName: string | null;
  contractType: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  contractEffectiveDate: string | null;
  srNumber: string | null;
  usageLimit: string | null;
  entitlement: string | null;
  notes: string | null;
}

export interface CustomerAccountInfo {
  accountId: number;
  accountNumber: string;
  accountName: string;
  accountType: string;
  industry: string | null;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string | null;
  isActive: boolean;
  approvalStatus: string;
  createdAt: string;
}

export interface CustomerCorporateInfo {
  corporateId: number;
  corporateNumber: string;
  corporateName: string;
  corporateType: string;
  businessEmail: string;
  industry: string | null;
}

export interface CustomerAccountManagerInfo {
  accountManagerId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface CustomerAccountResponse {
  corporate?: CustomerCorporateInfo;
  accountManager?: CustomerAccountManagerInfo;
  accounts?: CustomerAccountInfo[];
  account: CustomerAccountInfo;
  executive: CustomerAccountExecutive | null;
  services: CustomerService[];
  contracts: CustomerContract[];
}

// ── Executive's Assigned Accounts ─────────────────────────────────

export interface ExecutiveAccountRecord {
  accountId: number;
  corporateId: number | null;
  corporateName: string | null;
  accountNumber: string;
  accountName: string;
  accountType: string;
  industry: string | null;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string | null;
  isActive: boolean;
  approvalStatus: string;
  createdAt: string;
  services: CustomerService[];
  contracts: CustomerContract[];
}

export const getMyAccounts = async (): Promise<ExecutiveAccountRecord[]> => {
  const response = await fetch(`${API_BASE_URL}/auth/my-accounts`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch accounts");
  }

  return data.accounts as ExecutiveAccountRecord[];
};

export const getMyAccount = async (): Promise<CustomerAccountResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/my-account`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch account");
  }

  return data as CustomerAccountResponse;
};
