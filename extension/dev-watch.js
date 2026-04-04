// extension/dev-watch.js
// הפעל עם: node extension/dev-watch.js
// מאזין לשינויים ב-extension/src/ ומחולל reload אוטומטי ב-Chrome

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 9877;
const WATCH_DIR = path.join(__dirname, 'src');

let version = Date.now().toString();

// ── Watch files ──────────────────────────────────────────────────────────
fs.watch(WATCH_DIR, { recursive: true }, (event, filename) => {
  if (!filename) return;
  version = Date.now().toString();
  console.log(`🔄  ${filename} — reload triggered (v${version})`);
});

// ── Serve version endpoint ───────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(version);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('👀  Extension dev-watcher פעיל');
  console.log(`📁  מאזין ל: ${WATCH_DIR}`);
  console.log(`🌐  Endpoint: http://localhost:${PORT}/version`);
  console.log('🔁  שמור קובץ → Extension מתרענן אוטומטית');
  console.log('\n   Ctrl+C לעצירה\n');
});
