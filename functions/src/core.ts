/**
 * Sunucunun saf (Firebase'den bağımsız) kuralları — birim testleri bunları sınar.
 */
import { ADJECTIVES, ANIMALS, type AnimalIdentity } from './shared/names';
import { distanceMeters, type Gender, type GeoPoint, oppositeGender, RADAR_RADIUS_M } from './shared/radar';
import { BLITZ_SECONDS, DECISION_SECONDS, MAX_MESSAGE_LENGTH } from './shared/room';
import { SNAP_MAX_AGE_MS, SNAPS_PER_MATCH } from './shared/snap';
import { CAFE_MAX_WALK_M, nearbyCafes, type CafeSuggestion, type Venue } from './shared/meet';

export { RADAR_RADIUS_M, BLITZ_SECONDS, DECISION_SECONDS, MAX_MESSAGE_LENGTH, SNAPS_PER_MATCH };

export const PRESENCE_FRESH_MS = 3 * 60_000;
export const STRIKE_TTL_MS = 5 * 60_000;
export const STRIKE_COUNTDOWN_MS = 3500;
export const VOTE_GRACE_MS = 3000;
export const MEET_MAX_DISTANCE_M = 2000;
export const MAX_SNAP_BASE64 = 900_000; // Firestore belge sınırı 1 MiB
export const CLOSED_MATCH_RETENTION_MS = 30 * 24 * 3600_000;
export const UNOPENED_SNAP_TTL_MS = 24 * 3600_000;

export type Vote = 'continue' | 'leave';
export type MatchState = 'room' | 'chat' | 'closed';

export interface MatchTimes {
  roomStartsAt: number;
  roomEndsAt: number;
  decisionEndsAt: number;
}

/** Rastgele "Sıfat + Hayvan"; tükenirse sona sayı eklenir (benzersizlik korunur). */
export function candidateName(rng: () => number, attempt: number): AnimalIdentity {
  const a = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(rng() * ANIMALS.length)];
  const base = `${a} ${animal.name}`;
  const name = attempt < 24 ? base : `${base} ${2 + Math.floor(rng() * 98)}`;
  return { name, kind: animal.kind, color: animal.color };
}

export function isGender(x: unknown): x is Gender {
  return x === 'female' || x === 'male';
}

export function isFresh(updatedAtMs: number | null | undefined, now: number): boolean {
  return typeof updatedAtMs === 'number' && now - updatedAtMs <= PRESENCE_FRESH_MS;
}

/** İstemciye kesin mesafe verilmez. */
export function roundDistance(m: number): number {
  return m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
}

export interface Candidate {
  uid: string;
  gender: Gender;
  location: GeoPoint;
  updatedAt: number;
}

/** Radar filtresi: karşı cins, taze konum, 1 km, engel yok, kendisi değil. */
export function filterNearby(
  me: { uid: string; gender: Gender; location: GeoPoint },
  candidates: Candidate[],
  excluded: ReadonlySet<string>,
  now: number,
): (Candidate & { distanceM: number })[] {
  const want = oppositeGender(me.gender);
  return candidates
    .filter((c) => c.uid !== me.uid && c.gender === want && isFresh(c.updatedAt, now) && !excluded.has(c.uid))
    .map((c) => ({ ...c, distanceM: distanceMeters(me.location, c.location) }))
    .filter((c) => c.distanceM <= RADAR_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM);
}

export function matchTimes(now: number): MatchTimes {
  const roomStartsAt = now + STRIKE_COUNTDOWN_MS;
  const roomEndsAt = roomStartsAt + BLITZ_SECONDS * 1000;
  return { roomStartsAt, roomEndsAt, decisionEndsAt: roomEndsAt + DECISION_SECONDS * 1000 };
}

/** Eşleşme hâlâ sürüyor mu (oda, karar penceresi ya da sonsuz sohbet) */
export function isActive(state: MatchState, t: MatchTimes, now: number): boolean {
  if (state === 'chat') return true;
  if (state === 'room') return now <= t.decisionEndsAt + VOTE_GRACE_MS;
  return false;
}

/** Odaya mesaj / snap yazılabilir mi */
export function canWrite(state: MatchState, t: MatchTimes, now: number): boolean {
  if (state === 'chat') return true;
  return state === 'room' && now >= t.roomStartsAt && now < t.roomEndsAt;
}

export type VoteResult =
  | { kind: 'rejected'; reason: string }
  | { kind: 'pending'; votes: Record<string, Vote> }
  | { kind: 'chat'; votes: Record<string, Vote> }
  | { kind: 'closed'; votes: Record<string, Vote> };

export function applyVote(
  state: MatchState,
  t: MatchTimes,
  users: [string, string],
  votes: Record<string, Vote>,
  uid: string,
  vote: Vote,
  now: number,
): VoteResult {
  if (!users.includes(uid)) return { kind: 'rejected', reason: 'not-participant' };
  if (state !== 'room') return { kind: 'rejected', reason: 'not-in-room' };
  if (now < t.roomEndsAt - 1500) return { kind: 'rejected', reason: 'too-early' };
  if (now > t.decisionEndsAt + VOTE_GRACE_MS) return { kind: 'rejected', reason: 'too-late' };
  const next = { ...votes, [uid]: vote };
  if (vote === 'leave' || Object.values(next).includes('leave')) return { kind: 'closed', votes: next };
  if (users.every((u) => next[u] === 'continue')) return { kind: 'chat', votes: next };
  return { kind: 'pending', votes: next };
}

export type SnapCheck = { ok: true } | { ok: false; reason: string };

export function checkSnap(
  sentByUser: number,
  base64: unknown,
  capturedAt: unknown,
  now: number,
): SnapCheck {
  if (sentByUser >= SNAPS_PER_MATCH) return { ok: false, reason: 'no-snaps-left' };
  if (typeof base64 !== 'string' || base64.length < 100) return { ok: false, reason: 'no-image' };
  if (base64.length > MAX_SNAP_BASE64) return { ok: false, reason: 'too-large' };
  if (!/^[A-Za-z0-9+/=]+$/.test(base64.slice(0, 2000))) return { ok: false, reason: 'bad-encoding' };
  // JPEG imzası: /9j/
  if (!base64.startsWith('/9j/')) return { ok: false, reason: 'not-jpeg' };
  // Cihaz saati sapabilir; sunucu da kabul anını esas alır. Çok eski kareyi reddet.
  if (typeof capturedAt !== 'number' || Math.abs(now - capturedAt) > SNAP_MAX_AGE_MS * 2) {
    return { ok: false, reason: 'too-old' };
  }
  return { ok: true };
}

export function cleanText(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.slice(0, MAX_MESSAGE_LENGTH);
}

/** OpenStreetMap (Overpass) sonucundan iki kişiye de yakın kafeler */
export function cafesFromOverpass(
  a: GeoPoint,
  b: GeoPoint,
  elements: { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[],
): CafeSuggestion[] {
  const venues: Venue[] = [];
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const name = e.tags?.name;
    if (lat == null || lng == null || !name) continue;
    const tags: string[] = [];
    if (e.tags?.outdoor_seating === 'yes') tags.push('Açık hava');
    if (e.tags?.internet_access === 'wlan' || e.tags?.internet_access === 'yes') tags.push('Wi-Fi');
    venues.push({ id: `osm-${e.id}`, name, kind: 'cafe', location: { lat, lng }, isPublic: true, tags });
  }
  return nearbyCafes(a, b, venues);
}

export function overpassQuery(mid: GeoPoint): string {
  return `[out:json][timeout:10];(node["amenity"="cafe"](around:${CAFE_MAX_WALK_M},${mid.lat},${mid.lng});way["amenity"="cafe"](around:${CAFE_MAX_WALK_M},${mid.lat},${mid.lng}););out center 40;`;
}

export const REPORT_REASONS = ['harassment', 'sexual', 'minor', 'spam', 'other'] as const;
