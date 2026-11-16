-- OpenStreetMap kafeleri (Türkiye), ayda bir "Kafe verisini güncelle" iş akışıyla yenilenir.
CREATE TABLE cafes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  tags TEXT
);
CREATE INDEX cafes_lat_lng ON cafes(lat, lng);
