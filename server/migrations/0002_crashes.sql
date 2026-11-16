-- Uygulamadan gelen hata raporları (teşhis için; 14 gün tutulur)
CREATE TABLE crashes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  fatal INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL,
  stack TEXT,
  context TEXT,
  app_version TEXT,
  platform TEXT
);
CREATE INDEX crashes_at ON crashes(at);
