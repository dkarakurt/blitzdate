-- Teşhis için uygulama adım kayıtları (3 gün tutulur). Konum ya da mesaj içeriği yazılmaz.
CREATE TABLE traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session TEXT NOT NULL,
  at INTEGER NOT NULL,
  line TEXT NOT NULL,
  app_version TEXT,
  platform TEXT
);
CREATE INDEX traces_at ON traces(at);
