-- D1 schema (multi-user). The Worker also creates these on first request
-- (ensureSchema); run this once to create them up front.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE, pw_hash TEXT, pw_salt TEXT, pw_iter INTEGER, created REAL);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER, expires REAL);

-- Per-user settings (each user's own API keys).
CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER, key TEXT, value TEXT, PRIMARY KEY (user_id, key));

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  hash TEXT, name TEXT, url TEXT, description TEXT, target_customer TEXT, created REAL,
  UNIQUE (user_id, hash));

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, project_id INTEGER,
  name TEXT, angle TEXT, awareness_stage TEXT, headline TEXT, primary_text TEXT,
  description TEXT, score REAL, image TEXT, source TEXT, created REAL);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, project_id INTEGER,
  ad_name TEXT, metric REAL, metric_name TEXT, created REAL);
