import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from "./ui-components";
import { Calendar, Link2, Unlink } from "lucide-react";
import {
  disconnectMicrosoftCalendar,
  getMicrosoftCalendarStatus,
  startMicrosoftCalendarConnect,
} from "../api/authApi";

interface MicrosoftCalendarConnectProps {
  /** Shown for executives who publish Teams/Outlook events when visits are approved. */
  showForOrganizer?: boolean;
}

export default function MicrosoftCalendarConnect({ showForOrganizer = true }: MicrosoftCalendarConnectProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const status = await getMicrosoftCalendarStatus();
      setConfigured(status.configured);
      setConnected(status.connected);
      setConnectedAt(status.connectedAt);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Microsoft calendar status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    const ms = searchParams.get("microsoft");
    if (!ms) return;
    if (ms === "connected") {
      toast.success("Microsoft calendar connected", {
        description: "Approved visits will create Teams/Outlook events from your mailbox.",
      });
      loadStatus();
    } else if (ms === "error") {
      toast.error("Microsoft calendar connection failed", {
        description: searchParams.get("message") || "Please try again.",
      });
    }
    searchParams.delete("microsoft");
    searchParams.delete("message");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const { url } = await startMicrosoftCalendarConnect();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start Microsoft sign-in");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setConnecting(true);
      await disconnectMicrosoftCalendar();
      toast.info("Microsoft calendar disconnected");
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-5 w-5 text-mtc-blue" />
          Microsoft Teams / Outlook calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-600">
        <p>
          When an account manager <strong>approves</strong> a visit, everyone involved (executive, customer contacts,
          and attendees) receives a calendar invite by email.{" "}
          {showForOrganizer && (
            <>
              If you connect Microsoft here, the same meeting is also created on <strong>your</strong> Outlook/Teams
              calendar and invitations are sent from your mailbox.
            </>
          )}
        </p>
        {loading ? (
          <p className="text-slate-500">Loading connection status…</p>
        ) : !configured ? (
          <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Microsoft integration is not configured on the server yet (Azure app registration required).
            Calendar invites by email (.ics) still work when visits are approved.
          </p>
        ) : showForOrganizer ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={connected ? "success" : "neutral"}>
              {connected ? "Connected" : "Not connected"}
            </Badge>
            {connected && connectedAt && (
              <span className="text-xs text-slate-500">
                Since {new Date(connectedAt).toLocaleDateString()}
              </span>
            )}
            {connected ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={connecting}
                onClick={handleDisconnect}
              >
                <Unlink className="h-4 w-4" />
                Disconnect
              </Button>
            ) : (
              <Button size="sm" className="gap-2" disabled={connecting} onClick={handleConnect}>
                <Link2 className="h-4 w-4" />
                {connecting ? "Redirecting…" : "Connect Microsoft account"}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-slate-500">
            You will receive calendar invites by email when visits are approved. No Microsoft sign-in is required on
            your side.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
