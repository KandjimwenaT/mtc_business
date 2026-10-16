import { useEffect, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { API_ORIGIN } from "../api/apiBase";
import type { NotificationRecord } from "../api/notificationsApi";
import { dispatchLiveData } from "./liveEvents";

let socket: Socket | null = null;

function disconnectSocket(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      disconnectSocket();
      return;
    }

    disconnectSocket();
    const next = io(API_ORIGIN, {
      path: "/socket.io",
      auth: { token },
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socket = next;

    next.on("notification:new", (notification: NotificationRecord) => {
      window.dispatchEvent(new Event("notifications:changed"));
      dispatchLiveData({
        resources: ["notifications"],
        notificationType: notification?.type,
      });
      if (notification?.title) {
        toast.info(notification.title, {
          description: notification.message,
        });
      }
    });

    next.on("data:changed", (payload: { resources?: string[]; notificationType?: string }) => {
      dispatchLiveData({
        resources: payload?.resources ?? [],
        notificationType: payload?.notificationType,
      });
    });

    return () => {
      disconnectSocket();
    };
  }, []);

  return <>{children}</>;
}
