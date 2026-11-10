import type { AnimalIdentity } from './names';

export type Gender = 'female' | 'male';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RadarUser {
  id: string;
  identity: AnimalIdentity;
  gender: Gender;
  location: GeoPoint;
  online: boolean;
  /** Aynı mekanda mı (ör. aynı kafe) — sunucunun mekan eşleştirmesinden gelir */
  sameVenue?: boolean;
  outdoors?: boolean;
}

export const RADAR_RADIUS_M = 1000;

const EARTH_RADIUS_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** İki nokta arasındaki kuş uçuşu mesafe (metre). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function oppositeGender(g: Gender): Gender {
  return g === 'female' ? 'male' : 'female';
}

export interface RadarHit extends RadarUser {
  distanceM: number;
}

/**
 * Radarda görünecek kişiler: yalnızca karşı cins, şu an çevrimiçi,
 * yarıçap içinde ve engellenmemiş olanlar; en yakından uzağa.
 */
export function visibleOnRadar(
  me: { gender: Gender; location: GeoPoint },
  users: RadarUser[],
  hiddenIds: ReadonlySet<string> = new Set(),
  radiusM: number = RADAR_RADIUS_M,
): RadarHit[] {
  const want = oppositeGender(me.gender);
  return users
    .filter((u) => u.online && u.gender === want && !hiddenIds.has(u.id))
    .map((u) => ({ ...u, distanceM: distanceMeters(me.location, u.location) }))
    .filter((u) => u.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * Konum gizliliği: kullanıcıya kesin mesafe değil yuvarlanmış yaklaşık mesafe gösterilir.
 * 100 m altı 10'luk, 1 km altı 50'lik adımlarla yuvarlanır.
 */
export function formatDistance(m: number): string {
  if (m < 100) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  if (m < 1000) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function genderPlural(g: Gender): string {
  return g === 'female' ? 'kadın' : 'erkek';
}
