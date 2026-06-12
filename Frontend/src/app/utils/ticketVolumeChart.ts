import type { TicketRecord } from "../api/ticketApi";

export type TicketVolumeDay = {
  date: string;
  label: string;
  weekday: string;
  opened: number;
  resolved: number;
};

const RESOLVED_STATUSES = new Set(["resolved", "closed"]);

function toLocalDateKey(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekday(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function formatFullDate(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function buildTicketVolumeChartData(tickets: TicketRecord[], days: number): TicketVolumeDay[] {
  const safeDays = Math.max(1, Math.min(days, 90));
  const today = startOfLocalDay();
  const rows: TicketVolumeDay[] = [];

  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const date = toLocalDateKey(d);
    rows.push({
      date,
      label: formatDayLabel(d),
      weekday: formatWeekday(d),
      opened: 0,
      resolved: 0,
    });
  }

  const byDate = new Map(rows.map((row) => [row.date, row]));

  tickets.forEach((ticket) => {
    const openedOn = toLocalDateKey(ticket.createdAt);
    const openedRow = byDate.get(openedOn);
    if (openedRow) openedRow.opened += 1;

    if (!RESOLVED_STATUSES.has(ticket.status)) return;

    const resolvedOn = toLocalDateKey(ticket.resolvedAt || ticket.closedAt || ticket.updatedAt);
    const resolvedRow = byDate.get(resolvedOn);
    if (resolvedRow) resolvedRow.resolved += 1;
  });

  return rows;
}

export function getTicketVolumeTooltipLabel(dateKey: string): string {
  return formatFullDate(dateKey);
}
