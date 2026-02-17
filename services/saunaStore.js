import { sanitizeSauna } from "../domain/sauna.js";

const API_BASE = "/api";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (res.status === 204) return null;

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API-Fehler ${res.status}`);
  }

  return res.json();
}

/**
 * @returns {Promise<void>}
 */
export async function loadInitialData() {
  // No-op: Server seeds the database automatically
}

/**
 * @returns {Promise<import("../domain/sauna.js").Sauna[]>}
 */
export async function getAll() {
  const list = await apiFetch("/saunas");
  return Array.isArray(list) ? list.map((item) => sanitizeSauna(item)) : [];
}

/**
 * @param {string} id
 * @returns {Promise<import("../domain/sauna.js").Sauna | null>}
 */
export async function getById(id) {
  try {
    const data = await apiFetch(`/saunas/${encodeURIComponent(id)}`);
    return data ? sanitizeSauna(data) : null;
  } catch {
    return null;
  }
}

/**
 * @param {import("../domain/sauna.js").Sauna} sauna
 * @returns {Promise<void>}
 */
export async function upsert(sauna) {
  const sanitized = sanitizeSauna(sauna);
  await apiFetch(`/saunas/${encodeURIComponent(sanitized.id)}`, {
    method: "PUT",
    body: JSON.stringify(sanitized),
  });
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
  await apiFetch(`/saunas/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
