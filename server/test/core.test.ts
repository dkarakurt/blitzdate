import { expect, test } from 'vitest';
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
} from '../src/core';

const base = { lat: 40.9903, lng: 29.029 };
const off = (n: number, e: number) => ({ lat: base.lat + n / 111320, lng: base.lng + e / (111320 * Math.cos((base.lat * Math.PI) / 180)) });

test('isim adayı: Sıfat + Hayvan; çok denemeden sonra sayı eklenir', () => {
  let s = 1;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const a = candidateName(rng, 0);
  expect(a.name).toMatch(/^\S.* \S+$/);
  expect(a.name).not.toMatch(/\d/);
  expect(candidateName(rng, 30).name).toMatch(/ \d+$/);
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
  expect(hits.map((h) => h.uid)).toEqual(['a']);
});

test('mesafe yuvarlanır', () => {
  expect(roundDistance(4)).toBe(10);
  expect(roundDistance(78)).toBe(80);
  expect(roundDistance(412)).toBe(400);
});

test('oda zamanları ve yazma penceresi', () => {
  const t = matchTimes(0);
  expect(t.roomStartsAt).toBe(STRIKE_COUNTDOWN_MS);
  expect(t.roomEndsAt - t.roomStartsAt).toBe(90_000);
  expect(t.decisionEndsAt - t.roomEndsAt).toBe(10_000);
  expect(canWrite('room', t, t.roomStartsAt - 1)).toBe(false);
  expect(canWrite('room', t, t.roomStartsAt + 1)).toBe(true);
  expect(canWrite('room', t, t.roomEndsAt)).toBe(false);
  expect(canWrite('chat', t, t.roomEndsAt + 999_999)).toBe(true);
  expect(isActive('room', t, t.decisionEndsAt + VOTE_GRACE_MS + 1)).toBe(false);
});

test('oylama: ikisi de devam → sohbet; biri ayrılırsa kapanır; zaman dışı reddedilir', () => {
  const t = matchTimes(0);
  const users: [string, string] = ['a', 'b'];
  const now = t.roomEndsAt + 1000;
  expect(applyVote('room', t, users, {}, 'a', 'continue', t.roomStartsAt).kind).toBe('rejected');
  const r1 = applyVote('room', t, users, {}, 'a', 'continue', now);
  expect(r1.kind).toBe('pending');
  const r2 = applyVote('room', t, users, { a: 'continue' }, 'b', 'continue', now);
  expect(r2.kind).toBe('chat');
  expect(applyVote('room', t, users, { a: 'continue' }, 'b', 'leave', now).kind).toBe('closed');
  expect(applyVote('room', t, users, {}, 'x', 'continue', now).kind).toBe('rejected');
  expect(applyVote('room', t, users, {}, 'a', 'continue', t.decisionEndsAt + VOTE_GRACE_MS + 1).kind).toBe('rejected');
  expect(applyVote('chat', t, users, {}, 'a', 'continue', now).kind).toBe('rejected');
});

test('snap doğrulama: tek hak, JPEG, boyut, tazelik', () => {
  const jpeg = '/9j/' + 'A'.repeat(500);
  const now = 10_000_000;
  expect(checkSnap(0, jpeg, now - 1000, now)).toEqual({ ok: true });
  expect((checkSnap(1, jpeg, now, now) as { reason: string }).reason).toBe('no-snaps-left');
  expect((checkSnap(0, 'iVBOR' + 'A'.repeat(500), now, now) as { reason: string }).reason).toBe('not-jpeg');
  expect((checkSnap(0, '/9j/' + 'A'.repeat(950_000), now, now) as { reason: string }).reason).toBe('too-large');
  expect((checkSnap(0, jpeg, now - 10 * 60_000, now) as { reason: string }).reason).toBe('too-old');
});

test('metin temizleme', () => {
  expect(cleanText('  a   b ')).toBe('a b');
  expect(cleanText('')).toBe(null);
  expect(cleanText(5)).toBe(null);
  expect(cleanText('x'.repeat(400))!.length).toBe(280);
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
  expect(cafes.map((c) => c.venue.name)).toEqual(['Orta', 'Yakın']);
  expect(cafes[0].venue.tags).toEqual(['Açık hava']);
});
