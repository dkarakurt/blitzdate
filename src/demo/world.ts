/**
 * DEMO MODU
 * Sunucu henüz yok; radar, karşı taraf ve mekanlar cihaz içinde simüle edilir.
 * Gerçek sürümde bu dosyanın yerini konum + gerçek zamanlı sohbet servisi alır.
 */
import { ANIMALS, ADJECTIVES, identityFor, NameRegistry } from '../logic/names';
import type { Gender, GeoPoint, RadarUser } from '../logic/radar';
import type { Venue } from '../logic/meet';

/** Kadıköy civarı örnek bir başlangıç noktası */
export const DEMO_ORIGIN: GeoPoint = { lat: 40.9903, lng: 29.029 };

const M_PER_DEG_LAT = 111_320;

export function offset(p: GeoPoint, northM: number, eastM: number): GeoPoint {
  return {
    lat: p.lat + northM / M_PER_DEG_LAT,
    lng: p.lng + eastM / (M_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180)),
  };
}

interface Seed {
  adj: string;
  animal: string;
  gender: Gender;
  north: number;
  east: number;
  online?: boolean;
  sameVenue?: boolean;
}

const SEEDS: Seed[] = [
  { adj: 'Uykucu', animal: 'Tilki', gender: 'female', north: 60, east: 50, sameVenue: true },
  { adj: 'Gizemli', animal: 'Baykuş', gender: 'female', north: 300, east: -260 },
  { adj: 'Dans Eden', animal: 'Ayı', gender: 'female', north: -380, east: 520 },
  { adj: 'Telaşlı', animal: 'Tavşan', gender: 'female', north: -200, east: -150 },
  { adj: 'Kayıp', animal: 'Penguen', gender: 'female', north: 700, east: 640 },
  { adj: 'Şair', animal: 'Kedi', gender: 'female', north: 1500, east: 900 }, // menzil dışı
  { adj: 'Neşeli', animal: 'Kurbağa', gender: 'female', north: 120, east: 80, online: false }, // çevrimdışı
  { adj: 'Hızlı', animal: 'Kedi', gender: 'male', north: -90, east: 100 },
  { adj: 'Bilge', animal: 'Baykuş', gender: 'male', north: 250, east: 300 },
  { adj: 'Maceracı', animal: 'Ayı', gender: 'male', north: -420, east: -330 },
  { adj: 'Nazik', animal: 'Tavşan', gender: 'male', north: 520, east: -100 },
  { adj: 'Müzisyen', animal: 'Kurbağa', gender: 'male', north: -640, east: 410 },
];

export function demoUsers(origin: GeoPoint = DEMO_ORIGIN): RadarUser[] {
  return SEEDS.map((s, i) => {
    const ai = ANIMALS.findIndex((a) => a.name === s.animal);
    const di = ADJECTIVES.indexOf(s.adj);
    return {
      id: `demo-${i}`,
      identity: identityFor(di, ai),
      gender: s.gender,
      location: offset(origin, s.north, s.east),
      online: s.online ?? true,
      sameVenue: s.sameVenue ?? false,
      outdoors: true,
    };
  });
}

/** Demo kullanıcılarının isimleri dolu sayılır; kullanıcıya bunlardan farklı bir isim düşer. */
export function demoRegistry(rng?: () => number): NameRegistry {
  const reg = new NameRegistry(rng);
  for (const u of demoUsers()) reg.reserve(u.identity.name);
  return reg;
}

export function demoVenues(a: GeoPoint, b: GeoPoint): Venue[] {
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  return [
    { id: 'v1', name: 'Ortadaki Kahveci (demo)', kind: 'cafe', location: offset(mid, 10, -5), isPublic: true, tags: ['Sakin', 'Kahve'] },
    { id: 'v2', name: 'Köşe Kafe (demo)', kind: 'cafe', location: offset(mid, -120, 90), isPublic: true, tags: ['Bahçe', 'Tatlı'] },
    { id: 'v3', name: 'Kitap Kafe (demo)', kind: 'cafe', location: offset(mid, 180, 140), isPublic: true, tags: ['Sessiz', 'Çay'] },
    { id: 'v4', name: 'Uzak Kahveci (demo)', kind: 'cafe', location: offset(mid, 1400, 0), isPublic: true, tags: ['Kahve'] }, // uzak: önerilmez
    { id: 'v5', name: 'Restoran (demo)', kind: 'other', location: offset(mid, 20, 20), isPublic: true, tags: [] }, // kafe değil
    { id: 'v6', name: 'Özel Kulüp (demo)', kind: 'cafe', location: offset(mid, 0, 0), isPublic: false, tags: [] }, // halka açık değil
  ];
}

export const DEMO_REPLIES: readonly string[] = [
  'Haha, kabul.',
  'Bunu tartışmamız lazım ama süre yetmez.',
  'Tamam, bu bir puan sana.',
  'Sen de komiksin bu arada.',
  'Ben de tam aynı şeyi düşünüyordum!',
  'Köşedeki kahvecideyim, sen?',
  'Buluşmak ister misin? Uygulama bir yer öneriyor.',
];

export function demoReply(n: number): string {
  return DEMO_REPLIES[n % DEMO_REPLIES.length];
}
