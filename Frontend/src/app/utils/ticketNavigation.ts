import { isExecutiveRole, type AppRole } from "./roleCapabilities";

export function getTicketDetailPath(role: AppRole, ticketId: number): string {
  if (role === "customer") {
    return "/customerTickets";
  }
  if (isExecutiveRole(role)) {
    return `/executive-tickets/${ticketId}`;
  }
  return `/tickets/${ticketId}`;
}

export function getTicketsListPath(role: AppRole): string {
  if (role === "customer") {
    return "/customerTickets";
  }
  if (isExecutiveRole(role)) {
    return "/executive-tickets";
  }
  return "/tickets";
}
