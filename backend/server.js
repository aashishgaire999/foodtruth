require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scans');
const userRoutes = require('./routes/users');
// ❌ removed products route (it was breaking your app)

const { authenticateToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// ── WebSocket server ─────────────────────────────────────────
const wss = new WebSocket.Server({ server });

// Map: sessionId -> Set of WebSocket clients
const sessions = new Map();

wss.on('connection', (ws) => {
  let sessionId = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'JOIN_SESSION') {
        sessionId = msg.sessionId;
        if (!sessions.has(sessionId)) sessions.set(sessionId, new Set());
        sessions.get(sessionId).add(ws);
        ws.send(JSON.stringify({ type: 'SESSION_JOINED', sessionId }));
        console.log(`Client joined session ${sessionId}`);
      }

      if (msg.type === 'SCAN_RESULT') {
        if (sessionId && sessions.has(sessionId)) {
          sessions.get(sessionId).forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'NEW_SCAN', data: msg.data }));
            }
          });
        }
      }
    } catch (e) {
      console.error('WS error:', e);
    }
  });

  ws.on('close', () => {
    if (sessionId && sessions.has(sessionId)) {
      sessions.get(sessionId).delete(ws);
      if (sessions.get(sessionId).size === 0) {
        sessions.delete(sessionId);
      }
    }
  });
});

// ── Middleware ─────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ─────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/scans', authenticateToken, scanRoutes);
app.use('/api/users', authenticateToken, userRoutes);

// health check (VERY IMPORTANT FOR RENDER)
app.get('/', (req, res) => {
  res.send('FoodTruth API is running 🚀');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Start server ─────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`FoodTruth API running on port ${PORT}`);
}); 