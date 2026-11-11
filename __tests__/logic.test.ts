import { ADJECTIVES, ANIMALS, NameRegistry, TOTAL_COMBINATIONS } from '../src/logic/names';
import { distanceMeters, formatDistance, visibleOnRadar, type RadarUser } from '../src/logic/radar';
import {
  BLITZ_SECONDS,
  decide,
  ICEBREAKERS,
  isUrgent,
  nextIcebreaker,
  ringProgress,
  sanitizeMessage,
  secondsLeft,
  MAX_MESSAGE_LENGTH,
} from '../src/logic/room';
import {
  createSnap,
  openSnap,
  SNAP_MAX_AGE_MS,
  SNAP_VIEW_MS,
  snapRemainingMs,
  tickSnap,
  validateSnap,
} from '../src/logic/snap';
import { CAFE_MAX_WALK_M, canBlitzMeet, midpoint, nearbyCafes, walkingMinutes } from '../src/logic/meet';
import { farewellMessage, FAREWELL_TEMPLATES } from '../src/logic/farewell';
import { DEMO_ORIGIN, demoRegistry, demoUsers, demoVenues, offset } from '../src/demo/world';

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('Hayvan kimliği (benzersiz isim)', () => {
  test('isimler "Sıfat + Hayvan" biçiminde ve hayvanın ikonu/rengi ile gelir', () => {
    const reg = new NameRegistry(seeded());
    const id = reg.assign();
    const [animal] = ANIMALS.filter((a) => id.name.endsWith(a.name));
    expect(animal).toBeDefined();
    expect(id.kind).toBe(animal.kind);
    expect(ADJECTIVES.some((adj) => id.name.startsWith(adj + ' '))).toBe(true);
  });

  test('tüm kombinasyonlar dağıtılana kadar hiçbir isim tekrar etmez', () => {
    const reg = new NameRegistry(seeded(7));
    const names = new Set<string>();
    for (let i = 0; i < TOTAL_COMBINATIONS; i++) names.add(reg.assign().name);
    expect(names.size).toBe(TOTAL_COMBINATIONS);
    expect(() => reg.assign()).toThrow();
  });

  test('yeniden çekme farklı bir isim verir ve eskisini serbest bırakır', () => {
    const reg = new NameRegistry(seeded(3));
    const first = reg.assign();
    const second = reg.reroll(first);
    expect(second.name).not.toBe(first.name);
    expect(reg.isTaken(first.name)).toBe(false);
    expect(reg.isTaken(second.name)).toBe(true);
  });

  test('demo kullanıcılarının isimleri kullanıcıya verilmez', () => {
    const reg = demoRegistry(seeded(1));
    const taken = new Set(demoUsers().map((u) => u.identity.name));
    for (let i = 0; i < 50; i++) expect(taken.has(reg.assign().name)).toBe(false);
  });
});

describe('Radar', () => {
  const me = { gender: 'male' as const, location: DEMO_ORIGIN };

  test('mesafe hesabı doğru (yaklaşık 500 m)', () => {
    const d = distanceMeters(DEMO_ORIGIN, offset(DEMO_ORIGIN, 300, 400));
    expect(d).toBeGreaterThan(495);
    expect(d).toBeLessThan(505);
  });

  test('yalnızca karşı cins, çevrimiçi ve 1 km içindekiler görünür; en yakın önce', () => {
    const hits = visibleOnRadar(me, demoUsers());
    expect(hits.length).toBe(5);
    expect(hits.every((h) => h.gender === 'female' && h.online && h.distanceM <= 1000)).toBe(true);
    expect(hits[0].identity.name).toBe('Uykucu Tilki');
    for (let i = 1; i < hits.length; i++) expect(hits[i].distanceM).toBeGreaterThanOrEqual(hits[i - 1].distanceM);
  });

  test('kadın kullanıcı yalnızca erkekleri görür', () => {
    const hits = visibleOnRadar({ gender: 'female', location: DEMO_ORIGIN }, demoUsers());
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.gender === 'male')).toBe(true);
  });

  test('vedalaşılan / kapanan kişiler radardan gizlenir', () => {
    const users: RadarUser[] = demoUsers();
    const hidden = new Set(['demo-0']);
    expect(visibleOnRadar(me, users, hidden).some((h) => h.id === 'demo-0')).toBe(false);
  });

  test('mesafe yaklaşık gösterilir (gizlilik)', () => {
    expect(formatDistance(78)).toBe('80 m');
    expect(formatDistance(4)).toBe('10 m');
    expect(formatDistance(412)).toBe('400 m');
    expect(formatDistance(1234)).toBe('1,2 km');
  });
});

describe('BlitzRoom ve karar', () => {
  test('süre 90 saniye ve kalan süre doğru hesaplanır', () => {
    expect(BLITZ_SECONDS).toBe(90);
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 20_000)).toBe(0);
    expect(isUrgent(15)).toBe(true);
    expect(isUrgent(16)).toBe(false);
    expect(ringProgress(45)).toBeCloseTo(0.5);
  });

  test('ikisi de Devam derse sohbet sürer, biri ayrılırsa ya da süre biterse oda kapanır', () => {
    expect(decide('continue', 'continue', false)).toBe('continue');
    expect(decide('continue', null, false)).toBe('pending');
    expect(decide('continue', null, true)).toBe('closed');
    expect(decide('leave', 'continue', false)).toBe('closed');
    expect(decide(null, null, true)).toBe('closed');
  });

  test('buzkıran sorusu arka arkaya aynı gelmez', () => {
    for (let i = 0; i < ICEBREAKERS.length; i++) {
      expect(nextIcebreaker(i, () => i / ICEBREAKERS.length)).not.toBe(i);
    }
  });

  test('mesajlar temizlenir ve sınırlandırılır', () => {
    expect(sanitizeMessage('   ')).toBeNull();
    expect(sanitizeMessage('  merhaba   dünya ')).toBe('merhaba dünya');
    expect(sanitizeMessage('a'.repeat(500))!.length).toBe(MAX_MESSAGE_LENGTH);
  });
});

describe('BlitzSnap', () => {
  const now = 1_000_000;
  const live = { uri: 'file://x.jpg', source: 'camera' as const, capturedAt: now - 2000 };

  test('yalnızca canlı kamera fotoğrafı kabul edilir', () => {
    expect(validateSnap(live, 0, now)).toBeNull();
    expect(validateSnap({ ...live, source: 'gallery' }, 0, now)).toBe('not-live-camera');
  });

  test('eski kare gönderilemez', () => {
    expect(validateSnap({ ...live, capturedAt: now - SNAP_MAX_AGE_MS - 1 }, 0, now)).toBe('too-old');
  });

  test('eşleşme başına tek hak', () => {
    expect(validateSnap(live, 1, now)).toBe('no-snaps-left');
  });

  test('açıldıktan 5 saniye sonra fotoğraf tamamen silinir', () => {
    let snap = createSnap('s1', 'u1', live, now);
    expect(snap.state).toBe('sealed');
    expect(snapRemainingMs(snap, now + 99_999)).toBe(SNAP_VIEW_MS); // açılmadan süre işlemez
    snap = openSnap(snap, now + 10_000);
    expect(snap.state).toBe('viewing');
    expect(snapRemainingMs(snap, now + 12_000)).toBe(3000);
    expect(tickSnap(snap, now + 14_999).state).toBe('viewing');
    const gone = tickSnap(snap, now + 15_000);
    expect(gone.state).toBe('deleted');
    expect(gone.uri).toBeNull();
    expect(openSnap(gone, now + 20_000).state).toBe('deleted'); // tekrar açılamaz
  });
});

describe('BlitzMeet', () => {
  const a = { location: DEMO_ORIGIN, outdoors: true };
  const b = { location: offset(DEMO_ORIGIN, 60, 50), outdoors: true };

  test('ikisi de dışarıda ve yakınsa önerilir', () => {
    expect(canBlitzMeet(a, b)).toBe(true);
    expect(canBlitzMeet(a, { ...b, outdoors: false })).toBe(false);
    expect(canBlitzMeet(a, { location: offset(DEMO_ORIGIN, 3000, 0), outdoors: true })).toBe(false);
  });

  test('yalnızca ikisine de yakın, halka açık kafeler önerilir; en adil olan önce', () => {
    const mid = midpoint(a.location, b.location);
    expect(mid.lat).toBeCloseTo((a.location.lat + b.location.lat) / 2);
    const cafes = nearbyCafes(a.location, b.location, demoVenues(a.location, b.location));
    const ids = cafes.map((c) => c.venue.id);
    expect(ids).toEqual(['v1', 'v2', 'v3']);
    expect(ids).not.toContain('v4'); // uzak
    expect(ids).not.toContain('v5'); // kafe değil
    expect(ids).not.toContain('v6'); // halka açık değil
    for (const c of cafes) {
      expect(c.toA).toBeLessThanOrEqual(CAFE_MAX_WALK_M);
      expect(c.toB).toBeLessThanOrEqual(CAFE_MAX_WALK_M);
    }
    expect(nearbyCafes(a.location, b.location, demoVenues(a.location, b.location), 1)).toHaveLength(1);
  });

  test('yürüme süresi', () => {
    expect(walkingMinutes(320)).toBe(4);
    expect(walkingMinutes(10)).toBe(1);
  });
});

describe('İkinci Şans', () => {
  test('üç kibar veda şablonu döngüsel seçilir', () => {
    expect(FAREWELL_TEMPLATES.length).toBe(3);
    expect(farewellMessage(0)).toContain('bol şans');
    expect(farewellMessage(3)).toBe(farewellMessage(0));
    expect(farewellMessage(-1)).toBe(farewellMessage(2));
  });
});

import { dative, genitive } from '../src/logic/turkish';
describe('Türkçe ekler', () => {
  test('ünlü uyumuna göre yönelme ve ilgi ekleri', () => {
    expect(dative('Uykucu Tilki')).toBe("Uykucu Tilki'ye");
    expect(dative('Gizemli Baykuş')).toBe("Gizemli Baykuş'a");
    expect(dative('Sakin Ayı')).toBe("Sakin Ayı'ya");
    expect(dative('Kayıp Penguen')).toBe("Kayıp Penguen'e");
    expect(genitive('Uykucu Tilki')).toBe("Uykucu Tilki'nin");
    expect(genitive('Gizemli Baykuş')).toBe("Gizemli Baykuş'un");
    expect(genitive('Cesur Vaşak')).toBe("Cesur Vaşak'ın");
    expect(genitive('Neşeli Kurbağa')).toBe("Neşeli Kurbağa'nın");
  });
});
