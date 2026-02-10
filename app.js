import { IMAGE_MAX_BYTES, createEmptySauna, sanitizeSauna, validateSauna } from "./domain/sauna.js";
import {
  loadInitialData,
  getAll,
  getById,
  upsert,
  remove,
  importFromJsonFile,
  exportToJsonBlob,
} from "./services/saunaStore.js";
import { generatePlanSvg } from "./services/planGenerator.js";
import { exportSvgToPdf } from "./services/pdfExporter.js";

const state = {
  selectedId: "",
  dirty: false,
  previewSvg: null,
  runtimeWarnings: [],
};

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const elements = {
  saunaList: document.getElementById("sauna-list"),
  form: document.getElementById("sauna-form"),
  name: document.getElementById("field-name"),
  barrelLength: document.getElementById("field-barrel-length"),
  barrelWidth: document.getElementById("field-barrel-width"),
  footWidth: document.getElementById("field-foot-width"),
  footThickness: document.getElementById("field-foot-thickness"),
  foundationWidth: document.getElementById("field-foundation-width"),
  foundationDepth: document.getElementById("field-foundation-depth"),
  distanceList: document.getElementById("distance-list"),
  warningList: document.getElementById("warning-list"),
  preview: document.getElementById("svg-preview"),
  btnNew: document.getElementById("btn-new"),
  btnDelete: document.getElementById("btn-delete"),
  btnSave: document.getElementById("btn-save"),
  btnPdf: document.getElementById("btn-pdf"),
  btnAddDistance: document.getElementById("btn-add-distance"),
  jsonImport: document.getElementById("input-json-import"),
  btnJsonExport: document.getElementById("btn-json-export"),
  imageUpload: document.getElementById("input-image-upload"),
  btnImageRemove: document.getElementById("btn-image-remove"),
  imagePreview: document.getElementById("image-preview"),
};

init().catch((error) => {
  renderWarnings([`Initialisierung fehlgeschlagen: ${error.message}`]);
});

async function init() {
  await loadInitialData();
  let saunas = getAll();
  if (saunas.length === 0) {
    const created = createEmptySauna();
    upsert(created);
    saunas = getAll();
  }

  state.selectedId = saunas[0].id;
  bindEvents();
  renderSaunaList();
  loadSelectedIntoForm();
  renderPreview();
}

function bindEvents() {
  elements.btnNew.addEventListener("click", () => {
    const created = createEmptySauna();
    upsert(created);
    state.selectedId = created.id;
    state.dirty = false;
    renderSaunaList();
    loadSelectedIntoForm();
    renderPreview();
  });

  elements.btnDelete.addEventListener("click", () => {
    if (!state.selectedId) return;
    remove(state.selectedId);
    const all = getAll();
    if (all.length === 0) {
      const fallback = createEmptySauna();
      upsert(fallback);
      state.selectedId = fallback.id;
    } else {
      state.selectedId = all[0].id;
    }
    state.dirty = false;
    renderSaunaList();
    loadSelectedIntoForm();
    renderPreview();
  });

  elements.btnAddDistance.addEventListener("click", () => {
    state.runtimeWarnings = [];
    const data = readFormData();
    data.config.footDistances.push(80);
    writeFormData(data);
    state.dirty = true;
    renderPreviewDebounced();
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.runtimeWarnings = [];
    const sauna = readFormData();
    upsert(sauna);
    state.selectedId = sauna.id;
    state.dirty = false;
    renderSaunaList();
    renderPreview();
  });

  elements.form.addEventListener("input", () => {
    state.dirty = true;
    renderPreviewDebounced();
  });

  elements.form.addEventListener("paste", async (event) => {
    const clipboardItems = event.clipboardData?.items;
    if (!clipboardItems || clipboardItems.length === 0) {
      return;
    }

    const imageItem = Array.from(clipboardItems).find((item) => item.type.startsWith("image/"));
    if (!imageItem) {
      setRuntimeWarnings(["Zwischenablage enthaelt kein Bild."]);
      renderPreview();
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      setRuntimeWarnings(["Bild aus Zwischenablage konnte nicht gelesen werden."]);
      renderPreview();
      return;
    }

    event.preventDefault();
    await handleImageFile(file, "Zwischenablage");
  });

  elements.distanceList.addEventListener("click", (event) => {
    state.runtimeWarnings = [];
    const button = event.target.closest("button[data-action='remove-distance']");
    if (!button) return;
    const index = Number(button.dataset.index);
    const data = readFormData();
    data.config.footDistances.splice(index, 1);
    writeFormData(data);
    state.dirty = true;
    renderPreview();
  });

  elements.saunaList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    state.selectedId = button.dataset.id || "";
    state.dirty = false;
    state.runtimeWarnings = [];
    renderSaunaList();
    loadSelectedIntoForm();
    renderPreview();
  });

  elements.btnPdf.addEventListener("click", async () => {
    try {
      if (!state.previewSvg) {
        renderPreview();
      }
      const currentName = elements.name.value.trim() || "fundamentplan";
      await exportSvgToPdf(state.previewSvg, { fileName: `fundamentplan_${currentName}.pdf` });
    } catch (error) {
      renderWarnings([`PDF-Export fehlgeschlagen: ${error.message}`]);
    }
  });

  elements.jsonImport.addEventListener("change", async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      state.runtimeWarnings = [];
      await importFromJsonFile(file);
      const all = getAll();
      if (all.length === 0) {
        const fallback = createEmptySauna();
        upsert(fallback);
        state.selectedId = fallback.id;
      } else {
        state.selectedId = all[0].id;
      }
      state.dirty = false;
      renderSaunaList();
      loadSelectedIntoForm();
      renderPreview();
    } catch (error) {
      renderWarnings([`JSON-Import fehlgeschlagen: ${error.message}`]);
    } finally {
      input.value = "";
    }
  });

  elements.btnJsonExport.addEventListener("click", () => {
    const blob = exportToJsonBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "saunas.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  elements.imageUpload.addEventListener("change", async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const file = input.files && input.files[0];
    if (!file) return;
    await handleImageFile(file, "Upload");
    input.value = "";
  });

  elements.btnImageRemove.addEventListener("click", () => {
    state.runtimeWarnings = [];
    elements.form.dataset.imageDataUrl = "";
    renderImagePreview("");
    state.dirty = true;
    renderPreview();
  });
}

function renderSaunaList() {
  const all = getAll();
  elements.saunaList.innerHTML = "";

  for (const sauna of all) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = sauna.id;
    const imageMarker = sauna.imageDataUrl ? " [Bild]" : "";
    button.textContent =
      `${sauna.name}${imageMarker} (${format(sauna.config.barrelLength)} x ${format(sauna.config.barrelWidth)} cm)`;
    if (sauna.id === state.selectedId) {
      button.classList.add("active");
    }
    item.appendChild(button);
    elements.saunaList.appendChild(item);
  }
}

function loadSelectedIntoForm() {
  const sauna = getById(state.selectedId);
  if (!sauna) return;
  writeFormData(sauna);
}

function writeFormData(sauna) {
  elements.form.dataset.saunaId = sauna.id;
  elements.name.value = sauna.name;
  elements.barrelLength.value = String(sauna.config.barrelLength);
  elements.barrelWidth.value = String(sauna.config.barrelWidth);
  elements.footWidth.value = String(sauna.config.footWidth);
  elements.footThickness.value = String(sauna.config.footThickness);
  elements.foundationWidth.value = String(sauna.config.foundationWidth);
  elements.foundationDepth.value = String(sauna.config.foundationDepth);
  elements.form.dataset.imageDataUrl = sauna.imageDataUrl || "";
  renderImagePreview(sauna.imageDataUrl || "");

  elements.distanceList.innerHTML = "";
  sauna.config.footDistances.forEach((distance, index) => {
    const row = document.createElement("div");
    row.className = "distance-row";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "0.1";
    input.value = String(distance);
    input.dataset.index = String(index);
    input.addEventListener("input", () => {
      state.dirty = true;
      renderPreviewDebounced();
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Entfernen";
    removeButton.dataset.action = "remove-distance";
    removeButton.dataset.index = String(index);

    row.appendChild(input);
    row.appendChild(removeButton);
    elements.distanceList.appendChild(row);
  });
}

function readFormData() {
  const id = elements.form.dataset.saunaId || createEmptySauna().id;
  const distances = Array.from(elements.distanceList.querySelectorAll("input")).map((input) => parseNumber(input.value));
  return sanitizeSauna({
    id,
    name: elements.name.value,
    imageDataUrl: elements.form.dataset.imageDataUrl || "",
    config: {
      barrelLength: parseNumber(elements.barrelLength.value),
      barrelWidth: parseNumber(elements.barrelWidth.value),
      footWidth: parseNumber(elements.footWidth.value),
      footThickness: parseNumber(elements.footThickness.value),
      foundationWidth: parseNumber(elements.foundationWidth.value),
      foundationDepth: parseNumber(elements.foundationDepth.value),
      footDistances: distances,
    },
  });
}

function renderPreview() {
  const sauna = readFormData();
  const validation = validateSauna(sauna);
  const plan = generatePlanSvg(sauna.config, { title: `Fundamentplan ${sauna.name}` });
  const warnings = [...state.runtimeWarnings, ...validation.warnings, ...plan.warnings];

  elements.preview.innerHTML = "";
  elements.preview.appendChild(plan.svgElement);
  state.previewSvg = plan.svgElement;
  renderWarnings(warnings);
}

const renderPreviewDebounced = debounce(renderPreview, 100);

function renderWarnings(warnings) {
  elements.warningList.innerHTML = "";
  if (!warnings || warnings.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Keine Warnungen.";
    elements.warningList.appendChild(li);
    return;
  }

  for (const warning of warnings) {
    const li = document.createElement("li");
    li.textContent = warning;
    elements.warningList.appendChild(li);
  }
}

function parseNumber(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

function format(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function renderImagePreview(imageDataUrl) {
  elements.imagePreview.innerHTML = "";
  if (!imageDataUrl) {
    const placeholder = document.createElement("span");
    placeholder.className = "image-placeholder";
    placeholder.textContent = "Kein Bild hinterlegt.";
    elements.imagePreview.appendChild(placeholder);
    return;
  }

  const image = document.createElement("img");
  image.src = imageDataUrl;
  image.alt = "Referenzbild der Sauna";
  elements.imagePreview.appendChild(image);
}

async function handleImageFile(file, sourceLabel) {
  const warnings = [];

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    warnings.push(`${sourceLabel}: ungueltiges Bildformat. Erlaubt sind PNG, JPEG oder WebP.`);
    setRuntimeWarnings(warnings);
    renderPreview();
    return;
  }
  if (file.size > IMAGE_MAX_BYTES) {
    warnings.push(`${sourceLabel}: Bild ist groesser als 5 MB.`);
    setRuntimeWarnings(warnings);
    renderPreview();
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl.startsWith("data:image/")) {
      warnings.push(`${sourceLabel}: Datei konnte nicht als Bild gelesen werden.`);
      setRuntimeWarnings(warnings);
      renderPreview();
      return;
    }
    elements.form.dataset.imageDataUrl = dataUrl;
    renderImagePreview(dataUrl);
    state.dirty = true;
    state.runtimeWarnings = [];
    renderPreview();
  } catch (error) {
    setRuntimeWarnings([`${sourceLabel}: Bild konnte nicht gelesen werden (${error.message}).`]);
    renderPreview();
  }
}

function setRuntimeWarnings(warnings) {
  state.runtimeWarnings = Array.isArray(warnings) ? warnings : [];
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("FileReader-Fehler"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}
