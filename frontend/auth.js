// ─── Auth utilities ──────────────────────────────────────────────────────────
// Used by all protected pages: index.html, admin.html, listino.html

const AUTH_TOKEN_KEY = "pv_token";
const AUTH_USER_KEY = "pv_user";

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function removeToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
  } catch {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function isSuperAdmin() {
  const user = getUser();
  return user && user.role === "superadmin";
}

/**
 * Fetch wrapper that adds Authorization header.
 * Same API as fetch() but automatically includes the Bearer token.
 */
async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers, cache: "no-store" });
}

/**
 * Check if user is authenticated. If not, redirect to /login.
 * Call this at the top of every protected page's init function.
 */
async function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = "/login";
    return null;
  }
  try {
    const res = await authFetch("/api/auth/me");
    if (!res.ok) {
      removeToken();
      window.location.href = "/login";
      return null;
    }
    const user = await res.json();
    setUser(user);
    return user;
  } catch {
    removeToken();
    window.location.href = "/login";
    return null;
  }
}

/**
 * Logout: remove token and redirect to login.
 */
function logout() {
  removeToken();
  window.location.href = "/login";
}

/**
 * Update header badge with user info if element exists.
 */
function renderUserBadge(containerId = "userBadge") {
  const container = document.getElementById(containerId);
  if (!container) return;
  const user = getUser();
  if (!user) return;

  const agencyLabel = user.agency_name || user.email;
  const isAdmin = user.role === "superadmin";

  container.innerHTML = `
    <div class="user-badge">
      <span class="user-badge-name">${agencyLabel}</span>
      ${isAdmin ? '<a href="/admin" class="user-badge-link">Admin</a>' : ""}
      <button class="user-badge-logout" onclick="logout()">Esci</button>
    </div>
  `;
}
