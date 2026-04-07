import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { getAllTickets, getAssignedTickets, type TicketRecord } from "../api/ticketApi";
import { getManagerVisits, getPendingReschedules, getMyVisits, type VisitRecord } from "../api/visitApi";
import { getCurrentUser } from "../api/authApi";
import { isSupervisorRole } from "../utils/roleCapabilities";

const OPEN_TICKET = new Set(["new", "assigned", "in_progress", "escalated"]);

function slaBreached(t: TicketRecord): boolean {
  if (!t.slaDeadline || ["resolved", "closed", "rejected"].includes(t.status)) return false;
  return new Date(t.slaDeadline).getTime() < Date.now();
}

function ticketNeedsAttention(t: TicketRecord): boolean {
  return OPEN_TICKET.has(t.status) || slaBreached(t);
}

function isOverdueActiveVisit(visit: VisitRecord): boolean {
  const start = new Date(`${visit.visitDate}T${visit.startTime}`);
  return start < new Date() && ["pending", "approved", "confirmed", "rescheduled"].includes(visit.status);
}

export type SupervisorHybridBadgesState = {
  /** Show on active "Manager Oversight" tab when team/manager queue needs attention */
  managerSideDot: boolean;
  /** Show on active "My Executive Work" tab when your executive queue needs attention */
  executiveSideDot: boolean;
  ticketsNavDot: boolean;
  visitsNavDot: boolean;
  refresh: () => Promise<void>;
  isSupervisor: boolean;
};

export function defaultSupervisorBadges(): SupervisorHybridBadgesState {
  return {
    managerSideDot: false,
    executiveSideDot: false,
    ticketsNavDot: false,
    visitsNavDot: false,
    refresh: async () => {},
    isSupervisor: false,
  };
}

export function useSupervisorHybridBadges(): SupervisorHybridBadgesState {
  const location = useLocation();
  const user = getCurrentUser();
  const isSupervisor = isSupervisorRole(user?.role);
  const [managerSideDot, setManagerSideDot] = useState(false);
  const [executiveSideDot, setExecutiveSideDot] = useState(false);
  const [ticketsNavDot, setTicketsNavDot] = useState(false);
  const [visitsNavDot, setVisitsNavDot] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSupervisor) {
      setManagerSideDot(false);
      setExecutiveSideDot(false);
      setTicketsNavDot(false);
      setVisitsNavDot(false);
      return;
    }
    try {
      const [allTickets, assignedTickets, myVisits, managerVisits, reschedules] = await Promise.all([
        getAllTickets(),
        getAssignedTickets(),
        getMyVisits(),
        getManagerVisits(),
        getPendingReschedules(),
      ]);

      const managerTicketsAttention = allTickets.some(ticketNeedsAttention);
      const pendingRescheduleCount = reschedules.filter((r) => r.execRescheduleStatus === "pending_approval").length;
      const managerVisitsAttention = pendingRescheduleCount > 0 || managerVisits.some(isOverdueActiveVisit);

      const executiveTicketsAttention = assignedTickets.some(ticketNeedsAttention);
      const executiveVisitsAttention = myVisits.some(isOverdueActiveVisit);

      setManagerSideDot(managerTicketsAttention || managerVisitsAttention);
      setExecutiveSideDot(executiveTicketsAttention || executiveVisitsAttention);
      setTicketsNavDot(managerTicketsAttention || executiveTicketsAttention);
      setVisitsNavDot(managerVisitsAttention || executiveVisitsAttention);
    } catch {
      setManagerSideDot(false);
      setExecutiveSideDot(false);
      setTicketsNavDot(false);
      setVisitsNavDot(false);
    }
  }, [isSupervisor]);

  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  return {
    managerSideDot,
    executiveSideDot,
    ticketsNavDot,
    visitsNavDot,
    refresh,
    isSupervisor,
  };
}
