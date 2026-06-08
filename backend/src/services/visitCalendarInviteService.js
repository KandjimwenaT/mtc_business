const Visit = require("../models/Visit");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const User = require("../models/User");
const emailService = require("./emailService");
const { resolveVisitCalendarRecipients } = require("./visitRecipientService");
const microsoftGraphCalendarService = require("./microsoftGraphCalendarService");

const CALENDAR_TZ = process.env.VISIT_CALENDAR_TIMEZONE || "Africa/Windhoek";
const ICS_DOMAIN = process.env.VISIT_CALENDAR_ICS_DOMAIN || "mtc-business.local";

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatIcsUtc(dt) {
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`;
}

function parseVisitWindow(visit) {
  const start = new Date(`${visit.visitDate}T${visit.startTime}`);
  const end = new Date(`${visit.visitDate}T${visit.endTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) end.setHours(end.getHours() + 1);
  return { start, end };
}

function escapeIcs(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function buildIcsContent(visit, { method = "REQUEST", sequence = 0, recipients = [] } = {}) {
  const window = parseVisitWindow(visit);
  if (!window) return null;

  const uid = `visit-${visit.visitId}@${ICS_DOMAIN}`;
  const now = formatIcsUtc(new Date());
  const dtstamp = now;
  const dtstart = formatIcsUtc(window.start);
  const dtend = formatIcsUtc(window.end);
  const status = method === "CANCEL" ? "CANCELLED" : "CONFIRMED";
  const meetingTypeLabel = visit.meetingType === "online" ? "Online" : "In-person";
  const location =
    visit.meetingType === "online"
      ? visit.onlineLink || "Microsoft Teams (link in portal)"
      : visit.location || "To be confirmed";
  const summary = escapeIcs(`${visit.purpose} — ${visit.accountName} (${visit.visitNumber})`);
  const description = escapeIcs(
    [
      `Visit: ${visit.visitNumber}`,
      `Customer: ${visit.accountName}`,
      `Purpose: ${visit.purpose}`,
      `Executive: ${visit.executiveName}`,
      `Type: ${meetingTypeLabel}`,
      visit.agenda ? `Agenda: ${visit.agenda}` : null,
      visit.meetingType === "online" && visit.onlineLink ? `Link: ${visit.onlineLink}` : null,
    ]
      .filter(Boolean)
      .join("\\n"),
  );

  const attendeeLines = recipients
    .filter((r) => r.email)
    .map(
      (r) =>
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${escapeIcs(r.fullName)}:mailto:${r.email}`,
    );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MTC Business//Visit Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:" + method,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${escapeIcs(location)}`,
    `STATUS:${status}`,
    `ORGANIZER;CN=${escapeIcs(visit.executiveName)}:mailto:${visit.executiveEmail}`,
    ...attendeeLines,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

async function resolveExecutiveOrganizerUser(visit) {
  const exec = await ExecutiveStaff.findByPk(visit.executiveId, {
    attributes: ["executiveId", "userId", "email"],
  });
  if (!exec?.userId) return null;
  return User.findByPk(exec.userId);
}

/**
 * Send .ics invites to executive, customers, and attendees; sync Teams/Outlook when executive linked Microsoft.
 */
async function syncVisitCalendarInvites(visitInput, { cancel = false } = {}) {
  const visit =
    visitInput?.reload && typeof visitInput.reload === "function"
      ? visitInput
      : await Visit.findByPk(visitInput.visitId || visitInput);
  if (!visit) return { skipped: true, reason: "visit_not_found" };

  const recipients = await resolveVisitCalendarRecipients(visit);
  if (!recipients.length) {
    return { skipped: true, reason: "no_recipients" };
  }

  const nextSequence = (visit.calendarSequence || 0) + 1;
  const method = cancel ? "CANCEL" : "REQUEST";
  const ics = buildIcsContent(visit, { method, sequence: nextSequence, recipients });
  if (!ics) {
    return { skipped: true, reason: "invalid_visit_times" };
  }

  const emailResults = await Promise.all(
    recipients.map((r) =>
      emailService
        .sendVisitCalendarInviteEmail(r.email, r.fullName, visit, ics, { cancel })
        .catch((err) => {
          console.error(`ICS calendar email failed for ${r.email} (${visit.visitNumber}):`, err?.message || err);
          return { success: false, email: r.email };
        }),
    ),
  );

  let graphResult = { skipped: true, reason: "not_configured" };
  const organizerUser = await resolveExecutiveOrganizerUser(visit);

  if (cancel && visit.graphEventId && organizerUser) {
    graphResult = await microsoftGraphCalendarService.deleteCalendarEvent(organizerUser, visit.graphEventId);
    await visit.update({
      graphEventId: null,
      calendarSequence: nextSequence,
      calendarLastSyncedAt: new Date(),
    });
  } else if (!cancel) {
    if (organizerUser && microsoftGraphCalendarService.isConfigured()) {
      if (visit.graphEventId) {
        graphResult = await microsoftGraphCalendarService.updateCalendarEvent(
          organizerUser,
          visit.graphEventId,
          visit,
          recipients,
        );
      } else {
        graphResult = await microsoftGraphCalendarService.createCalendarEvent(
          organizerUser,
          visit,
          recipients,
        );
        if (graphResult?.eventId) {
          const graphPatch = { graphEventId: graphResult.eventId };
          if (graphResult.joinUrl && visit.meetingType === "online" && !visit.onlineLink) {
            graphPatch.onlineLink = graphResult.joinUrl;
          }
          await visit.update(graphPatch);
        }
      }
    }
    await visit.update({
      calendarSequence: nextSequence,
      calendarLastSyncedAt: new Date(),
    });
  }

  return {
    recipients: recipients.length,
    emailsSent: emailResults.filter((r) => r?.success !== false).length,
    graph: graphResult,
    sequence: nextSequence,
  };
}

module.exports = {
  syncVisitCalendarInvites,
  buildIcsContent,
  CALENDAR_TZ,
};
