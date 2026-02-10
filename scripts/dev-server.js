const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
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

const server = http.createServer((req, res) => {
  const rawPath = (req.url || '/').split('?')[0];
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

server.listen(currentPort, () => {
  console.log(`Sauna Planer laeuft unter: http://localhost:${currentPort}`);
});
