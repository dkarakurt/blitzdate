/**
 * Anonim kimlik: her kullanıcıya benzersiz bir "Sıfat + Hayvan" ismi atanır.
 * Avatar, hayvanın ikonudur. Kullanıcı ismini yalnızca bir kez yeniden çekebilir.
 */

export type AnimalKind =
  | 'lynx'
  | 'fox'
  | 'owl'
  | 'rabbit'
  | 'bear'
  | 'penguin'
  | 'cat'
  | 'frog';

export const ANIMALS: readonly { name: string; kind: AnimalKind; color: string }[] = [
  { name: 'Vaşak', kind: 'lynx', color: '#FFFF00' },
  { name: 'Tilki', kind: 'fox', color: '#FF5C8A' },
  { name: 'Baykuş', kind: 'owl', color: '#5CE1FF' },
  { name: 'Tavşan', kind: 'rabbit', color: '#FFB23F' },
  { name: 'Ayı', kind: 'bear', color: '#B69CFF' },
  { name: 'Penguen', kind: 'penguin', color: '#7CF2A5' },
  { name: 'Kedi', kind: 'cat', color: '#FF9A6B' },
  { name: 'Kurbağa', kind: 'frog', color: '#9BE564' },
];

export const ADJECTIVES: readonly string[] = [
  'Cesur', 'Uykucu', 'Gizemli', 'Telaşlı', 'Kayıp', 'Meraklı', 'Asi', 'Sakin',
  'Dans Eden', 'Şakacı', 'Utangaç', 'Hırslı', 'Romantik', 'Dalgın', 'Neşeli', 'Filozof',
  'Kahveci', 'Gezgin', 'Şair', 'Hayalperest', 'Sabırsız', 'Nazik', 'Çılgın', 'Yaramaz',
  'Bilge', 'Hızlı', 'Tembel', 'Kibar', 'İnatçı', 'Sevimli', 'Dürüst', 'Esprili',
  'Kararsız', 'Gece Kuşu', 'Erkenci', 'Müzisyen', 'Ressam', 'Maceracı', 'Sessiz', 'Gülen',
  'Afacan', 'Akıllı', 'Atak', 'Çekingen', 'Dakik', 'Deli Dolu', 'Duygusal', 'Enerjik',
  'Geveze', 'Gururlu', 'Heyecanlı', 'Huysuz', 'İyimser', 'Kafa Dengi', 'Kalender', 'Karizmatik',
  'Keyifli', 'Kurnaz', 'Mütevazı', 'Narin', 'Obur', 'Oyuncu', 'Özgür', 'Rahat',
  'Samimi', 'Sakar', 'Serseri', 'Sıcakkanlı', 'Sihirli', 'Sporcu', 'Şanslı', 'Şık',
  'Tatlı', 'Tuhaf', 'Uçarı', 'Umutlu', 'Uslu', 'Vahşi', 'Yaratıcı', 'Zeki',
  'Zarif', 'Gözlüklü', 'Kitapsever', 'Dağcı', 'Denizci', 'Düşünceli', 'Hareketli', 'Kaşif',
  'Mucit', 'Dertsiz', 'Fırlama', 'Uykusuz', 'Pijamalı', 'Bulutlu', 'Fırtınalı', 'Yıldızlı',
  'Cevval', 'Sevecen', 'Hülyalı', 'Masalcı',
];

export interface AnimalIdentity {
  /** Görünen tam isim, ör. "Cesur Vaşak" */
  name: string;
  kind: AnimalKind;
  color: string;
}

export type Rng = () => number;

export function identityFor(adjIndex: number, animalIndex: number): AnimalIdentity {
  const animal = ANIMALS[animalIndex];
  return { name: `${ADJECTIVES[adjIndex]} ${animal.name}`, kind: animal.kind, color: animal.color };
}

export const TOTAL_COMBINATIONS = ADJECTIVES.length * ANIMALS.length;

/**
 * Atanmış isimleri tutar ve her ismin yalnızca bir kullanıcıya ait olmasını garanti eder.
 * Gerçek sistemde bu tablo sunucuda, benzersiz indeksli bir tabloda yaşar.
 */
export class NameRegistry {
  private taken = new Set<string>();

  constructor(private rng: Rng = Math.random) {}

  isTaken(name: string): boolean {
    return this.taken.has(name);
  }

  get size(): number {
    return this.taken.size;
  }

  /** Daha önce başka sistemden alınmış bir ismi rezerve eder. */
  reserve(name: string): void {
    this.taken.add(name);
  }

  release(name: string): void {
    this.taken.delete(name);
  }

  /** Boşta olan rastgele bir kimlik atar; tüm kombinasyonlar doluysa hata fırlatır. */
  assign(): AnimalIdentity {
    if (this.taken.size >= TOTAL_COMBINATIONS) {
      throw new Error('Tüm isim kombinasyonları dolu');
    }
    // Önce rastgele deneme, olmazsa sırayla tarama (deterministik sonlanma).
    for (let attempt = 0; attempt < 32; attempt++) {
      const a = Math.floor(this.rng() * ADJECTIVES.length);
      const b = Math.floor(this.rng() * ANIMALS.length);
      const id = identityFor(a, b);
      if (!this.taken.has(id.name)) {
        this.taken.add(id.name);
        return id;
      }
    }
    const start = Math.floor(this.rng() * TOTAL_COMBINATIONS);
    for (let i = 0; i < TOTAL_COMBINATIONS; i++) {
      const n = (start + i) % TOTAL_COMBINATIONS;
      const id = identityFor(Math.floor(n / ANIMALS.length), n % ANIMALS.length);
      if (!this.taken.has(id.name)) {
        this.taken.add(id.name);
        return id;
      }
    }
    throw new Error('Tüm isim kombinasyonları dolu');
  }

  /** Eski ismi bırakır ve farklı yeni bir isim atar. */
  reroll(current: AnimalIdentity): AnimalIdentity {
    const next = this.assign();
    this.taken.delete(current.name);
    return next;
  }
}
