import { create } from "zustand";

const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
export const API_URL = import.meta.env.VITE_API_URL || (isLocalHost ? "http://localhost:3001/api" : "/api");

// Public links (invoice PDFs shared over WhatsApp) must point at the API host, which is
// a different port during local development but the same origin in production.
export const PUBLIC_BASE = API_URL.startsWith("http")
  ? API_URL.replace(/\/api$/, "")
  : window.location.origin;

const TOKEN_KEY = "ob_token";
const USER_KEY = "ob_user";

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export const useAuth = create((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: readStoredUser(),
  async login(email, password) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(email).trim(), password }),
      credentials: "include"
    });
    const data = await readBody(response);
    if (!response.ok) throw new ApiError(data?.message || "Could not sign in.", response.status);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    set({ token: data.token, user: data.user });
    return data.user;
  },
  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user });
  },
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null });
  },
  headers() {
    const token = get().token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}));

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// An error response is not always JSON — a gateway timeout or an HTML error page used to
// make `response.json()` throw its own parse error, hiding the real status.
async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 200) };
  }
}

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...useAuth.getState().headers(), ...(options.headers || {}) },
      credentials: "include",
      cache: "no-store"
    });
  } catch {
    throw new ApiError("No connection. Check your internet and try again.", 0);
  }

  const data = await readBody(response);
  if (!response.ok) {
    // A dead or expired token should return the user to the login screen rather than
    // leaving every page stuck on a spinner.
    if (response.status === 401 && useAuth.getState().token) {
      useAuth.getState().logout();
    }
    throw new ApiError(data?.message || `Request failed (${response.status})`, response.status);
  }
  return data;
}

export function apiUpload(path, formData) {
  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: useAuth.getState().headers(),
    body: formData,
    credentials: "include"
  }).then(async (response) => {
    const data = await readBody(response);
    if (!response.ok) throw new ApiError(data?.message || "Upload failed.", response.status);
    return data;
  });
}
