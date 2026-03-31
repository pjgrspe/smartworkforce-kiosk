require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express      = require('express');
const cors         = require('cors');
const http         = require('http');
const path         = require('path');
const { WebSocketServer } = require('ws');
const logger       = require('./utils/logger');
const { connectDatabase, getDatabaseProvider } = require('./config/database');
const { getRuntimeMode } = require('./config/runtime');
const offlineBuf   = require('./services/offline-buffer');
const { startSyncWorker } = require('./services/sync-worker');
const { getKioskRepository } = require('./repositories/kiosk');

const app = express();

const configuredOrigins = String(process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowAnyOrigin = configuredOrigins.includes('*');
const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser clients and same-origin requests without Origin header.
    if (!origin) return callback(null, true);
    if (allowAnyOrigin) return callback(null, true);
    if (configuredOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '20mb' }));

app.use('/api/public',      require('./routes/public'));
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/employees',   require('./routes/employees'));
app.use('/api/attendance',  require('./routes/attendance'));
app.use('/api/branches',    require('./routes/branches'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/schedules',   require('./routes/schedules'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/salary',      require('./routes/salary'));
app.use('/api/holidays',    require('./routes/holidays'));
app.use('/api/corrections', require('./routes/corrections'));
app.use('/api/leaves',      require('./routes/leaves'));
app.use('/api/tenants',     require('./routes/tenants'));
app.use('/api/payroll',     require('./routes/payroll'));
app.use('/api/kiosk',       require('./routes/kiosk'));
app.use('/api/sync',        require('./routes/sync'));
app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  ts: new Date(),
  provider: getDatabaseProvider(),
  mode: getRuntimeMode(),
}));

// ── Static web app ─────────────────────────────────────────────────────────────
const webDistPath = path.join(__dirname, '../web/dist');
app.use(express.static(webDistPath));
// SPA fallback — all non-API routes serve index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webDistPath, 'index.html'), err => {
    if (err) res.status(404).json({ error: 'Web app not built yet' });
  });
});

// ── Offline buffer flush ───────────────────────────────────────────────────────
async function flushOfflineBuffer() {
  const pending = offlineBuf.getPendingPunches();
  if (!pending.length) return;

  logger.info(`Flushing ${pending.length} offline punch(es) to active database provider...`);
  const kioskRepo = getKioskRepository();
  let flushed = 0;
  for (const punch of pending) {
    try {
      await kioskRepo.flushQueuedPunch(punch);
      offlineBuf.deletePunch(punch.id);
      flushed++;
    } catch (err) {
      logger.error(`Failed to flush offline punch id=${punch.id}:`, err.message);
      break; // stop if DB is unreachable again
    }
  }
  if (flushed) logger.info(`Flushed ${flushed}/${pending.length} offline punch(es)`);
}

const PORT = parseInt(process.env.HTTP_PORT || '3000');

const httpServer = http.createServer(app);

// ── WebSocket server (same port as HTTP via upgrade) ───────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const wsClients = new Set();

wss.on('connection', (ws, req) => {
  wsClients.add(ws);
  logger.info(`WebSocket client connected from ${req.socket.remoteAddress}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
      }
    } catch (_) {}
  });

  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

// Expose broadcast helper for future use by routes/services
app.locals.wsBroadcast = (msg) => {
  const payload = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(payload);
  }
};

connectDatabase()
  .then(() => {
    // Flush any punches that were queued while the server was offline
    flushOfflineBuffer();
    startSyncWorker();
    // Re-flush every 30 seconds in case connectivity drops and returns mid-session
    setInterval(flushOfflineBuffer, 30_000);
    httpServer.listen(PORT, () => logger.info(`✅ DE WEBNET Server running on http://localhost:${PORT}`));
  })
  .catch(err => {
    logger.error('Failed to connect to database:', err);
    process.exit(1);
  });

process.on('uncaughtException',  err => { logger.error('Uncaught exception:',  err); process.exit(1); });
process.on('unhandledRejection', err => { logger.error('Unhandled rejection:', err); process.exit(1); });
