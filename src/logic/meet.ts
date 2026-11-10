import { distanceMeters, type GeoPoint } from './radar';

/** BlitzMeet: iki kişi de dışarıda ve yakınsa ortada bir yerde 15 dakika içinde buluşma önerisi. */

export const MEET_WINDOW_MIN = 15;
export const MEET_MAX_DISTANCE_M = 2000;

export interface MeetCandidate {
  location: GeoPoint;
  outdoors: boolean;
}

export function canBlitzMeet(a: MeetCandidate, b: MeetCandidate): boolean {
  return a.outdoors && b.outdoors && distanceMeters(a.location, b.location) <= MEET_MAX_DISTANCE_M;
}

export function midpoint(a: GeoPoint, b: GeoPoint): GeoPoint {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

export interface Venue {
  id: string;
  name: string;
  location: GeoPoint;
  isPublic: boolean;
  tags: string[];
}

/** Ortalama yürüme hızı ~80 m/dk. */
export function walkingMinutes(m: number): number {
  return Math.max(1, Math.round(m / 80));
}

/**
 * Orta noktaya en yakın, halka açık mekanı seçer.
 * İkisine olan yürüme süreleri arasındaki fark büyükse (adil değilse) cezalandırır.
 */
export function pickVenue(a: GeoPoint, b: GeoPoint, venues: Venue[], exclude: ReadonlySet<string> = new Set()): Venue | null {
  const mid = midpoint(a, b);
  let best: Venue | null = null;
  let bestScore = Infinity;
  for (const v of venues) {
    if (!v.isPublic || exclude.has(v.id)) continue;
    const fairness = Math.abs(distanceMeters(a, v.location) - distanceMeters(b, v.location));
    const score = distanceMeters(mid, v.location) + fairness * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // karışan karakterler (0/O, 1/I/L) yok

export function tableCode(rng: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return `BLZ-${s}`;
}

export function formatClock(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
