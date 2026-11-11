import type { AnimalIdentity } from '../logic/names';
import type { Gender, GeoPoint } from '../logic/radar';
import type { CafeSuggestion } from '../logic/meet';

/**
 * Uygulamanın sunucuyla konuştuğu tek arayüz.
 * - LiveBackend: Firebase (canlı)
 * - DemoBackend: cihaz içi sahte sunucu (Firebase ayarları yoksa ve testlerde)
 * Sunucu her zaman otoritedir: eşleşme, süreler, oylar ve snap hakları sunucuda tutulur.
 */

export type Unsubscribe = () => void;

export interface Profile {
  uid: string;
  identity: AnimalIdentity;
  gender: Gender;
  rerolled: boolean;
}

export interface RadarEntry {
  id: string;
  identity: AnimalIdentity;
  /** Sunucunun yuvarladığı yaklaşık mesafe (m) */
  distanceM: number;
  /** Bu kişi bana zaten çarptı mı */
  struckMe: boolean;
}

export type MatchState = 'room' | 'chat' | 'closed';
export type ClosedReason = 'decision' | 'farewell' | 'blocked' | 'reported' | 'expired' | 'left';

export interface MatchView {
  id: string;
  partner: { id: string; identity: AnimalIdentity };
  distanceM: number;
  state: MatchState;
  /** ms epoch */
  roomStartsAt: number;
  roomEndsAt: number;
  decisionEndsAt: number;
  votes: { me: 'continue' | 'leave' | null; them: 'continue' | 'leave' | null };
  snapsSentByMe: number;
  /** İkisi de yakın ve çevrimiçi: BlitzMeet önerilebilir */
  meetEligible: boolean;
  closedReason: ClosedReason | null;
  /** Kapanışı ben mi başlattım (veda / şikayet) */
  closedByMe: boolean;
}

export type MessageKind = 'text' | 'icebreaker' | 'meet' | 'farewell' | 'system';

export interface ChatMessage {
  id: string;
  from: 'me' | 'them' | 'system';
  kind: MessageKind;
  text: string;
  at: number;
}

export interface IncomingSnap {
  id: string;
  capturedAt: number;
}

export interface OpenedSnap {
  /** data:image/jpeg;base64,… ya da demo modunda null */
  dataUri: string | null;
  capturedAt: number;
}

export type ReportReason = 'harassment' | 'sexual' | 'minor' | 'spam' | 'other';

export interface Backend {
  readonly mode: 'demo' | 'live';
  /** Kayıtlı oturum varsa profili döndürür */
  restore(): Promise<Profile | null>;
  register(input: { gender: Gender; adultConfirmed: true; termsVersion: string }): Promise<Profile>;
  reroll(): Promise<Profile>;
  /** Konum yalnızca uygulama açıkken gönderilir; null = çevrimdışı ol */
  updatePresence(location: GeoPoint | null): Promise<void>;
  nearby(): Promise<RadarEntry[]>;
  /** true: karşı taraf da çarpmıştı, eşleşme oluştu */
  strike(targetId: string): Promise<{ matched: boolean }>;
  onActiveMatch(cb: (m: MatchView | null) => void): Unsubscribe;
  onMessages(matchId: string, cb: (msgs: ChatMessage[]) => void): Unsubscribe;
  sendMessage(matchId: string, text: string, kind?: 'text' | 'icebreaker' | 'meet'): Promise<void>;
  vote(matchId: string, vote: 'continue' | 'leave'): Promise<void>;
  sendSnap(matchId: string, jpegBase64: string, capturedAt: number): Promise<void>;
  onIncomingSnap(matchId: string, cb: (s: IncomingSnap | null) => void): Unsubscribe;
  openSnap(matchId: string, snapId: string): Promise<OpenedSnap>;
  meetSuggestions(matchId: string): Promise<CafeSuggestion[]>;
  farewell(matchId: string, text: string): Promise<void>;
  report(input: { userId: string; matchId?: string; reason: ReportReason; note?: string }): Promise<void>;
  block(userId: string): Promise<void>;
  deleteAccount(): Promise<void>;
}

export const TERMS_VERSION = '2026-11-11';
