import { distanceMeters, type GeoPoint } from './radar';

/**
 * BlitzMeet: iki kişi de dışarıda ve birbirine yakınsa, ikisine de yürüme mesafesindeki
 * kafeler önerilir. (İndirim / masa kodu bir sonraki sürümde.)
 */

export const MEET_MAX_DISTANCE_M = 2000;
/** Önerilen kafe, iki kişiye de en fazla bu kadar uzak olabilir. */
export const CAFE_MAX_WALK_M = 700;
export const MAX_SUGGESTIONS = 3;

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
  kind: 'cafe' | 'other';
  location: GeoPoint;
  isPublic: boolean;
  tags: string[];
}

/** Ortalama yürüme hızı ~80 m/dk. */
export function walkingMinutes(m: number): number {
  return Math.max(1, Math.round(m / 80));
}

export interface CafeSuggestion {
  venue: Venue;
  toA: number;
  toB: number;
}

/**
 * İki kişiye de yakın, halka açık kafeler: her birine en fazla CAFE_MAX_WALK_M.
 * Orta noktaya yakın ve iki tarafa da adil (yürüme süreleri benzer) olanlar önce gelir.
 */
export function nearbyCafes(a: GeoPoint, b: GeoPoint, venues: Venue[], limit: number = MAX_SUGGESTIONS): CafeSuggestion[] {
  const mid = midpoint(a, b);
  return venues
    .filter((v) => v.kind === 'cafe' && v.isPublic)
    .map((v) => ({ venue: v, toA: distanceMeters(a, v.location), toB: distanceMeters(b, v.location) }))
    .filter((s) => s.toA <= CAFE_MAX_WALK_M && s.toB <= CAFE_MAX_WALK_M)
    .map((s) => ({ s, score: distanceMeters(mid, s.venue.location) + Math.abs(s.toA - s.toB) * 0.5 }))
    .sort((x, y) => x.score - y.score)
    .slice(0, limit)
    .map((x) => x.s);
}
