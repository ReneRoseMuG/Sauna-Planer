export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * @typedef {Object} SaunaConfig
 * @property {number} barrelLength
 * @property {number} barrelWidth
 * @property {number} footWidth
 * @property {number} footThickness
 * @property {number} foundationWidth
 * @property {number} foundationDepth
 * @property {number[]} footDistances Innenabstaende zwischen benachbarten Fuessen (Kante zu Kante, laengs)
 */

/**
 * @typedef {Object} Sauna
 * @property {string} id
 * @property {string} name
 * @property {SaunaConfig} config
 * @property {string} [imageDataUrl]
 */

/**
 * @returns {Sauna}
 */
export function createEmptySauna() {
  return {
    id: createSaunaId(),
    name: "Neues Modell",
    imageDataUrl: "",
    config: {
      barrelLength: 220,
      barrelWidth: 210,
      footWidth: 200,
      footThickness: 8,
      foundationWidth: 40,
      foundationDepth: 80,
      footDistances: [79, 100, 79],
    },
  };
}

/**
 * @param {unknown} raw
 * @returns {Sauna}
 */
export function sanitizeSauna(raw) {
  const source = isObject(raw) ? raw : {};
  const configSource = isObject(source.config) ? source.config : {};

  const footDistancesRaw = Array.isArray(configSource.footDistances) ? configSource.footDistances : [];
  const footDistances = footDistancesRaw
    .map((value) => sanitizeNumber(value))
    .filter((value) => Number.isFinite(value));
  const imageDataUrl = sanitizeImageDataUrl(source.imageDataUrl);

  return {
    id: sanitizeId(source.id),
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : "Unbenannt",
    imageDataUrl,
    config: {
      barrelLength: sanitizeNumber(configSource.barrelLength),
      barrelWidth: sanitizeNumber(configSource.barrelWidth),
      footWidth: sanitizeNumber(configSource.footWidth),
      footThickness: sanitizeNumber(configSource.footThickness),
      foundationWidth: sanitizeNumber(configSource.foundationWidth),
      foundationDepth: sanitizeNumber(configSource.foundationDepth),
      footDistances,
    },
  };
}

/**
 * @param {Sauna} sauna
 * @returns {{ warnings: string[] }}
 */
export function validateSauna(sauna) {
  const warnings = [];
  const { config } = sauna;

  if (config.barrelLength <= 0 || config.barrelWidth <= 0) {
    warnings.push("Fassmasse sollten groesser als 0 cm sein.");
  }
  if (config.footWidth <= 0 || config.footThickness <= 0) {
    warnings.push("Fussmasse sollten groesser als 0 cm sein.");
  }
  if (config.foundationWidth <= 0 || config.foundationDepth <= 0) {
    warnings.push("Fundamentbreite und Frosttiefe sollten groesser als 0 cm sein.");
  }
  if (config.footDistances.some((distance) => distance <= 0)) {
    warnings.push("Innenabstaende zwischen Fuessen sollten groesser als 0 cm sein.");
  }
  if (sauna.imageDataUrl) {
    const mimeType = extractImageMimeType(sauna.imageDataUrl);
    if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) {
      warnings.push("Bildformat ungueltig. Erlaubt sind PNG, JPEG oder WebP.");
    }
    const estimatedBytes = estimateDataUrlBytes(sauna.imageDataUrl);
    if (estimatedBytes > IMAGE_MAX_BYTES) {
      warnings.push("Bild ist groesser als 5 MB.");
    }
  }

  return { warnings };
}

function sanitizeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  return round(number);
}

function round(number) {
  return Math.round(number * 100) / 100;
}

function sanitizeId(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return createSaunaId();
}

function createSaunaId() {
  return `sauna-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function sanitizeImageDataUrl(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:image/")) {
    return "";
  }
  return trimmed;
}

function extractImageMimeType(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  return match ? match[1].toLowerCase() : "";
}

function estimateDataUrlBytes(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    return 0;
  }
  const base64 = dataUrl.slice(commaIndex + 1);
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}
