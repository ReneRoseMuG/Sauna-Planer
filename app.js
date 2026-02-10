import { IMAGE_MAX_BYTES, createEmptySauna, nextRevision, sanitizeSauna, validateSauna } from "./domain/sauna.js";
import { loadInitialData, getAll, getById, upsert, remove } from "./services/saunaStore.js";
import { generatePlanSvg } from "./services/planGenerator.js";
import { exportPlan } from "./services/planExporter.js";
import { composePlanDocument } from "./services/planLayoutEngine.js";
import { getDefaultTemplate, getTemplateById, listTemplates } from "./services/templateRegistry.js";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const state = {
  selectedId: "",
  saunas: [],
  dirty: false,
  runtimeWarnings: [],
  currentImages: [],
  previewSvg: null,
  composedDocument: null,
  templates: listTemplates(),
};

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
  imageUpload: document.getElementById("input-image-upload"),
  imageGallery: document.getElementById("image-gallery"),
  exportFormat: document.getElementById("field-export-format"),
  templateId: document.getElementById("field-template-id"),
  btnNew: document.getElementById("btn-new"),
  btnDelete: document.getElementById("btn-delete"),
  btnSave: document.getElementById("btn-save"),
  btnExport: document.getElementById("btn-export"),
  btnAddDistance: document.getElementById("btn-add-distance"),
};

init().catch((error) => {
  renderWarnings([`Initialisierung fehlgeschlagen: ${error.message}`]);
});

async function init() {
  renderTemplateOptions();
  await loadInitialData();
  await refreshSaunas();

  state.selectedId = state.saunas.length > 0 ? state.saunas[0].id : "";
  bindEvents();
  renderSaunaList();

  if (state.selectedId) {
    await loadSelectedIntoForm();
  } else {
    writeFormData(createEmptySauna());
  }

  renderPreview();
}

function bindEvents() {
  elements.btnNew.addEventListener("click", async () => {
    state.runtimeWarnings = [];
    const created = createEmptySauna();
    await upsert(created);
    await refreshSaunas();
    state.selectedId = created.id;
    state.dirty = false;
    renderSaunaList();
    await loadSelectedIntoForm();
    renderPreview();
  });

  elements.btnDelete.addEventListener("click", async () => {
    if (!state.selectedId) return;
    await remove(state.selectedId);
    await refreshSaunas();

    state.selectedId = state.saunas.length > 0 ? state.saunas[0].id : "";
    state.dirty = false;
    state.runtimeWarnings = [];
    renderSaunaList();

    if (state.selectedId) {
      await loadSelectedIntoForm();
    } else {
      writeFormData(createEmptySauna());
    }

    renderPreview();
  });

  elements.btnAddDistance.addEventListener("click", () => {
    const data = readFormData();
    data.config.footDistances.push(80);
    writeFormData(data);
    state.dirty = true;
    renderPreviewDebounced();
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.runtimeWarnings = [];

    const previous = await getById(elements.form.dataset.saunaId || "");
    const raw = readFormData();

    const prepared = sanitizeSauna({
      ...raw,
      createdAt: previous?.createdAt || raw.createdAt,
      revision: previous?.revision || raw.revision,
    });

    const finalSauna = previous ? nextRevision(prepared) : prepared;

    await upsert(finalSauna);
    await refreshSaunas();

    state.selectedId = finalSauna.id;
    state.dirty = false;
    renderSaunaList();
    await loadSelectedIntoForm();
    renderPreview();
  });

  elements.form.addEventListener("input", () => {
    state.dirty = true;
    renderPreviewDebounced();
  });

  elements.form.addEventListener("paste", async (event) => {
    const clipboardItems = event.clipboardData?.items;
    if (!clipboardItems || clipboardItems.length === 0) return;

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
    const button = event.target.closest("button[data-action='remove-distance']");
    if (!button) return;

    const index = Number(button.dataset.index);
    const data = readFormData();
    data.config.footDistances.splice(index, 1);
    writeFormData(data);
    state.dirty = true;
    renderPreview();
  });

  elements.saunaList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;

    state.selectedId = button.dataset.id || "";
    state.dirty = false;
    state.runtimeWarnings = [];
    renderSaunaList();
    await loadSelectedIntoForm();
    renderPreview();
  });

  elements.imageUpload.addEventListener("change", async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const file = input.files && input.files[0];
    if (!file) return;

    await handleImageFile(file, "Upload");
    input.value = "";
  });

  elements.imageGallery.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='remove-image']");
    if (!button) return;

    const imageId = button.dataset.imageId || "";
    state.currentImages = state.currentImages.filter((image) => image.id !== imageId);
    renderImageGallery();
    state.dirty = true;
    renderPreview();
  });

  elements.templateId.addEventListener("change", () => {
    state.dirty = true;
    renderPreview();
  });

  elements.exportFormat.addEventListener("change", () => {
    state.dirty = true;
    renderPreview();
  });

  elements.btnExport.addEventListener("click", async () => {
    try {
      if (!state.composedDocument) {
        renderPreview();
      }
      const current = readFormData();
      await exportPlan({
        format: current.exportSettings.format,
        composedDocument: state.composedDocument,
        fileNameBase: `fundamentplan_${current.name}`,
      });
    } catch (error) {
      renderWarnings([`Export fehlgeschlagen: ${error.message}`]);
    }
  });
}

async function refreshSaunas() {
  state.saunas = await getAll();
}

function renderTemplateOptions() {
  elements.templateId.innerHTML = "";
  const templates = state.templates;
  for (const template of templates) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    elements.templateId.appendChild(option);
  }
}

function renderSaunaList() {
  elements.saunaList.innerHTML = "";

  for (const sauna of state.saunas) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = sauna.id;

    const imageMarker = sauna.images.length > 0 ? " [Bilder]" : "";
    button.textContent = `${sauna.name}${imageMarker} (r${sauna.revision}, ${format(sauna.config.barrelLength)} x ${format(sauna.config.barrelWidth)} cm)`;

    if (sauna.id === state.selectedId) {
      button.classList.add("active");
    }

    item.appendChild(button);
    elements.saunaList.appendChild(item);
  }
}

async function loadSelectedIntoForm() {
  const sauna = await getById(state.selectedId);
  if (!sauna) return;
  writeFormData(sauna);
}

function writeFormData(sauna) {
  elements.form.dataset.saunaId = sauna.id;
  elements.form.dataset.createdAt = sauna.createdAt;
  elements.form.dataset.revision = String(sauna.revision);

  elements.name.value = sauna.name;
  elements.barrelLength.value = String(sauna.config.barrelLength);
  elements.barrelWidth.value = String(sauna.config.barrelWidth);
  elements.footWidth.value = String(sauna.config.footWidth);
  elements.footThickness.value = String(sauna.config.footThickness);
  elements.foundationWidth.value = String(sauna.config.foundationWidth);
  elements.foundationDepth.value = String(sauna.config.foundationDepth);

  elements.exportFormat.value = sauna.exportSettings.format;
  elements.templateId.value = sauna.exportSettings.templateId;

  state.currentImages = Array.isArray(sauna.images) ? [...sauna.images] : [];
  renderImageGallery();

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
    revision: Number(elements.form.dataset.revision) || 1,
    createdAt: elements.form.dataset.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    images: state.currentImages,
    exportSettings: {
      templateId: elements.templateId.value || getDefaultTemplate().id,
      format: elements.exportFormat.value === "svg" ? "svg" : "pdf",
    },
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

  const template = getTemplateById(sauna.exportSettings.templateId);
  const composed = composePlanDocument({
    template,
    planSvg: plan.svgElement,
    planGeometryBounds: plan.geometryBounds,
    planAnnotationBounds: plan.annotationBounds,
    meta: {
      title: "Fundamentplan",
      modelName: sauna.name,
    },
    notes: [
      "Alle Masse in cm (ca.-Angaben).",
      "Fuesse und Fundamentstreifen sind als Draufsicht dargestellt.",
    ],
  });

  const warnings = [...state.runtimeWarnings, ...validation.warnings, ...plan.warnings];
  if (composed.fit.warning) {
    warnings.push(composed.fit.warning);
  }

  elements.preview.innerHTML = "";
  elements.preview.appendChild(composed.svgElement);

  state.previewSvg = plan.svgElement;
  state.composedDocument = composed;

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

function renderImageGallery() {
  elements.imageGallery.innerHTML = "";

  if (state.currentImages.length === 0) {
    const placeholder = document.createElement("span");
    placeholder.className = "image-placeholder";
    placeholder.textContent = "Kein Bild hinterlegt.";
    elements.imageGallery.appendChild(placeholder);
    return;
  }

  for (const image of state.currentImages) {
    const card = document.createElement("div");
    card.className = "image-card";

    const img = document.createElement("img");
    img.src = image.dataUrl;
    img.alt = image.label || "Sauna-Bild";

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.dataset.action = "remove-image";
    removeButton.dataset.imageId = image.id;
    removeButton.textContent = "Bild entfernen";

    toolbar.appendChild(removeButton);
    card.appendChild(img);
    card.appendChild(toolbar);
    elements.imageGallery.appendChild(card);
  }
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

    state.currentImages.push({
      id: `img-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      dataUrl,
      mimeType: file.type,
      bytes: file.size,
      createdAt: new Date().toISOString(),
    });

    state.dirty = true;
    state.runtimeWarnings = [];
    renderImageGallery();
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



