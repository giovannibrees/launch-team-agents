'use strict';

const crypto = require('crypto');
const { getDb } = require('../db/schema');

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function requireApiKey(req, res, next) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ message: 'Missing or malformed Authorization header. Expected: Bearer <apiKey>' });
  }

  const rawKey = match[1].trim();
  const hash = hashKey(rawKey);
  const db = getDb();

  const row = db.prepare(`
    SELECT k.id AS key_id, k.account_id, a.name AS account_name, a.email
    FROM api_keys k
    JOIN accounts a ON a.id = k.account_id
    WHERE k.key_hash = ?
  `).get(hash);

  if (!row) {
    return res.status(401).json({ message: 'Invalid API key. Please reconnect your BoostYourCampaign account.' });
  }

  db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(row.key_id);

  req.account = { id: row.account_id, name: row.account_name, email: row.email };
  next();
}

module.exports = { requireApiKey, hashKey };
