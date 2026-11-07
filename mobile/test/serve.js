'use strict';
// Static server for mobile/dist. Test-only route /__data/<file> serves files from the data folder.
//   node mobile/test/serve.js [port] [dataDir]
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function start(port = 0, dataDir = null, host = '127.0.0.1') {
  const root = path.resolve(__dirname, '..', 'dist');
  const data = dataDir ? path.resolve(dataDir) : null; // normalise slashes, or the prefix check below rejects everything
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file;
    if (url.startsWith('/__data/') && data) file = path.resolve(data, url.slice(8));
    else file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
    if (!file.startsWith(root + path.sep) && !(data && file.startsWith(data + path.sep))) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

module.exports = { start };
if (require.main === module) {
  const lan = process.argv.includes('--lan');
  const args = process.argv.slice(2).filter((a) => a !== '--lan');
  start(Number(args[0]) || 5173, args[1] || null, lan ? '0.0.0.0' : '127.0.0.1').then(({ url, server }) => {
    console.log('serving', url);
    if (lan) {
      const ips = Object.values(require('os').networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
      for (const ip of ips) console.log(`on your phone (same Wi-Fi): http://${ip}:${server.address().port}/`);
      console.log('note: over plain http the app works, but offline mode, installing and the share sheet need HTTPS hosting.');
    }
  });
}
