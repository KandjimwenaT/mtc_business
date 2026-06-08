# Microsoft Teams / Outlook calendar for visits

When an account manager **approves** a visit (or a visit becomes **confirmed** after reschedule), the backend:

1. Emails a **`.ics` calendar invite** to the **executive**, **all corporate contact persons**, and **named attendees**.
2. If the **executive** has connected Microsoft under **Profile → Settings**, creates/updates a **Teams/Outlook event** on their calendar and invites the same people via Graph.

## Server environment variables

```env
# Azure AD app registration (multi-tenant or single-tenant)
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=

# OAuth redirect — must match Azure portal (API callback URL)
AZURE_REDIRECT_URI=http://localhost:3003/api/auth/microsoft/callback
API_PUBLIC_URL=http://localhost:3003

FRONTEND_URL=http://localhost:5173
VISIT_CALENDAR_TIMEZONE=Africa/Windhoek
```

## Azure portal checklist

1. **App registration** → Authentication → add redirect URI: `AZURE_REDIRECT_URI`.
2. **API permissions** (delegated): `User.Read`, `Calendars.ReadWrite`, `OnlineMeetings.ReadWrite`, `offline_access`.
3. **Grant admin consent** for your organisation (recommended).
4. Executives open **Profile Settings → Connect Microsoft account** once.

## Database migration

```bash
cd backend && npm run migrate:microsoft-calendar
```
