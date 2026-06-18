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

// One-click demo seed: creates a campaign with enough pledges, a stretch goal,
// a campaign update, and comments so that every trigger type has data to return.
const seedHandler = (req, res) => {
  const db = getDb();
  const accountId = req.account.id;

  const campId = 'camp_' + crypto.randomBytes(8).toString('hex');
  const goal = 50000;
  db.prepare('INSERT INTO campaigns (id, account_id, name, goal, currency) VALUES (?, ?, ?, ?, ?)')
    .run(campId, accountId, 'My Cool Gadget', goal, 'USD');

  // Pledges in the prior 24h window (high rate) and current window (low rate) to
  // trigger a velocity drop, plus enough total to cross goal + milestones.
  const now = Date.now();
  const insertPledge = db.prepare('INSERT INTO pledges (id, campaign_id, amount, pledged_at) VALUES (?, ?, ?, ?)');
  // Prior window (24-48h ago): lots of pledges = high prior rate
  for (let i = 0; i < 40; i++) {
    const ts = new Date(now - (24 + Math.random() * 24) * 3600 * 1000).toISOString();
    insertPledge.run('pl_' + crypto.randomBytes(8).toString('hex'), campId, 1000, ts);
  }
  // Current window (last 24h): few pledges = low current rate (velocity drop)
  for (let i = 0; i < 12; i++) {
    const ts = new Date(now - Math.random() * 24 * 3600 * 1000).toISOString();
    insertPledge.run('pl_' + crypto.randomBytes(8).toString('hex'), campId, 1000, ts);
  }

  // Stretch goal at 75k (already crossed? total is 52k, so not crossed — add one at 50k that is crossed)
  db.prepare('INSERT INTO stretch_goals (id, campaign_id, label, value) VALUES (?, ?, ?, ?)')
    .run('sg_' + crypto.randomBytes(6).toString('hex'), campId, 'Color Variant Unlocked', 50000);

  // Campaign update
  db.prepare('INSERT INTO campaign_updates (id, campaign_id, title, body) VALUES (?, ?, ?, ?)')
    .run('upd_' + crypto.randomBytes(6).toString('hex'), campId, 'Manufacturing Update', 'We are in production!');

  // Comment spike: many comments in the last 6h vs sparse baseline
  const insertComment = db.prepare('INSERT INTO comments (id, campaign_id, created_at) VALUES (?, ?, ?)');
  for (let i = 0; i < 80; i++) {
    const ts = new Date(now - Math.random() * 6 * 3600 * 1000).toISOString();
    insertComment.run('cm_' + crypto.randomBytes(8).toString('hex'), campId, ts);
  }
  for (let i = 0; i < 10; i++) {
    const ts = new Date(now - (24 + Math.random() * 120) * 3600 * 1000).toISOString();
    insertComment.run('cm_' + crypto.randomBytes(8).toString('hex'), campId, ts);
  }

  res.status(201).json({ seeded: true, campaign_id: campId });
};

// Allow both GET (easy from a browser with ?apiKey=...) and POST.
router.get('/demo/seed', requireApiKey, seedHandler);
router.post('/demo/seed', requireApiKey, seedHandler);

module.exports = router;
