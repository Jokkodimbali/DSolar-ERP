// Serve only the production artifact on loopback during CI; /api is streamed to NestJS.
import { createReadStream, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !statSync(resolve(root, 'index.html')).isFile()) {
  throw new Error('Livrable Angular introuvable.');
}
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);
const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url === '/api' || url.startsWith('/api/')) {
    const upstream = request({
      hostname: '127.0.0.1',
      port: 3100,
      method: req.method,
      path: url,
      headers: req.headers,
    }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
      res.on('close', () => response.destroy());
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
      if (extname(pathname)) {
        res.writeHead(404).end();
        return;
      }
      file = resolve(root, 'index.html');
    }
    res.writeHead(200, {
      'Content-Type': types.get(extname(file)) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else {
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    }
  } catch {
    res.writeHead(400).end();
  }
});
server.listen(4200, 'localhost');
