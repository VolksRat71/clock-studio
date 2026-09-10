import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { clocStatus, scan } from './scan.mjs';
import { PRESETS, loadReport } from './report.mjs';

const files = new Map([
  ['/', ['../public/index.html', 'text/html; charset=utf-8']],
  ['/app.css', ['../public/app.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['../public/app.mjs', 'text/javascript; charset=utf-8']],
  ['/render.mjs', ['./render.mjs', 'text/javascript; charset=utf-8']]
]);
async function jsonBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) throw new Error('Request exceeds the 16 MB limit.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Invalid JSON request.'); }
}
export async function startServer({ port = 4317, root = '', title = '' } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
  const token = randomBytes(32).toString('hex');
  let busy = false;
  const server = http.createServer(async (req, res) => {
    const actualPort = server.address().port;
    const allowedHosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!allowedHosts.includes(req.headers.host)) return send(403, { error: 'Invalid Host header.' });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: 'Cross-origin requests are not allowed.' });
    try {
      const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
      if (req.method === 'GET' && files.has(pathname)) {
        const [relative, type] = files.get(pathname);
        const content = await readFile(fileURLToPath(new URL(relative, import.meta.url)));
        res.writeHead(200, { 'Content-Type': type }); return res.end(content);
      }
      if (req.method === 'GET' && pathname === '/api/init') {
        return send(200, { token, presets: PRESETS, root, title, cloc: await clocStatus() });
      }
      if (req.method === 'GET' && pathname === '/api/demo') {
        const data = JSON.parse(await readFile(new URL('../examples/kerv-studio.json', import.meta.url), 'utf8'));
        return send(200, loadReport(data));
      }
      if (req.method === 'POST' && ['/api/scan', '/api/import'].includes(pathname)) {
        const supplied = Buffer.from(String(req.headers['x-cloc-token'] || ''));
        if (supplied.length !== token.length || !timingSafeEqual(supplied, Buffer.from(token))) return send(403, { error: 'Invalid session token. Reload the page.' });
        if (!String(req.headers['content-type']).startsWith('application/json')) return send(415, { error: 'JSON requests are required.' });
        const input = await jsonBody(req);
        if (pathname === '/api/import') return send(200, loadReport(input.report));
        if (busy) return send(409, { error: 'A scan is already running. Wait for it to finish.' });
        busy = true;
        try { return send(200, await scan(input)); }
        finally { busy = false; }
      }
      return send(404, { error: 'Not found.' });
    } catch (error) {
      return send(400, { error: error.message });
    }
  });
  server.requestTimeout = 150_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
