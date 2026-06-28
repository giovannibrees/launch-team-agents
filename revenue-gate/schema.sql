CREATE TABLE IF NOT EXISTS day_meta (
  day       TEXT PRIMARY KEY,  -- "YYYY-MM-DD"
  gate_open INTEGER NOT NULL DEFAULT 0,
  streak    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,  -- nanoid
  day        TEXT NOT NULL,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('money','creative','ops')),
  est_min    INTEGER NOT NULL,
  accum_sec  INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,              -- ISO-8601 or null
  status     TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (day) REFERENCES day_meta(day)
);

CREATE INDEX IF NOT EXISTS idx_tasks_day ON tasks(day);

CREATE TABLE IF NOT EXISTS standing (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('money','creative','ops')),
  est_min  INTEGER NOT NULL,
  active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
