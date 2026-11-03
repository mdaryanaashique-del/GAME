import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let target = path.join(ROOT, clean);
  if (!target.startsWith(ROOT)) return null;

  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      target = path.join(target, 'index.html');
      const nested = await stat(target);
      if (!nested.isFile()) return null;
    } else if (!info.isFile()) {
      return null;
    }
    return target;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }

  const urlPath = req.url === '/' ? '/index.html' : req.url;

  if (urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'ok', app: 'neon-surge', uptime: Math.round(process.uptime()) }));
    return;
  }

  let file = await resolveFile(urlPath);
  // Single page app fallback: unknown paths serve the shell.
  if (!file) file = await resolveFile('/index.html');
  if (!file) {
    send(res, 404, 'Not Found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const immutable = ext !== '.html';

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': (await stat(file)).size,
    'Cache-Control': immutable ? 'public, max-age=300' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Neon Surge listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
