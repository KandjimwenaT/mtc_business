import type { TicketRecord } from "../api/ticketApi";

export type SlaStateKey = "healthy" | "warning" | "at_risk" | "breached" | "closed";

export type SlaBadgeStatus = "success" | "warning" | "danger" | "breached";

const CLOSED = new Set(["resolved", "closed", "rejected"]);

function hoursBetween(fromMs: number, toMs: number) {
  return (toMs - fromMs) / 3_600_000;
}

export function formatDurationHours(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const abs = Math.abs(hours);
  const h = Math.floor(abs);
  const m = Math.floor((abs - h) * 60);
  const sign = hours < 0 ? "-" : "";
  return `${sign}${h}h ${m}m`;
}

export function getSlaState(ticket: Pick<
  TicketRecord,
  "status" | "slaDeadline" | "createdAt" | "slaWarningHours" | "slaAtRiskHours"
>): { key: SlaStateKey; label: string; remainingHours: number | null; elapsedHours: number } {
  const now = Date.now();
  const created = new Date(ticket.createdAt).getTime();
  const elapsedHours = Number.isFinite(created) ? hoursBetween(created, now) : 0;

  if (CLOSED.has(ticket.status) || !ticket.slaDeadline) {
    return { key: "closed", label: "—", remainingHours: null, elapsedHours };
  }

  const deadline = new Date(ticket.slaDeadline).getTime();
  const remaining = hoursBetween(now, deadline);

  if (remaining <= 0) {
    return { key: "breached", label: "Breached", remainingHours: remaining, elapsedHours };
  }

  if (ticket.slaAtRiskHours != null && remaining <= ticket.slaAtRiskHours) {
    return { key: "at_risk", label: "At Risk", remainingHours: remaining, elapsedHours };
  }
  if (ticket.slaWarningHours != null && remaining <= ticket.slaWarningHours) {
    return { key: "warning", label: "Warning", remainingHours: remaining, elapsedHours };
  }

  const total = deadline - created;
  const pct = total > 0 ? (deadline - now) / total : 0;
  if (pct <= 0.15) return { key: "at_risk", label: "At Risk", remainingHours: remaining, elapsedHours };
  if (pct <= 0.35) return { key: "warning", label: "Warning", remainingHours: remaining, elapsedHours };
  return { key: "healthy", label: "On Track", remainingHours: remaining, elapsedHours };
}

export function getSlaInfo(ticket: TicketRecord): {
  status: SlaBadgeStatus;
  label: string;
  time: string;
  key: SlaStateKey;
} {
  const state = getSlaState(ticket);
  if (state.key === "closed") {
    return { status: "success", label: "—", time: "", key: state.key };
  }
  const remaining = state.remainingHours ?? 0;
  const timeStr =
    remaining >= 0 ? `${formatDurationHours(remaining)} left` : formatDurationHours(remaining);
  if (state.key === "breached") return { status: "breached", label: "Breached", time: timeStr, key: state.key };
  if (state.key === "at_risk") return { status: "danger", label: "At Risk", time: timeStr, key: state.key };
  if (state.key === "warning") return { status: "warning", label: "Warning", time: timeStr, key: state.key };
  return { status: "success", label: "On Track", time: timeStr, key: state.key };
}

export function getSlaHealthLabel(ticket: TicketRecord): "Healthy" | "Warning" | "At Risk" | "Breached" {
  const key = getSlaState(ticket).key;
  if (key === "breached") return "Breached";
  if (key === "at_risk") return "At Risk";
  if (key === "warning") return "Warning";
  return "Healthy";
}

export function getEscalationLevel(ticket: Pick<
  TicketRecord,
  "status" | "createdAt" | "slaEscalateL1Hours" | "slaEscalateL2Hours" | "slaEscalateL3Hours" | "slaEscalationLevel"
>): number {
  if (CLOSED.has(ticket.status)) return Number(ticket.slaEscalationLevel) || 0;
  const elapsed = hoursBetween(new Date(ticket.createdAt).getTime(), Date.now());
  const l3 = ticket.slaEscalateL3Hours;
  const l2 = ticket.slaEscalateL2Hours;
  const l1 = ticket.slaEscalateL1Hours;
  if (l3 != null && elapsed >= l3) return 3;
  if (l2 != null && elapsed >= l2) return 2;
  if (l1 != null && elapsed >= l1) return 1;
  return 0;
}

export function escalationLabel(level: number): string {
  if (level >= 3) return "L3 (GM)";
  if (level === 2) return "L2 (Manager)";
  if (level === 1) return "L1 (Supervisor)";
  return "L0 (Executive)";
}

export function formatTicketTypeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
