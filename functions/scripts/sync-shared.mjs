// İstemcideki saf kuralları (src/logic) sunucuya kopyalar: iki taraf aynı kuralları kullanır.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', '..', 'src', 'logic');
const to = join(here, '..', 'src', 'shared');
mkdirSync(to, { recursive: true });
for (const f of ['names.ts', 'radar.ts', 'room.ts', 'meet.ts', 'snap.ts']) {
  const src = readFileSync(join(from, f), 'utf8');
  writeFileSync(join(to, f), '// OTOMATİK KOPYA — düzenleme: ../../src/logic/' + f + '\n' + src);
}
console.log('shared synced');
