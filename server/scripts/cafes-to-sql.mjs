// OpenStreetMap kafelerini (osmium export → GeoJSON satırları) D1'e yüklenecek SQL'e çevirir.
// Kullanım: node scripts/cafes-to-sql.mjs cafes.geojsonseq cafes.sql
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('kullanım: node scripts/cafes-to-sql.mjs <girdi.geojsonseq> <çıktı.sql>');
  process.exit(2);
}

const KEEP = ['outdoor_seating', 'internet_access', 'opening_hours', 'cuisine'];
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** Nokta ya da alanın (kafe binası) yaklaşık merkezi */
function center(geom) {
  if (!geom) return null;
  if (geom.type === 'Point') return geom.coordinates;
  let ring = null;
  if (geom.type === 'Polygon') ring = geom.coordinates[0];
  else if (geom.type === 'MultiPolygon') ring = geom.coordinates[0]?.[0];
  else if (geom.type === 'LineString') ring = geom.coordinates;
  if (!ring?.length) return null;
  let x = 0;
  let y = 0;
  for (const [lng, lat] of ring) {
    x += lng;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

const rows = [];
const seen = new Set();
const rl = createInterface({ input: createReadStream(input, 'utf8'), crlfDelay: Infinity });
for await (const raw of rl) {
  const line = raw.replace(/^\x1e/, '').trim();
  if (!line) continue;
  let f;
  try {
    f = JSON.parse(line);
  } catch {
    continue;
  }
  const p = f.properties ?? {};
  if (p.amenity !== 'cafe') continue;
  const name = (p.name ?? p['name:tr'] ?? '').trim();
  if (!name) continue;
  const c = center(f.geometry);
  if (!c) continue;
  const [lng, lat] = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  const id = String(f.id ?? `${lat.toFixed(6)},${lng.toFixed(6)}`);
  if (seen.has(id)) continue;
  seen.add(id);
  const tags = {};
  for (const k of KEEP) if (p[k]) tags[k] = String(p[k]).slice(0, 120);
  rows.push(`(${q(id)},${q(name.slice(0, 120))},${lat.toFixed(6)},${lng.toFixed(6)},${Object.keys(tags).length ? q(JSON.stringify(tags)) : 'NULL'})`);
}

if (rows.length < 100) {
  console.error(`Yalnızca ${rows.length} kafe bulundu; veri bozuk olabilir, mevcut tablo korunuyor.`);
  process.exit(1);
}

const out = ['DELETE FROM cafes;'];
for (let i = 0; i < rows.length; i += 200) {
  out.push('INSERT INTO cafes (id, name, lat, lng, tags) VALUES\n' + rows.slice(i, i + 200).join(',\n') + ';');
}
writeFileSync(output, out.join('\n') + '\n');
console.log(`${rows.length} kafe → ${output}`);
