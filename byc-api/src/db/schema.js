'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || './byc.db';

let db;

function getDb() {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      email     TEXT NOT NULL UNIQUE,
      password  TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id          TEXT PRIMARY KEY,
      account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      key_hash    TEXT NOT NULL UNIQUE,
      key_prefix  TEXT NOT NULL,
      label       TEXT NOT NULL DEFAULT 'Default',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id          TEXT PRIMARY KEY,
      account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      goal        REAL NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'USD',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pledges (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      amount      REAL NOT NULL,
      pledged_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_updates (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      body        TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stretch_goals (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      label       TEXT NOT NULL,
      value       REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emitted_events (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      type        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS velocity_drop_episodes (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      active      INTEGER NOT NULL DEFAULT 1,
      started_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS comment_spike_episodes (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      active      INTEGER NOT NULL DEFAULT 1,
      started_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS comments (
      id          TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { getDb };
