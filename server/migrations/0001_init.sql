-- Fink: kalıcı kullanıcı kayıtları ve şikayetler (D1 / SQLite)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  color TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('female', 'male')),
  rerolled INTEGER NOT NULL DEFAULT 0,
  adult_confirmed_at INTEGER NOT NULL,
  terms_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  by_user TEXT NOT NULL,
  target TEXT NOT NULL,
  match_id TEXT,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  at INTEGER NOT NULL
);
CREATE INDEX reports_status ON reports (status, at);
CREATE INDEX reports_target ON reports (target);
