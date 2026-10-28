export type AppRole =
  | "admin"
  | "super_admin"
  | "customer"
  | "executive_staff"
  | "manager"
  | "supervisor"
  | "gm"
  | string
  | null
  | undefined;

export const isExecutiveRole = (role: AppRole): boolean =>
  role === "executive_staff" || role === "supervisor";

export const isManagerRole = (role: AppRole): boolean =>
  role === "manager" || role === "supervisor";

export const isSupervisorRole = (role: AppRole): boolean => role === "supervisor";

export const isGmRole = (role: AppRole): boolean => role === "gm";

export const isSuperAdminRole = (role: AppRole): boolean => role === "super_admin";

export const isPortalAdminRole = (role: AppRole): boolean =>
  role === "admin" || role === "super_admin";

export const hasGmOversightScope = (role: AppRole): boolean => isGmRole(role);

export const canAddTicketInternalNote = (role: AppRole): boolean =>
  ["admin", "super_admin", "manager", "supervisor", "gm", "executive_staff"].includes(role || "");
