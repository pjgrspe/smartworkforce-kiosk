require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const http    = require('http');
const path    = require('path');
const { WebSocketServer } = require('ws');
const sync  = require('./sync');

const PORT    = Number(process.env.PORT)    || 4000;
const WS_PORT = Number(process.env.WS_PORT) || 4001;

const app    = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Static — serve built kiosk web app if present ────────────────────────────
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/kiosk', require('./routes/kiosk'));

// Health check
app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  online: sync.isOnline(),
  pending: require('./db').pendingCount(),
  lastSync: require('./db').getMeta('last_employee_sync'),
}));

// SPA fallback — send kiosk index.html for all unmatched routes
app.get('*', (_req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) res.status(404).json({ error: 'Kiosk UI not built. Run: npm run build:kiosk from /web' });
  });
});

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT, host: '127.0.0.1' });

const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);

  // Send current status immediately on connect
  ws.send(JSON.stringify({
    type:    'SYNC_STATUS',
    online:  sync.isOnline(),
    pending: require('./db').pendingCount(),
  }));

  ws.on('message', msg => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === 'PING') ws.send(JSON.stringify({ type: 'PONG' }));
    } catch (_) {}
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// Broadcast sync status changes to all connected kiosk UIs
sync.onStatusChange(msg => {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[kiosk-service] HTTP  → http://localhost:${PORT}`);
  console.log(`[kiosk-service] WS    → ws://localhost:${WS_PORT}`);
});

sync.start();
