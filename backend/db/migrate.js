// db/migrate.js  — run with: node db/migrate.js
require('dotenv').config();
const db = require('./index');

async function migrate() {
  console.log('Running migrations...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       VARCHAR(255) UNIQUE NOT NULL,
      password    VARCHAR(255) NOT NULL,
      name        VARCHAR(255),
      age         INTEGER,
      weight_kg   NUMERIC,
      height_cm   NUMERIC,
      goal        VARCHAR(100) DEFAULT 'general',
      diet_type   VARCHAR(100) DEFAULT 'none',
      cal_goal    INTEGER DEFAULT 2000,
      protein_goal INTEGER DEFAULT 80,
      sugar_limit INTEGER DEFAULT 30,
      session_id  VARCHAR(20) UNIQUE,
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS allergens (
      id      SERIAL PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name    VARCHAR(100) NOT NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS scans (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
      barcode      VARCHAR(100),
      product_name VARCHAR(255),
      brand        VARCHAR(255),
      score        VARCHAR(2),
      score_num    INTEGER,
      calories     INTEGER,
      protein_g    NUMERIC,
      fat_g        NUMERIC,
      sugar_g      NUMERIC,
      carbs_g      NUMERIC,
      ingredients  TEXT,
      flags        TEXT[],
      ai_verdict   TEXT,
      image_url    TEXT,
      scanned_at   TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_scans_user_id ON scans(user_id);
    CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON scans(scanned_at DESC);
  `);

  console.log('Migrations complete.');
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
