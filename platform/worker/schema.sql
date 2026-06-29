-- D1 schema. The Worker also creates these on first request (ensureSchema),
-- but running this once makes the tables exist immediately.
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT UNIQUE, name TEXT, url TEXT, description TEXT,
  target_customer TEXT, created REAL);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER, name TEXT, angle TEXT, awareness_stage TEXT,
  headline TEXT, primary_text TEXT, description TEXT,
  score REAL, image TEXT, source TEXT, created REAL);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER, ad_name TEXT, metric REAL, metric_name TEXT, created REAL);
