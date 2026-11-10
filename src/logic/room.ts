/** BlitzRoom: 90 saniyelik yazılı sohbet ve ardından gelen karar anı. */

export const BLITZ_SECONDS = 90;
export const DECISION_SECONDS = 10;
export const URGENT_SECONDS = 15;

/** Bitiş zamanına göre kalan tam saniye (0'ın altına inmez). */
export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function isUrgent(left: number): boolean {
  return left <= URGENT_SECONDS;
}

/** Halka göstergesi için 0..1 arası ilerleme (1 = dolu). */
export function ringProgress(left: number, total: number = BLITZ_SECONDS): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, left / total));
}

export type Vote = 'continue' | 'leave' | null;

export type DecisionOutcome = 'pending' | 'continue' | 'closed';

/**
 * İki taraf da "Devam" derse oda süresiz sohbete dönüşür.
 * Biri bile ayrılırsa ya da süre biter ve oylar tamamlanmamışsa oda sonsuza dek kapanır.
 */
export function decide(a: Vote, b: Vote, timeUp: boolean): DecisionOutcome {
  if (a === 'leave' || b === 'leave') return 'closed';
  if (a === 'continue' && b === 'continue') return 'continue';
  return timeUp ? 'closed' : 'pending';
}

export const ICEBREAKERS: ReadonlyArray<string> = [
  'Pizza kenarı yenir mi, yenmez mi?',
  'Bir günlüğüne başka bir hayvan olsan hangisi olurdun?',
  'Karaoke şarkın hazır mı? Hangisi?',
  'Sabah insanı mı, gece kuşu mu?',
  'Hayatının film müziği hangi tür olurdu?',
  'Simit mi, poğaça mı? Tartışmasız cevap.',
  'Çay mı kahve mi, ve neden yanılıyorsun?',
  'Issız adaya tek bir şarkı götürsen?',
  'En son ne zaman kahkahadan gözün yaşardı?',
  'Hafta sonu planın: koltuk mu, kamp mı?',
];

/**
 * Yapay zekâ buzkıranları için yerel yedek. Gerçek sürümde sorular bir dil modelinden gelir;
 * bağlantı yoksa bu liste kullanılır. Aynı soru arka arkaya gelmez.
 */
export function nextIcebreaker(current: number, rng: () => number = Math.random): number {
  if (ICEBREAKERS.length < 2) return 0;
  let n = Math.floor(rng() * ICEBREAKERS.length);
  if (n === current) n = (n + 1) % ICEBREAKERS.length;
  return n;
}

export const MAX_MESSAGE_LENGTH = 280;

export function sanitizeMessage(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.slice(0, MAX_MESSAGE_LENGTH);
}
