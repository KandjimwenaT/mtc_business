import { useEffect } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import {
  redirectToLogin,
  shouldForceLogout,
  touchSession,
} from "./session";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
] as const;

const CHECK_INTERVAL_MS = 60_000;

/**
 * Logs the user out after inactivity or when JWTs expire.
 * Mount only under authenticated routes.
 */
export function useSessionWatch(): void {
  const location = useLocation();

  useEffect(() => {
    if (!localStorage.getItem("accessToken")) return;

    touchSession();

    const enforce = (showToast: boolean) => {
      if (!shouldForceLogout()) return;
      if (showToast) {
        toast.info("Your session ended due to inactivity. Please sign in again.");
      }
      redirectToLogin();
    };

    let lastTouch = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouch < 1000) return;
      lastTouch = now;
      touchSession();
    };

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, onActivity, { passive: true });
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        enforce(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const interval = window.setInterval(() => enforce(true), CHECK_INTERVAL_MS);
    enforce(false);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [location.pathname]);
}
