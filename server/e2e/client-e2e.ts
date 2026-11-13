/**
 * Uçtan uca: uygulamanın gerçek istemci kodu (LiveBackend) ile yerelde çalışan gerçek sunucu.
 * İki kullanıcı: kayıt → konum → radar → karşılıklı çarpma → 90 sn oda → mesaj → snap → oy → sohbet → veda → hesap silme.
 * Çalıştırma: wrangler dev açıkken  node e2e/out.mjs http://127.0.0.1:8799
 */
import { LiveBackend, type TokenStore } from '../../src/backend/live';
import type { MatchView, ChatMessage, IncomingSnap } from '../../src/backend/types';

const base = process.argv[2] ?? 'http://127.0.0.1:8799';
const mem = (): TokenStore => {
  let t: string | null = null;
  return { get: async () => t, set: async (v) => void (t = v), clear: async () => void (t = null) };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures++;
};
async function until<T>(get: () => T | undefined | null | false, label: string, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = get();
    if (v) return v as T;
    await sleep(100);
  }
  throw new Error('zaman aşımı: ' + label);
}

const origin = { lat: 40.9903, lng: 29.029 };
const storeA = mem();
const A = new LiveBackend(base, storeA);
const B = new LiveBackend(base, mem());

const pa = await A.register({ gender: 'male', adultConfirmed: true, termsVersion: '2026-11-11' });
const pb = await B.register({ gender: 'female', adultConfirmed: true, termsVersion: '2026-11-11' });
check(pa.identity.name !== pb.identity.name, `kayıt: ${pa.identity.name} ve ${pb.identity.name}`);
const restored = await new LiveBackend(base, storeA).restore();
check(restored?.uid === pa.uid, 'oturum güvenli depodan geri yüklenir');

await A.updatePresence(origin);
await B.updatePresence({ lat: origin.lat + 0.0006, lng: origin.lng + 0.0004 });
const radar = await A.nearby();
check(radar.some((e) => e.id === pb.uid), `radar: A, B'yi görüyor (${radar.find((e) => e.id === pb.uid)?.distanceM} m)`);

let vA: MatchView | null = null;
let vB: MatchView | null = null;
const offA = A.onActiveMatch((m) => (vA = m));
const offB = B.onActiveMatch((m) => (vB = m));
await sleep(500);

check((await A.strike(pb.uid)).matched === false, 'A çarptı, B bekleniyor');
check((await B.nearby()).find((e) => e.id === pa.uid)?.struckMe === true, 'B radarda "sana çarptı" görüyor');
check((await B.strike(pa.uid)).matched === true, 'B de çarptı → eşleşme');
const mA = await until(() => vA, 'A odayı görsün');
await until(() => vB, 'B odayı görsün');
check(mA.state === 'room' && mA.roomStartsAt > Date.now(), 'iki taraf da gelen kutusundan anında haberdar, oda 3,5 sn sonra başlıyor');
check(mA.partner.identity.name === pb.identity.name, 'A karşısında B\'nin hayvan ismini görüyor');

let msgsB: ChatMessage[] = [];
let snapA: IncomingSnap | null = null;
const offMB = B.onMessages(mA.id, (m) => (msgsB = m));
const offSA = A.onIncomingSnap(mA.id, (s) => (snapA = s));
await sleep(Math.max(0, mA.roomStartsAt - Date.now()) + 300);

await A.sendMessage(mA.id, 'Pizza kenarı yenir mi, yenmez mi?', 'icebreaker');
const got = await until(() => msgsB.find((m) => m.text.startsWith('Pizza')), 'B mesajı alsın');
check(got.from === 'them' && got.kind === 'icebreaker', 'B, A\'nın buzkıranını canlı aldı');

await B.sendSnap(mA.id, '/9j/' + 'A'.repeat(1000), Date.now());
const s = await until(() => snapA, 'A snap bildirimini alsın');
const opened = await A.openSnap(mA.id, s.id);
check(opened.dataUri?.startsWith('data:image/jpeg;base64,/9j/') === true, 'A snap\'i açtı (veri bir kez geldi)');
await until(() => snapA === null, 'snap kaydı silinsin');
check(await A.openSnap(mA.id, s.id).then(() => false, () => true), 'aynı snap ikinci kez açılamıyor');

console.log('… 90 saniyelik oda süresi bekleniyor');
await sleep(Math.max(0, mA.roomEndsAt - Date.now()) + 500);
await A.sendMessage(mA.id, 'geç kaldım').then(
  () => check(false, 'süre bitince mesaj reddedilmeli'),
  () => check(true, 'süre bitince mesaj reddedildi'),
);
await A.vote(mA.id, 'continue');
await B.vote(mA.id, 'continue');
await until(() => vA?.state === 'chat' && vB?.state === 'chat', 'ikisi de sohbete geçsin');
check(true, 'ikisi de Devam → süre duvarı yıkıldı');
await until(() => msgsB.find((m) => m.from === 'system' && m.text.includes('Devam')), 'sistem mesajı');

await A.farewell(mA.id, 'Harika bir sohbetti, bol şans!');
await until(() => vB?.state === 'closed', 'B kapanışı görsün');
check(vB!.closedReason === 'farewell' && vB!.closedByMe === false, 'B kibar vedayı aldı, oda kapandı');
check(vA!.state === 'closed' && vA!.closedByMe === true, 'A tarafında da oda kapandı');

await A.deleteAccount();
check((await new LiveBackend(base, storeA).restore()) === null, 'hesap silindi, oturum geçersiz');

offA(); offB(); offMB(); offSA();
console.log(failures ? `\n${failures} kontrol başarısız` : '\nTÜM KONTROLLER GEÇTİ');
process.exit(failures ? 1 : 0);
