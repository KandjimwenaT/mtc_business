const { encrypt, decrypt } = require("./tokenCrypto");

const CALENDAR_TZ = process.env.VISIT_CALENDAR_TIMEZONE || "Africa/Windhoek";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = ["offline_access", "User.Read", "Calendars.ReadWrite", "OnlineMeetings.ReadWrite"];

function isConfigured() {
  return Boolean(
    process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_TENANT_ID,
  );
}

function getRedirectUri() {
  const apiBase = process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3003}`;
  return process.env.AZURE_REDIRECT_URI || `${apiBase}/api/auth/microsoft/callback`;
}

function buildAuthorizeUrl(userId) {
  const { signOAuthState } = require("./tokenCrypto");
  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    response_mode: "query",
    scope: SCOPES.join(" "),
    state: signOAuthState(userId),
    prompt: "consent",
  });
  return `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    code,
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
    scope: SCOPES.join(" "),
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "Microsoft token exchange failed");
  }
  return data;
}

async function refreshAccessToken(user) {
  const refreshToken = decrypt(user.msGraphRefreshTokenEnc);
  if (!refreshToken) throw new Error("Microsoft calendar not connected");

  const body = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES.join(" "),
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "Microsoft token refresh failed");
  }
  return data.access_token;
}

async function getAccessToken(user) {
  if (user.msGraphAccessTokenEnc && user.msGraphTokenExpiresAt) {
    const expires = new Date(user.msGraphTokenExpiresAt).getTime();
    if (expires > Date.now() + 60_000) {
      const cached = decrypt(user.msGraphAccessTokenEnc);
      if (cached) return cached;
    }
  }
  return refreshAccessToken(user);
}

async function graphRequest(user, path, options = {}) {
  const token = await getAccessToken(user);
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || res.statusText;
    throw new Error(msg || `Graph API ${res.status}`);
  }
  return data;
}

function buildEventPayload(visit, recipients) {
  const start = `${visit.visitDate}T${visit.startTime}:00`;
  const end = `${visit.visitDate}T${visit.endTime}:00`;
  const attendeeEmails = recipients
    .map((r) => r.email)
    .filter((e) => e && e.toLowerCase() !== String(visit.executiveEmail || "").toLowerCase());

  const body = {
    subject: `${visit.purpose} — ${visit.accountName}`,
    body: {
      contentType: "HTML",
      content: [
        `<p><strong>Visit:</strong> ${visit.visitNumber}</p>`,
        `<p><strong>Customer:</strong> ${visit.accountName}</p>`,
        `<p><strong>Purpose:</strong> ${visit.purpose}</p>`,
        visit.agenda ? `<p><strong>Agenda:</strong> ${visit.agenda}</p>` : "",
        visit.meetingType === "online" && visit.onlineLink
          ? `<p><a href="${visit.onlineLink}">Join meeting</a></p>`
          : "",
      ].join(""),
    },
    start: { dateTime: start, timeZone: CALENDAR_TZ },
    end: { dateTime: end, timeZone: CALENDAR_TZ },
    location: {
      displayName:
        visit.meetingType === "online"
          ? visit.onlineLink || "Microsoft Teams"
          : visit.location || visit.accountName,
    },
    attendees: attendeeEmails.map((address) => ({
      emailAddress: { address },
      type: "required",
    })),
  };

  if (visit.meetingType === "online") {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  }

  return body;
}

async function createCalendarEvent(organizerUser, visit, recipients) {
  if (!organizerUser?.msGraphRefreshTokenEnc) {
    return { skipped: true, reason: "executive_not_connected" };
  }
  try {
    const payload = buildEventPayload(visit, recipients);
    const event = await graphRequest(organizerUser, "/me/events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      success: true,
      eventId: event.id,
      webLink: event.webLink,
      joinUrl: event.onlineMeeting?.joinUrl || null,
    };
  } catch (err) {
    console.error(`Graph create event failed (${visit.visitNumber}):`, err.message);
    return { success: false, error: err.message };
  }
}

async function updateCalendarEvent(organizerUser, eventId, visit, recipients) {
  if (!organizerUser?.msGraphRefreshTokenEnc) {
    return { skipped: true, reason: "executive_not_connected" };
  }
  try {
    const payload = buildEventPayload(visit, recipients);
    await graphRequest(organizerUser, `/me/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return { success: true, eventId };
  } catch (err) {
    console.error(`Graph update event failed (${visit.visitNumber}):`, err.message);
    return { success: false, error: err.message };
  }
}

async function deleteCalendarEvent(organizerUser, eventId) {
  if (!organizerUser?.msGraphRefreshTokenEnc || !eventId) {
    return { skipped: true, reason: "no_event" };
  }
  try {
    await graphRequest(organizerUser, `/me/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (err) {
    console.error("Graph delete event failed:", err.message);
    return { success: false, error: err.message };
  }
}

async function saveTokensForUser(user, tokenResponse) {
  const expiresAt = new Date(Date.now() + (tokenResponse.expires_in || 3600) * 1000);
  await user.update({
    msGraphRefreshTokenEnc: encrypt(tokenResponse.refresh_token),
    msGraphAccessTokenEnc: tokenResponse.access_token ? encrypt(tokenResponse.access_token) : null,
    msGraphTokenExpiresAt: expiresAt,
    msGraphConnectedAt: user.msGraphConnectedAt || new Date(),
  });
}

function userHasMicrosoftConnected(user) {
  return Boolean(user?.msGraphRefreshTokenEnc);
}

module.exports = {
  isConfigured,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  saveTokensForUser,
  userHasMicrosoftConnected,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  SCOPES,
};
