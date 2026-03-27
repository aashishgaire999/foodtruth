# FoodTruth — Full Stack Setup Guide

## Project structure

```
foodtruth/
├── frontend/           ← Web dashboard (open in browser)
│   └── index.html
├── mobile/             ← Mobile app prototype (open in browser)
│   └── foodtruth-mobile.html
└── backend/            ← Node.js API server
    ├── server.js
    ├── package.json
    ├── .env.example
    ├── db/
    │   ├── index.js
    │   └── migrate.js
    ├── middleware/
    │   └── auth.js
    └── routes/
        ├── auth.js
        ├── scans.js
        └── users.js
```

---

## Step 1 — Install prerequisites

- Node.js 18+: https://nodejs.org
- PostgreSQL 15+: https://www.postgresql.org/download
- VS Code: https://code.visualstudio.com

---

## Step 2 — Set up the database

```bash
# Open PostgreSQL and create the database
psql -U postgres
CREATE DATABASE foodtruth;
\q
```

---

## Step 3 — Configure the backend

```bash
cd backend
cp .env.example .env
```

Open `.env` and fill in:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/foodtruth
JWT_SECRET=any_long_random_string_here
ANTHROPIC_API_KEY=sk-ant-...   ← get from console.anthropic.com
```

---

## Step 4 — Install and run the backend

```bash
cd backend
npm install
node db/migrate.js      # creates tables
npm run dev             # starts server on port 4000
```

You should see: `FoodTruth API running on port 4000`

---

## Step 5 — Open the frontend files

### Web dashboard (laptop view)
Open `frontend/index.html` directly in your browser.
Or serve it with VS Code Live Server extension.

### Mobile app
Open `mobile/foodtruth-mobile.html` directly in your browser.
On mobile: host it and open on your phone.

---

## Step 6 — Test everything

1. Open `frontend/index.html` → you should see the dashboard
2. Click **Simulate scan** → new items appear in the feed
3. Open `mobile/foodtruth-mobile.html` → tap **Scan** → tap **Simulate scan**
4. The toast "Synced to laptop" confirms cross-device sync is working

---

## API endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login, get JWT token |

### Scans
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/scans/barcode/:barcode | Scan by barcode number |
| GET  | /api/scans | Get scan history |
| GET  | /api/scans/stats | Dashboard stats |
| GET  | /api/scans/trends | Weekly trend data |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | /api/users/me | Get user profile |
| PUT  | /api/users/me | Update profile |
| PUT  | /api/users/allergens | Update allergens list |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | /api/products/search?q=oat+milk | Search food database |

---

## WebSocket events

Connect to `ws://localhost:4000`

| Event sent | Payload | Description |
|------------|---------|-------------|
| JOIN_SESSION | `{type, sessionId}` | Link phone + laptop |
| SCAN_RESULT | `{type, data}` | Send scan from phone |

| Event received | Description |
|----------------|-------------|
| SESSION_JOINED | Confirmed in session |
| NEW_SCAN | Broadcast from another device |

---

## Making it public (deployment)

### Option A — Railway (easiest, free tier)
1. Push code to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add PostgreSQL plugin
4. Set environment variables in Railway dashboard
5. Deploy — Railway gives you a public URL

### Option B — Render.com (free tier)
1. Push to GitHub
2. render.com → New Web Service → connect repo
3. Build command: `cd backend && npm install`
4. Start command: `cd backend && node server.js`
5. Add PostgreSQL database in Render dashboard

### Option C — VPS (DigitalOcean/Linode)
```bash
# On your server
git clone your-repo
cd foodtruth/backend
npm install
npm install -g pm2
pm2 start server.js --name foodtruth
pm2 save

# Set up Nginx reverse proxy to port 4000
# Get SSL cert with certbot
```

---

## Tech stack summary

| Layer | Technology |
|-------|-----------|
| Mobile UI | HTML/CSS/JS (convert to React Native for app stores) |
| Web dashboard | HTML/CSS/JS (can wrap in React) |
| API server | Node.js + Express |
| Real-time sync | WebSocket (ws library) |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Food data | Open Food Facts API (free, no key) |
| AI analysis | Anthropic Claude API |

---

## Converting mobile to a real app

To publish to iOS/Android app stores, convert `foodtruth-mobile.html` to React Native:

```bash
npx create-expo-app FoodTruth
cd FoodTruth
npm install @react-navigation/native expo-camera
```

The HTML prototype is a 1:1 design reference — every screen, color, and flow is already designed.

---

## Support

Built with FoodTruth architecture. Questions? Open an issue on GitHub.
