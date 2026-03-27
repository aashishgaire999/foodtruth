require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scans');
const productRoutes = require('./routes/products');
const userRoutes = require('./routes/users');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

// Map: sessionId -> Set of WebSocket clients
const sessions = new Map();

wss.on('connection', (ws, req) => {
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
        // Broadcast to all other clients in the same session
        if (sessionId && sessions.has(sessionId)) {
          sessions.get(sessionId).forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'NEW_SCAN', data: msg.data }));
            }
          });
        }
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    if (sessionId && sessions.has(sessionId)) {
      sessions.get(sessionId).delete(ws);
      if (sessions.get(sessionId).size === 0) sessions.delete(sessionId);
    }
  });
});

// Expose broadcast function for routes
app.locals.broadcast = (sessionId, data) => {
  if (sessions.has(sessionId)) {
    sessions.get(sessionId).forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }
};

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [process.env.FRONTEND_URL, process.env.MOBILE_URL, 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/scans', authenticateToken, scanRoutes);
app.use('/api/products', authenticateToken, productRoutes);
app.use('/api/users', authenticateToken, userRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`FoodTruth API running on port ${PORT}`));
