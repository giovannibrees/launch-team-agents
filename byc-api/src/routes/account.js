'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { requireApiKey, hashKey } = require('../middleware/auth');

const router = express.Router();

// Auth test endpoint - used by Zapier to verify the API key
router.get('/account', requireApiKey, (req, res) => {
  res.json({
    account: {
      id: req.account.id,
      name: req.account.name,
    },
  });
});

// Self-serve signup
router.post('/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, and password are required.' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ message: 'An account with that email already exists.' });
  }

  const id = 'acct_' + crypto.randomBytes(8).toString('hex');
  const hashed = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO accounts (id, name, email, password) VALUES (?, ?, ?, ?)').run(id, name, email, hashed);

  res.status(201).json({ account: { id, name, email } });
});

// Login - returns a session token (simple: just generate an API key on login for demo purposes)
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required.' });
  }

  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email);
  if (!account) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const valid = await bcrypt.compare(password, account.password);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  res.json({ account: { id: account.id, name: account.name, email: account.email } });
});

// List API keys for an account (requires API key auth - returns metadata only, never the raw key)
router.get('/developer/keys', requireApiKey, (req, res) => {
  const db = getDb();
  const keys = db.prepare(`
    SELECT id, key_prefix, label, created_at, last_used_at
    FROM api_keys WHERE account_id = ? ORDER BY created_at DESC
  `).all(req.account.id);
  res.json({ keys });
});

// Generate a new API key
router.post('/developer/keys', requireApiKey, (req, res) => {
  const { label = 'Default' } = req.body;
  _generateKey(req.account.id, label, res);
});

// Generate first API key during signup (no auth required - uses account id + password confirmation)
router.post('/developer/keys/init', async (req, res) => {
  const { email, password, label = 'Default' } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required.' });
  }
  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email);
  if (!account) return res.status(401).json({ message: 'Invalid credentials.' });
  const valid = await bcrypt.compare(password, account.password);
  if (!valid) return res.status(401).json({ message: 'Invalid credentials.' });
  _generateKey(account.id, label, res);
});

// Revoke an API key
router.delete('/developer/keys/:keyId', requireApiKey, (req, res) => {
  const db = getDb();
  const key = db.prepare('SELECT id FROM api_keys WHERE id = ? AND account_id = ?').get(req.params.keyId, req.account.id);
  if (!key) return res.status(404).json({ message: 'Key not found.' });
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.keyId);
  res.json({ deleted: true });
});

function _generateKey(accountId, label, res) {
  const db = getDb();
  const raw = 'byc_' + crypto.randomBytes(24).toString('hex');
  const prefix = raw.slice(0, 12) + '...';
  const hash = hashKey(raw);
  const id = 'key_' + crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT INTO api_keys (id, account_id, key_hash, key_prefix, label) VALUES (?, ?, ?, ?, ?)').run(id, accountId, hash, prefix, label);
  // Return raw key only once - never stored in plaintext
  res.status(201).json({ key: { id, prefix, label, raw_key: raw } });
}

module.exports = router;
