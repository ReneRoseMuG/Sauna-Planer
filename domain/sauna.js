export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * @typedef {Object} SaunaImage
 * @property {string} id
 * @property {string} dataUrl
 * @property {string} mimeType
 * @property {number} bytes
 * @property {string} createdAt
 * @property {string=} label
 */

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
 * @typedef {Object} ExportSettings
 * @property {string} templateId
 * @property {"pdf"|"svg"} format
 */

/**
 * @typedef {Object} Sauna
 * @property {string} id
 * @property {string} name
 * @property {number} revision
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {SaunaConfig} config
 * @property {SaunaImage[]} images
 * @property {ExportSettings} exportSettings
 */

/**
 * @returns {Sauna}
 */
export function createEmptySauna() {
  const now = new Date().toISOString();
  return {
    id: createSaunaId(),
    name: "Neues Modell",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    images: [],
    exportSettings: {
      templateId: "A4_PORTRAIT_STANDARD",
      format: "pdf",
    },
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
  const now = new Date().toISOString();

  const footDistancesRaw = Array.isArray(configSource.footDistances) ? configSource.footDistances : [];
  const footDistances = footDistancesRaw.map((value) => sanitizeNumber(value));

  const images = sanitizeImages(source);

  return {
    id: sanitizeId(source.id),
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : "Unbenannt",
    revision: sanitizeRevision(source.revision),
    createdAt: sanitizeIsoDate(source.createdAt) || now,
    updatedAt: sanitizeIsoDate(source.updatedAt) || now,
    images,
    exportSettings: sanitizeExportSettings(source.exportSettings),
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
 * @returns {Sauna}
 */
export function nextRevision(sauna) {
  const sanitized = sanitizeSauna(sauna);
  return {
    ...sanitized,
    revision: sanitized.revision + 1,
    updatedAt: new Date().toISOString(),
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
  if (config.footDistances.length === 0) {
    warnings.push("Es ist kein Innenabstand definiert. Damit wird nur ein Fuss angenommen.");
  }
  if (config.footDistances.some((distance) => distance < 0)) {
    warnings.push("Innenabstaende zwischen Fuessen duerfen nicht negativ sein.");
  }

  for (const image of sauna.images) {
    if (!image.dataUrl || !image.dataUrl.startsWith("data:image/")) {
      warnings.push("Ein Bild hat keine gueltige Data-URL.");
      continue;
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(image.mimeType)) {
      warnings.push("Bildformat ungueltig. Erlaubt sind PNG, JPEG oder WebP.");
    }
    if (image.bytes > IMAGE_MAX_BYTES) {
      warnings.push("Ein Bild ist groesser als 5 MB.");
    }
  }

  if (!["pdf", "svg"].includes(sauna.exportSettings.format)) {
    warnings.push("Exportformat ungueltig. Fallback auf PDF wird verwendet.");
  }

  return { warnings };
}

function sanitizeImages(source) {
  const images = [];

  if (Array.isArray(source.images)) {
    for (const image of source.images) {
      const sanitized = sanitizeImage(image);
      if (sanitized) {
        images.push(sanitized);
      }
    }
  }

  // Legacy-Migration: imageDataUrl -> images[0]
  if (images.length === 0 && typeof source.imageDataUrl === "string" && source.imageDataUrl.startsWith("data:image/")) {
    const dataUrl = source.imageDataUrl.trim();
    const mimeType = extractImageMimeType(dataUrl);
    if (mimeType) {
      images.push({
        id: createImageId(),
        dataUrl,
        mimeType,
        bytes: estimateDataUrlBytes(dataUrl),
        createdAt: new Date().toISOString(),
      });
    }
  }

  return images;
}

function sanitizeImage(raw) {
  const source = isObject(raw) ? raw : {};
  const dataUrl = typeof source.dataUrl === "string" ? source.dataUrl.trim() : "";
  if (!dataUrl.startsWith("data:image/")) {
    return null;
  }

  const mimeType = extractImageMimeType(dataUrl);
  if (!mimeType) {
    return null;
  }

  const bytes = Number.isFinite(Number(source.bytes)) ? Math.max(0, Number(source.bytes)) : estimateDataUrlBytes(dataUrl);
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : createImageId(),
    dataUrl,
    mimeType,
    bytes,
    createdAt: sanitizeIsoDate(source.createdAt) || new Date().toISOString(),
    label: typeof source.label === "string" && source.label.trim() ? source.label.trim() : undefined,
  };
}

function sanitizeExportSettings(raw) {
  const source = isObject(raw) ? raw : {};
  const templateId = typeof source.templateId === "string" && source.templateId.trim()
    ? source.templateId.trim()
    : "A4_PORTRAIT_STANDARD";
  const format = source.format === "svg" ? "svg" : "pdf";
  return { templateId, format };
}

function sanitizeRevision(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) {
    return 1;
  }
  return Math.floor(number);
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

function sanitizeIsoDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function createSaunaId() {
  return `sauna-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function createImageId() {
  return `img-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function isObject(value) {
  return typeof value === "object" && value !== null;
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
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}
