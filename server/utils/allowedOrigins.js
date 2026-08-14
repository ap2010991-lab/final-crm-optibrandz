// Origins allowed to make credentialed browser requests to this API.
//
// In production the React build and this API share one origin, so the safest rule is
// "the origin we are currently being served from". Vercel gives every deployment its
// own hostname, so hard-coding a single CLIENT_URL used to break on every redeploy.
const staticOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://localhost:3001"
]);

function addOrigin(value) {
  if (!value) return;
  const trimmed = String(value).trim().replace(/\/$/, "");
  if (!trimmed) return;
  staticOrigins.add(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
}

addOrigin(process.env.CLIENT_URL);
addOrigin(process.env.VERCEL_URL);
addOrigin(process.env.VERCEL_BRANCH_URL);
addOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL);
String(process.env.EXTRA_ALLOWED_ORIGINS || "").split(",").forEach(addOrigin);

function hostOf(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

// Any device on the local network needs to reach the dev server when testing the
// CRM on a real iPhone, e.g. http://192.168.1.20:5173.
function isPrivateNetworkDevOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;
  const host = hostOf(origin);
  if (!host) return false;
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host.split(":")[0]);
}

/**
 * @param {string|undefined} origin  Origin header, absent for same-origin GETs and curl.
 * @param {string|undefined} currentHost  Host this request was served on.
 */
function isAllowedOrigin(origin, currentHost) {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, "");
  if (staticOrigins.has(normalized)) return true;
  if (currentHost && hostOf(normalized) === currentHost) return true;
  if (isPrivateNetworkDevOrigin(normalized)) return true;
  return false;
}

module.exports = { isAllowedOrigin, staticOrigins };
