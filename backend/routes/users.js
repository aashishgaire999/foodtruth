// routes/users.js
const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/users/me
router.get('/me', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id,email,name,age,weight_kg,height_cm,goal,diet_type,cal_goal,protein_goal,sugar_limit,session_id,created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const { rows: allergens } = await db.query(
      'SELECT name FROM allergens WHERE user_id=$1', [req.user.id]
    );
    res.json({ ...rows[0], allergens: allergens.map(a => a.name) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/me
router.put('/me', async (req, res) => {
  const { name, age, weight_kg, height_cm, goal, diet_type, cal_goal, protein_goal, sugar_limit } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE users SET name=$1,age=$2,weight_kg=$3,height_cm=$4,goal=$5,diet_type=$6,
       cal_goal=$7,protein_goal=$8,sugar_limit=$9 WHERE id=$10 RETURNING *`,
      [name, age, weight_kg, height_cm, goal, diet_type, cal_goal, protein_goal, sugar_limit, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/allergens
router.put('/allergens', async (req, res) => {
  const { allergens } = req.body; // array of strings
  try {
    await db.query('DELETE FROM allergens WHERE user_id=$1', [req.user.id]);
    if (allergens && allergens.length) {
      const placeholders = allergens.map((_, i) => `($1, $${i + 2})`).join(',');
      await db.query(
        `INSERT INTO allergens (user_id, name) VALUES ${placeholders}`,
        [req.user.id, ...allergens]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// ──────────────────────────────────────────────────────────────────────────────

// routes/products.js — product search
const express2 = require('express');
const axios = require('axios');
const router2 = express2.Router();

// GET /api/products/search?q=oat+milk
router2.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q param required' });
  try {
    const { data } = await axios.get(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=true&page_size=10`,
      { timeout: 8000 }
    );
    const products = (data.products || []).map(p => ({
      barcode: p.code,
      name: p.product_name,
      brand: p.brands,
      image: p.image_thumb_url,
      nutriscore: p.nutriscore_grade,
    }));
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router2;
