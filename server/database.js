'use strict';

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '..', 'data', 'sauna-planer.db');

/** @type {import('sql.js').Database | null} */
let db = null;

/**
 * Initialise the database (async, call once at startup).
 * After this resolves every other function works synchronously.
 */
async function initDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS saunas (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL DEFAULT 'Unbenannt',
      revision      INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,

      barrel_length           REAL NOT NULL DEFAULT 220,
      barrel_width            REAL NOT NULL DEFAULT 210,
      barrel_height           REAL NOT NULL DEFAULT 0,
      barrel_length_with_roof REAL NOT NULL DEFAULT 0,
      foot_width              REAL NOT NULL DEFAULT 200,
      foot_thickness          REAL NOT NULL DEFAULT 8,
      foundation_width        REAL NOT NULL DEFAULT 40,
      foundation_depth        REAL NOT NULL DEFAULT 80,
      foot_distances          TEXT NOT NULL DEFAULT '[]',

      export_template_id      TEXT NOT NULL DEFAULT 'A4_PORTRAIT_STANDARD',
      export_format           TEXT NOT NULL DEFAULT 'pdf',
      export_dim_font_size_px INTEGER NOT NULL DEFAULT 12,

      thumbnail_data_url      TEXT DEFAULT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sauna_images (
      id          TEXT PRIMARY KEY,
      sauna_id    TEXT NOT NULL REFERENCES saunas(id) ON DELETE CASCADE,
      data_url    TEXT NOT NULL,
      mime_type   TEXT NOT NULL,
      bytes       INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      label       TEXT DEFAULT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_images_sauna ON sauna_images(sauna_id)');

  seed();
  persist();
  return db;
}

/** Write the in-memory database to disk */
function persist() {
  if (!db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// --- helpers to run queries and get rows as objects ---

function allRows(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function oneRow(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function run(sql, params) {
  if (params) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
}

// --- seed ---

function seed() {
  const row = oneRow('SELECT COUNT(*) as cnt FROM saunas');
  if (row && row.cnt > 0) return;

  const seedPath = path.resolve(__dirname, '..', 'data', 'saunas.json');
  if (!fs.existsSync(seedPath)) return;

  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  if (!Array.isArray(raw)) return;

  const now = new Date().toISOString();

  const sql = `
    INSERT INTO saunas (
      id, name, revision, created_at, updated_at,
      barrel_length, barrel_width, barrel_height, barrel_length_with_roof,
      foot_width, foot_thickness, foundation_width, foundation_depth,
      foot_distances, export_template_id, export_format, export_dim_font_size_px
    ) VALUES (
      $id, $name, $revision, $createdAt, $updatedAt,
      $barrelLength, $barrelWidth, $barrelHeight, $barrelLengthWithRoof,
      $footWidth, $footThickness, $foundationWidth, $foundationDepth,
      $footDistances, $exportTemplateId, $exportFormat, $exportDimFontSizePx
    )
  `;

  for (const item of raw) {
    const cfg = item.config || {};
    const exp = item.exportSettings || {};
    run(sql, {
      $id: item.id || `sauna-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      $name: item.name || 'Unbenannt',
      $revision: item.revision || 1,
      $createdAt: item.createdAt || now,
      $updatedAt: item.updatedAt || now,
      $barrelLength: cfg.barrelLength || 220,
      $barrelWidth: cfg.barrelWidth || 210,
      $barrelHeight: cfg.barrelHeight || 0,
      $barrelLengthWithRoof: cfg.barrelLengthWithRoof || 0,
      $footWidth: cfg.footWidth || 200,
      $footThickness: cfg.footThickness || 8,
      $foundationWidth: cfg.foundationWidth || 40,
      $foundationDepth: cfg.foundationDepth || 80,
      $footDistances: JSON.stringify(cfg.footDistances || []),
      $exportTemplateId: exp.templateId || 'A4_PORTRAIT_STANDARD',
      $exportFormat: exp.format || 'pdf',
      $exportDimFontSizePx: exp.dimTextFontSizePx || 12,
    });
  }
}

/** Map DB row -> API JSON */
function rowToSauna(row) {
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    config: {
      barrelLength: row.barrel_length,
      barrelWidth: row.barrel_width,
      barrelHeight: row.barrel_height,
      barrelLengthWithRoof: row.barrel_length_with_roof,
      footWidth: row.foot_width,
      footThickness: row.foot_thickness,
      foundationWidth: row.foundation_width,
      foundationDepth: row.foundation_depth,
      footDistances: JSON.parse(row.foot_distances || '[]'),
    },
    exportSettings: {
      templateId: row.export_template_id,
      format: row.export_format,
      dimTextFontSizePx: row.export_dim_font_size_px,
    },
    thumbnailDataUrl: row.thumbnail_data_url || null,
  };
}

// --- CRUD ---

function getAllSaunas() {
  const rows = allRows('SELECT * FROM saunas ORDER BY name COLLATE NOCASE');
  return rows.map(rowToSauna);
}

function getSaunaById(id) {
  const row = oneRow('SELECT * FROM saunas WHERE id = $id', { $id: id });
  return row ? rowToSauna(row) : null;
}

function upsertSauna(sauna) {
  const cfg = sauna.config || {};
  const exp = sauna.exportSettings || {};
  const params = {
    $id: sauna.id,
    $name: sauna.name || 'Unbenannt',
    $revision: sauna.revision || 1,
    $createdAt: sauna.createdAt || new Date().toISOString(),
    $updatedAt: sauna.updatedAt || new Date().toISOString(),
    $barrelLength: cfg.barrelLength || 0,
    $barrelWidth: cfg.barrelWidth || 0,
    $barrelHeight: cfg.barrelHeight || 0,
    $barrelLengthWithRoof: cfg.barrelLengthWithRoof || 0,
    $footWidth: cfg.footWidth || 0,
    $footThickness: cfg.footThickness || 0,
    $foundationWidth: cfg.foundationWidth || 0,
    $foundationDepth: cfg.foundationDepth || 0,
    $footDistances: JSON.stringify(cfg.footDistances || []),
    $exportTemplateId: exp.templateId || 'A4_PORTRAIT_STANDARD',
    $exportFormat: exp.format || 'pdf',
    $exportDimFontSizePx: exp.dimTextFontSizePx || 12,
    $thumbnailDataUrl: sauna.thumbnailDataUrl || null,
  };

  run(`
    INSERT INTO saunas (
      id, name, revision, created_at, updated_at,
      barrel_length, barrel_width, barrel_height, barrel_length_with_roof,
      foot_width, foot_thickness, foundation_width, foundation_depth,
      foot_distances, export_template_id, export_format, export_dim_font_size_px,
      thumbnail_data_url
    ) VALUES (
      $id, $name, $revision, $createdAt, $updatedAt,
      $barrelLength, $barrelWidth, $barrelHeight, $barrelLengthWithRoof,
      $footWidth, $footThickness, $foundationWidth, $foundationDepth,
      $footDistances, $exportTemplateId, $exportFormat, $exportDimFontSizePx,
      $thumbnailDataUrl
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      revision = excluded.revision,
      updated_at = excluded.updated_at,
      barrel_length = excluded.barrel_length,
      barrel_width = excluded.barrel_width,
      barrel_height = excluded.barrel_height,
      barrel_length_with_roof = excluded.barrel_length_with_roof,
      foot_width = excluded.foot_width,
      foot_thickness = excluded.foot_thickness,
      foundation_width = excluded.foundation_width,
      foundation_depth = excluded.foundation_depth,
      foot_distances = excluded.foot_distances,
      export_template_id = excluded.export_template_id,
      export_format = excluded.export_format,
      export_dim_font_size_px = excluded.export_dim_font_size_px,
      thumbnail_data_url = excluded.thumbnail_data_url
  `, params);

  persist();
}

function deleteSauna(id) {
  run('DELETE FROM saunas WHERE id = $id', { $id: id });
  persist();
}

// --- Images ---

function getImagesForSauna(saunaId) {
  return allRows(
    'SELECT * FROM sauna_images WHERE sauna_id = $saunaId ORDER BY sort_order, created_at',
    { $saunaId: saunaId }
  ).map((row) => ({
    id: row.id,
    saunaId: row.sauna_id,
    dataUrl: row.data_url,
    mimeType: row.mime_type,
    bytes: row.bytes,
    createdAt: row.created_at,
    label: row.label || undefined,
    sortOrder: row.sort_order,
  }));
}

function addImageToSauna(image) {
  run(`
    INSERT INTO sauna_images (id, sauna_id, data_url, mime_type, bytes, created_at, label, sort_order)
    VALUES ($id, $saunaId, $dataUrl, $mimeType, $bytes, $createdAt, $label, $sortOrder)
  `, {
    $id: image.id,
    $saunaId: image.saunaId,
    $dataUrl: image.dataUrl,
    $mimeType: image.mimeType,
    $bytes: image.bytes || 0,
    $createdAt: image.createdAt || new Date().toISOString(),
    $label: image.label || null,
    $sortOrder: image.sortOrder || 0,
  });
  persist();
}

function deleteImage(imageId) {
  run('DELETE FROM sauna_images WHERE id = $id', { $id: imageId });
  persist();
}

module.exports = {
  initDb,
  getAllSaunas,
  getSaunaById,
  upsertSauna,
  deleteSauna,
  getImagesForSauna,
  addImageToSauna,
  deleteImage,
};
