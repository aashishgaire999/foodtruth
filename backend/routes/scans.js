// routes/scans.js
const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Helpers ──────────────────────────────────────────────────────────────────

function letterScore(num) {
  if (num >= 80) return 'A';
  if (num >= 60) return 'B';
  if (num >= 40) return 'C';
  return 'D';
}

function computeScoreNum(product) {
  let score = 100;
  const bad = ['high fructose corn syrup','hfcs','aspartame','sucralose','saccharin',
    'sodium nitrite','bha','bht','propyl gallate','potassium bromate','brominated vegetable oil',
    'tartrazine','red 40','yellow 5','carrageenan','monosodium glutamate'];

  const ingredients = (product.ingredients_text || '').toLowerCase();
  bad.forEach(b => { if (ingredients.includes(b)) score -= 15; });

  const nutriments = product.nutriments || {};
  const sugar = nutriments['sugars_100g'] || 0;
  const sodium = nutriments['sodium_100g'] || 0;
  const sat_fat = nutriments['saturated-fat_100g'] || 0;

  if (sugar > 20) score -= 20;
  else if (sugar > 10) score -= 10;
  if (sodium > 1) score -= 15;
  else if (sodium > 0.5) score -= 7;
  if (sat_fat > 5) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function extractFlags(product) {
  const flags = [];
  const ingredients = (product.ingredients_text || '').toLowerCase();
  const map = {
    'High fructose corn syrup': ['high fructose corn syrup','hfcs'],
    'Aspartame': ['aspartame'],
    'Artificial colors': ['red 40','yellow 5','yellow 6','blue 1','tartrazine'],
    'Sodium nitrite': ['sodium nitrite'],
    'BHA/BHT': ['bha','bht'],
    'Carrageenan': ['carrageenan'],
    'MSG': ['monosodium glutamate','msg'],
    'Palm oil': ['palm oil'],
  };
  Object.entries(map).forEach(([flag, keywords]) => {
    if (keywords.some(k => ingredients.includes(k))) flags.push(flag);
  });

  const nutriments = product.nutriments || {};
  if ((nutriments['sugars_100g'] || 0) > 20) flags.push('High sugar');
  if ((nutriments['sodium_100g'] || 0) > 1)  flags.push('High sodium');
  return flags;
}

async function getAiVerdict(productName, brand, ingredients, flags, userAllergens = []) {
  const allergenNote = userAllergens.length
    ? `The user is allergic to: ${userAllergens.join(', ')}.`
    : '';

  const prompt = `You are FoodTruth's AI ingredient analyst. Analyze this product and give a concise 2-3 sentence honest verdict.

Product: ${productName} by ${brand}
Ingredients: ${ingredients}
Flags detected: ${flags.join(', ') || 'none'}
${allergenNote}

Be direct and factual. Mention any concerning additives, hidden ingredients, or marketing deceptions. Keep it under 60 words.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });
    return msg.content[0].text;
  } catch {
    return 'AI analysis unavailable. Check ingredient list manually for any flagged additives.';
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/scans — get user's scan history
router.get('/', async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  try {
    const { rows } = await db.query(
      `SELECT * FROM scans WHERE user_id = $1 ORDER BY scanned_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scans/barcode/:barcode — scan by barcode
router.post('/barcode/:barcode', async (req, res) => {
  const { barcode } = req.params;

  try {
    // 1. Fetch from Open Food Facts (free, no key needed)
    const { data } = await axios.get(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { timeout: 6000 }
    );

    if (data.status !== 1) {
      return res.status(404).json({ error: 'Product not found in database' });
    }

    const p = data.product;
    const nutriments = p.nutriments || {};

    // 2. Compute score and flags
    const scoreNum = computeScoreNum(p);
    const score = letterScore(scoreNum);
    const flags = extractFlags(p);

    // 3. Get user allergens
    const { rows: allergenRows } = await db.query(
      'SELECT name FROM allergens WHERE user_id = $1', [req.user.id]
    );
    const userAllergens = allergenRows.map(r => r.name);

    // 4. AI verdict
    const aiVerdict = await getAiVerdict(
      p.product_name || 'Unknown',
      p.brands || 'Unknown',
      p.ingredients_text || '',
      flags,
      userAllergens
    );

    // 5. Save to DB
    const { rows } = await db.query(
      `INSERT INTO scans
        (user_id, barcode, product_name, brand, score, score_num,
         calories, protein_g, fat_g, sugar_g, carbs_g,
         ingredients, flags, ai_verdict, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        req.user.id, barcode,
        p.product_name || 'Unknown',
        p.brands || 'Unknown',
        score, scoreNum,
        Math.round(nutriments['energy-kcal_100g'] || 0),
        nutriments['proteins_100g'] || 0,
        nutriments['fat_100g'] || 0,
        nutriments['sugars_100g'] || 0,
        nutriments['carbohydrates_100g'] || 0,
        p.ingredients_text || '',
        flags,
        aiVerdict,
        p.image_url || null,
      ]
    );

    const scan = rows[0];

    // 6. Broadcast to connected laptops via WebSocket
    const { rows: userRows } = await db.query(
      'SELECT session_id FROM users WHERE id = $1', [req.user.id]
    );
    if (userRows[0]?.session_id) {
      req.app.locals.broadcast(userRows[0].session_id, { type: 'NEW_SCAN', data: scan });
    }

    res.json(scan);
  } catch (err) {
    if (err.response?.status === 404) return res.status(404).json({ error: 'Product not found' });
    console.error(err);
    res.status(500).json({ error: 'Failed to analyze product' });
  }
});

// GET /api/scans/stats — dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE scanned_at::date = CURRENT_DATE) AS scans_today,
        ROUND(AVG(score_num) FILTER (WHERE scanned_at > NOW() - INTERVAL '7 days')) AS avg_score_week,
        SUM(calories) FILTER (WHERE scanned_at::date = CURRENT_DATE) AS calories_today,
        COUNT(*) FILTER (WHERE array_length(flags, 1) > 0 AND scanned_at::date = CURRENT_DATE) AS flags_today
      FROM scans WHERE user_id = $1
    `, [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/scans/trends — weekly trend data
router.get('/trends', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        DATE(scanned_at) AS date,
        ROUND(AVG(score_num)) AS avg_score,
        SUM(calories) AS total_calories,
        COUNT(*) AS scan_count
      FROM scans
      WHERE user_id = $1
        AND scanned_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE(scanned_at)
      ORDER BY date ASC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
