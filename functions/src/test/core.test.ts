import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVote,
  cafesFromOverpass,
  candidateName,
  canWrite,
  checkSnap,
  cleanText,
  filterNearby,
  isActive,
  matchTimes,
  roundDistance,
  STRIKE_COUNTDOWN_MS,
  VOTE_GRACE_MS,
} from '../core';

const base = { lat: 40.9903, lng: 29.029 };
const off = (n: number, e: number) => ({ lat: base.lat + n / 111320, lng: base.lng + e / (111320 * Math.cos((base.lat * Math.PI) / 180)) });

test('isim adayı: Sıfat + Hayvan; çok denemeden sonra sayı eklenir', () => {
  let s = 1;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const a = candidateName(rng, 0);
  assert.match(a.name, /^\S.* \S+$/);
  assert.doesNotMatch(a.name, /\d/);
  assert.match(candidateName(rng, 30).name, / \d+$/);
});

test('radar: yalnızca karşı cins, taze, 1 km içi, engelsiz', () => {
  const now = 1_000_000;
  const me = { uid: 'me', gender: 'male' as const, location: base };
  const c = (uid: string, gender: 'female' | 'male', n: number, e: number, age = 0) => ({ uid, gender, location: off(n, e), updatedAt: now - age });
  const hits = filterNearby(
    me,
    [c('a', 'female', 100, 0), c('b', 'male', 50, 0), c('c', 'female', 2000, 0), c('d', 'female', 200, 0, 10 * 60_000), c('e', 'female', 300, 0), c('me', 'female', 0, 0)],
    new Set(['e']),
    now,
  );
  assert.deepEqual(hits.map((h) => h.uid), ['a']);
});

test('mesafe yuvarlanır', () => {
  assert.equal(roundDistance(4), 10);
  assert.equal(roundDistance(78), 80);
  assert.equal(roundDistance(412), 400);
});

test('oda zamanları ve yazma penceresi', () => {
  const t = matchTimes(0);
  assert.equal(t.roomStartsAt, STRIKE_COUNTDOWN_MS);
  assert.equal(t.roomEndsAt - t.roomStartsAt, 90_000);
  assert.equal(t.decisionEndsAt - t.roomEndsAt, 10_000);
  assert.equal(canWrite('room', t, t.roomStartsAt - 1), false);
  assert.equal(canWrite('room', t, t.roomStartsAt + 1), true);
  assert.equal(canWrite('room', t, t.roomEndsAt), false);
  assert.equal(canWrite('chat', t, t.roomEndsAt + 999_999), true);
  assert.equal(isActive('room', t, t.decisionEndsAt + VOTE_GRACE_MS + 1), false);
});

test('oylama: ikisi de devam → sohbet; biri ayrılırsa kapanır; zaman dışı reddedilir', () => {
  const t = matchTimes(0);
  const users: [string, string] = ['a', 'b'];
  const now = t.roomEndsAt + 1000;
  assert.equal(applyVote('room', t, users, {}, 'a', 'continue', t.roomStartsAt).kind, 'rejected');
  const r1 = applyVote('room', t, users, {}, 'a', 'continue', now);
  assert.equal(r1.kind, 'pending');
  const r2 = applyVote('room', t, users, { a: 'continue' }, 'b', 'continue', now);
  assert.equal(r2.kind, 'chat');
  assert.equal(applyVote('room', t, users, { a: 'continue' }, 'b', 'leave', now).kind, 'closed');
  assert.equal(applyVote('room', t, users, {}, 'x', 'continue', now).kind, 'rejected');
  assert.equal(applyVote('room', t, users, {}, 'a', 'continue', t.decisionEndsAt + VOTE_GRACE_MS + 1).kind, 'rejected');
  assert.equal(applyVote('chat', t, users, {}, 'a', 'continue', now).kind, 'rejected');
});

test('snap doğrulama: tek hak, JPEG, boyut, tazelik', () => {
  const jpeg = '/9j/' + 'A'.repeat(500);
  const now = 10_000_000;
  assert.deepEqual(checkSnap(0, jpeg, now - 1000, now), { ok: true });
  assert.equal((checkSnap(1, jpeg, now, now) as { reason: string }).reason, 'no-snaps-left');
  assert.equal((checkSnap(0, 'iVBOR' + 'A'.repeat(500), now, now) as { reason: string }).reason, 'not-jpeg');
  assert.equal((checkSnap(0, '/9j/' + 'A'.repeat(950_000), now, now) as { reason: string }).reason, 'too-large');
  assert.equal((checkSnap(0, jpeg, now - 10 * 60_000, now) as { reason: string }).reason, 'too-old');
});

test('metin temizleme', () => {
  assert.equal(cleanText('  a   b '), 'a b');
  assert.equal(cleanText(''), null);
  assert.equal(cleanText(5), null);
  assert.equal(cleanText('x'.repeat(400))!.length, 280);
});

test('Overpass sonucundan ikisine de yakın kafeler', () => {
  const a = off(-150, -100);
  const b = off(150, 100);
  const cafes = cafesFromOverpass(a, b, [
    { id: 1, lat: base.lat, lon: base.lng, tags: { name: 'Orta', outdoor_seating: 'yes' } },
    { id: 2, center: { lat: off(100, 50).lat, lon: off(100, 50).lng }, tags: { name: 'Yakın' } },
    { id: 3, lat: off(3000, 0).lat, lon: off(3000, 0).lng, tags: { name: 'Uzak' } },
    { id: 4, lat: base.lat, lon: base.lng, tags: {} },
  ]);
  assert.deepEqual(cafes.map((c) => c.venue.name), ['Orta', 'Yakın']);
  assert.deepEqual(cafes[0].venue.tags, ['Açık hava']);
});
