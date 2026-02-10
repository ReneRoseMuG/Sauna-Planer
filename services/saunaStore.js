import { sanitizeSauna } from "../domain/sauna.js";

const DB_NAME = "sauna_planner_db";
const DB_VERSION = 1;
const SAUNAS_STORE = "saunas";
const SETTINGS_STORE = "settings";

/** @type {IDBDatabase | null} */
let db = null;

/**
 * @returns {Promise<void>}
 */
export async function initStore() {
  if (db) return;
  db = await openDatabase();
}

/**
 * @returns {Promise<import("../domain/sauna.js").Sauna[]>}
 */
export async function loadInitialData() {
  await initStore();
  return getAll();
}

/**
 * @returns {Promise<import("../domain/sauna.js").Sauna[]>}
 */
export async function getAll() {
  const database = await requireDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(SAUNAS_STORE, "readonly");
    const store = tx.objectStore(SAUNAS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const list = Array.isArray(request.result) ? request.result : [];
      const sanitized = list.map((item) => sanitizeSauna(item));
      sanitized.sort((a, b) => a.name.localeCompare(b.name, "de"));
      resolve(sanitized);
    };
    request.onerror = () => reject(request.error || new Error("Fehler beim Lesen der Sauna-Liste."));
  });
}

/**
 * @param {string} id
 * @returns {Promise<import("../domain/sauna.js").Sauna | null>}
 */
export async function getById(id) {
  const database = await requireDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(SAUNAS_STORE, "readonly");
    const store = tx.objectStore(SAUNAS_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ? sanitizeSauna(request.result) : null);
    request.onerror = () => reject(request.error || new Error("Fehler beim Lesen des Sauna-Datensatzes."));
  });
}

/**
 * @param {import("../domain/sauna.js").Sauna} sauna
 * @returns {Promise<void>}
 */
export async function upsert(sauna) {
  const sanitized = sanitizeSauna(sauna);
  await putSauna(sanitized);
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
  const database = await requireDb();
  await new Promise((resolve, reject) => {
    const tx = database.transaction(SAUNAS_STORE, "readwrite");
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error || new Error("Fehler beim Loeschen des Datensatzes."));
    tx.objectStore(SAUNAS_STORE).delete(id);
  });
}

/**
 * @param {import("../domain/sauna.js").Sauna[]} saunas
 * @returns {Promise<void>}
 */
export async function replaceAll(saunas) {
  const database = await requireDb();
  await new Promise((resolve, reject) => {
    const tx = database.transaction(SAUNAS_STORE, "readwrite");
    const store = tx.objectStore(SAUNAS_STORE);
    store.clear();
    for (const sauna of saunas) {
      store.put(sanitizeSauna(sauna));
    }
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error || new Error("Fehler beim Ersetzen der Datensaetze."));
  });
}

/**
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getMeta(key) {
  const database = await requireDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(SETTINGS_STORE, "readonly");
    const request = tx.objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
    request.onerror = () => reject(request.error || new Error("Fehler beim Lesen von Metadaten."));
  });
}

/**
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export async function setMeta(key, value) {
  const database = await requireDb();
  await new Promise((resolve, reject) => {
    const tx = database.transaction(SETTINGS_STORE, "readwrite");
    tx.objectStore(SETTINGS_STORE).put({ key, value });
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error || new Error("Fehler beim Speichern von Metadaten."));
  });
}

async function putSauna(sauna) {
  const database = await requireDb();
  await new Promise((resolve, reject) => {
    const tx = database.transaction(SAUNAS_STORE, "readwrite");
    tx.objectStore(SAUNAS_STORE).put(sauna);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error || new Error("Fehler beim Speichern des Datensatzes."));
  });
}

async function requireDb() {
  await initStore();
  if (!db) {
    throw new Error("Datenbank konnte nicht initialisiert werden.");
  }
  return db;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error || new Error("IndexedDB konnte nicht geoeffnet werden."));
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(SAUNAS_STORE)) {
        const saunasStore = database.createObjectStore(SAUNAS_STORE, { keyPath: "id" });
        saunasStore.createIndex("name", "name", { unique: false });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

