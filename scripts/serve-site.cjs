// Serves kalderashield-website on localhost so it can be read before deploy.
//
//   npm run site:preview
//
// No dependency. The site is static and has no build step, so a full static
// server is more than it needs, and adding one would put a package in
// devDependencies for a directory that is otherwise dependency-free.
//
// Reads the directory fresh on every request, so an edit plus a reload is the
// whole loop. The {{DOMAIN}} tokens are left in place: they are valid inside
// an href and they are what the deploy check looks for, and the pages render
// and navigate normally with them.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'kalderashield-website');
// 3000 rather than 4321 or 4173: Windows reserves wide blocks of the low
// ports for Hyper-V, WSL and the container stack, and both of those fail with
// EACCES rather than EADDRINUSE, so the error does not look like a port clash.
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.sh': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function resolve(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded.endsWith('/')) decoded += 'index.html';

  const full = path.join(ROOT, decoded);
  // Refuse anything that escapes the site directory, so a crafted path cannot
  // read the rest of the repository.
  if (path.relative(ROOT, full).startsWith('..')) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

const server = http.createServer((req, res) => {
  const full = resolve(req.url || '/');

  if (!full) {
    // The 404 page is the site's own, so a wrong URL shows the brand rather
    // than Node's default error body.
    const notFound = path.join(ROOT, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : '404');
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(full).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`KalderaShield site on http://${HOST}:${PORT}`);
  console.log(`  serving ${path.relative(process.cwd(), ROOT)}`);
  console.log('  Ctrl+C to stop.');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=5000 npm run site:preview`);
    process.exit(1);
  }
  if (error.code === 'EACCES') {
    // Windows hands out EACCES, not EADDRINUSE, for ports inside the
    // Hyper-V/WSL reservation. Check what is taken before retrying.
    console.error(`Port ${PORT} is reserved by Windows and cannot be bound.`);
    console.error('See the reserved ranges: netsh interface ipv4 show excludedportrange protocol=tcp');
    console.error('Then try another, for example: PORT=5000 npm run site:preview');
    process.exit(1);
  }
  throw error;
});
