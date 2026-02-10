import { sanitizeSauna } from "../domain/sauna.js";

/** @type {import("../domain/sauna.js").Sauna[]} */
let saunas = [];

/**
 * @returns {Promise<import("../domain/sauna.js").Sauna[]>}
 */
export async function loadInitialData() {
  try {
    const response = await fetch("./data/saunas.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = await response.json();
    if (!Array.isArray(parsed)) {
      throw new Error("JSON muss ein Array sein.");
    }
    saunas = parsed.map((item) => sanitizeSauna(item));
  } catch (_error) {
    saunas = [];
  }
  return getAll();
}

/**
 * @returns {import("../domain/sauna.js").Sauna[]}
 */
export function getAll() {
  return saunas.map((item) => sanitizeSauna(item));
}

/**
 * @param {string} id
 * @returns {import("../domain/sauna.js").Sauna | null}
 */
export function getById(id) {
  const found = saunas.find((item) => item.id === id);
  return found ? sanitizeSauna(found) : null;
}

/**
 * @param {import("../domain/sauna.js").Sauna} sauna
 */
export function upsert(sauna) {
  const sanitized = sanitizeSauna(sauna);
  const index = saunas.findIndex((item) => item.id === sanitized.id);
  if (index >= 0) {
    saunas[index] = sanitized;
    return;
  }
  saunas.push(sanitized);
}

/**
 * @param {string} id
 */
export function remove(id) {
  saunas = saunas.filter((item) => item.id !== id);
}

/**
 * @param {File} file
 * @returns {Promise<void>}
 */
export async function importFromJsonFile(file) {
  if (!file) {
    throw new Error("Keine Datei ausgewaehlt.");
  }
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    throw new Error("Datei enthaelt kein gueltiges JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("JSON muss ein Array von Sauna-Objekten enthalten.");
  }
  saunas = parsed.map((item) => sanitizeSauna(item));
}

/**
 * @returns {Blob}
 */
export function exportToJsonBlob() {
  const data = JSON.stringify(saunas, null, 2);
  return new Blob([data], { type: "application/json" });
}
