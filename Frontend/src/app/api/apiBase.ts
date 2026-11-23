const configured =
  typeof import.meta.env.VITE_API_BASE_URL === "string"
    ? import.meta.env.VITE_API_BASE_URL.trim()
    : "";

// Local `npm run dev` leaves this unset and talks to the API on port 3004.
// The Docker image sets VITE_API_BASE_URL=/api so the browser uses the same host as the site.
export const API_BASE_URL = configured || "http://localhost:3004/api";

/** Origin for static assets (e.g. `/uploads/...`) and Socket.IO. Empty means the current page host. */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
