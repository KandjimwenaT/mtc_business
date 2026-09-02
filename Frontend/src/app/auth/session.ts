/** Idle time before automatic logout (no mouse, keyboard, scroll, or touch). */
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const LAST_ACTIVITY_KEY = "lastActivityAt";

function getTokenExpiryMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  const exp = getTokenExpiryMs(token);
  if (exp === null) return false;
  return Date.now() >= exp;
}

export function touchSession(): void {
  if (!localStorage.getItem("accessToken")) return;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function clearAuthSession(): void {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("currentUser");
  localStorage.removeItem(LAST_ACTIVITY_KEY);
}

export function isInactive(): boolean {
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!raw) return false;
  const last = Number(raw);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last >= INACTIVITY_TIMEOUT_MS;
}

/** True when the stored session should be cleared (idle too long or tokens expired). */
export function shouldForceLogout(): boolean {
  const accessToken = localStorage.getItem("accessToken");
  if (!accessToken) return false;

  if (isInactive()) return true;
  if (isTokenExpired(accessToken)) return true;

  const refreshToken = localStorage.getItem("refreshToken");
  if (refreshToken && isTokenExpired(refreshToken)) return true;

  return false;
}

export function hasValidSession(): boolean {
  return Boolean(localStorage.getItem("accessToken")) && !shouldForceLogout();
}

export function needsPasswordChange(): boolean {
  try {
    const raw = localStorage.getItem("currentUser");
    if (!raw) return false;
    const user = JSON.parse(raw) as { mustChangePassword?: boolean };
    return Boolean(user?.mustChangePassword);
  } catch {
    return false;
  }
}

export function redirectToLogin(): void {
  clearAuthSession();
  if (window.location.pathname !== "/" && window.location.pathname !== "/forgot-password") {
    window.location.href = "/";
  }
}
