// export const API_BASE_URL =
//   import.meta.env.VITE_API_BASE_URL || "http://41.219.71.27:3000/api";


// export const API_BASE_URL = "http://localhost:3003/api";
export const API_BASE_URL = "http://uat-api.erongored.com.na/mtc/api";

/** Origin for static assets (e.g. `/uploads/...`) — strip trailing `/api` from API base. */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

// export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

// export const API_BASE_URL = "http://uat-api.erongored.com.na/mtc/api";