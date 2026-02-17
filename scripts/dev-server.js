'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  initDb,
  getAllSaunas,
  getSaunaById,
  upsertSauna,
  deleteSauna,
  getImagesForSauna,
  addImageToSauna,
  deleteImage,
} = require('../server/database');

const root = path.resolve(__dirname, '..');
const preferredPort = 8000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(new Error('Ungueltiges JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const method = req.method;

  // GET /api/saunas
  if (segments[0] === 'saunas' && segments.length === 1 && method === 'GET') {
    const saunas = getAllSaunas();
    return sendJson(res, 200, saunas);
  }

  // GET /api/saunas/:id
  if (segments[0] === 'saunas' && segments.length === 2 && method === 'GET') {
    const sauna = getSaunaById(segments[1]);
    if (!sauna) return sendJson(res, 404, { error: 'Nicht gefunden' });
    sauna.images = getImagesForSauna(segments[1]);
    return sendJson(res, 200, sauna);
  }

  // POST /api/saunas  (create)
  if (segments[0] === 'saunas' && segments.length === 1 && method === 'POST') {
    return readBody(req).then((body) => {
      upsertSauna(body);
      const saved = getSaunaById(body.id);
      sendJson(res, 201, saved);
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  // PUT /api/saunas/:id  (update)
  if (segments[0] === 'saunas' && segments.length === 2 && method === 'PUT') {
    return readBody(req).then((body) => {
      body.id = segments[1];
      upsertSauna(body);
      const saved = getSaunaById(segments[1]);
      saved.images = getImagesForSauna(segments[1]);
      sendJson(res, 200, saved);
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  // DELETE /api/saunas/:id
  if (segments[0] === 'saunas' && segments.length === 2 && method === 'DELETE') {
    deleteSauna(segments[1]);
    return sendJson(res, 204, null);
  }

  // GET /api/saunas/:id/images
  if (segments[0] === 'saunas' && segments.length === 3 && segments[2] === 'images' && method === 'GET') {
    const images = getImagesForSauna(segments[1]);
    return sendJson(res, 200, images);
  }

  // POST /api/saunas/:id/images
  if (segments[0] === 'saunas' && segments.length === 3 && segments[2] === 'images' && method === 'POST') {
    return readBody(req).then((body) => {
      body.saunaId = segments[1];
      addImageToSauna(body);
      sendJson(res, 201, body);
    }).catch((err) => sendJson(res, 400, { error: err.message }));
  }

  // DELETE /api/images/:id
  if (segments[0] === 'images' && segments.length === 2 && method === 'DELETE') {
    deleteImage(segments[1]);
    return sendJson(res, 204, null);
  }

  sendJson(res, 404, { error: 'Unbekannter API-Endpunkt' });
}

const server = http.createServer((req, res) => {
  const rawPath = (req.url || '/').split('?')[0];

  // API-Anfragen
  if (rawPath.startsWith('/api/')) {
    return handleApi(req, res);
  }

  // Statische Dateien
  const relPath = rawPath === '/' ? 'index.html' : decodeURIComponent(rawPath.replace(/^\//, ''));
  const safeRelPath = relPath.replace(/^\.+[\\/]/, '');
  const filePath = path.resolve(root, safeRelPath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

let currentPort = preferredPort;

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    const nextPort = currentPort + 1;
    console.log(`Port ${currentPort} ist belegt, versuche ${nextPort}...`);
    currentPort = nextPort;
    server.listen(currentPort);
    return;
  }

  console.error('Serverfehler:', err && err.message ? err.message : err);
  process.exit(1);
});

initDb().then(() => {
  server.listen(currentPort, () => {
    console.log(`Sauna Planer laeuft unter: http://localhost:${currentPort}`);
  });
}).catch((err) => {
  console.error('Datenbank-Initialisierung fehlgeschlagen:', err);
  process.exit(1);
});
