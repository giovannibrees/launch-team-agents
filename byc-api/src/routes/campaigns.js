'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router();

router.get('/campaigns', requireApiKey, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 100);
  const db = getDb();
  const campaigns = db.prepare(`
    SELECT id, name, goal, currency, created_at
    FROM campaigns WHERE account_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(req.account.id, limit);
  res.json({ campaigns });
});

router.post('/campaigns', requireApiKey, (req, res) => {
  const { name, goal, currency = 'USD' } = req.body;
  if (!name || !goal) return res.status(400).json({ message: 'name and goal are required.' });
  const db = getDb();
  const id = 'camp_' + crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT INTO campaigns (id, account_id, name, goal, currency) VALUES (?, ?, ?, ?, ?)').run(id, req.account.id, name, goal, currency);
  res.status(201).json({ campaign: { id, name, goal, currency } });
});

module.exports = router;
