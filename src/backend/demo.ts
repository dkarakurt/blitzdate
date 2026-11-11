/**
 * DEMO SUNUCU — Firebase ayarları yokken ve testlerde kullanılır.
 * Gerçek sunucunun kurallarını cihaz içinde taklit eder; karşı taraf otomatik davranır.
 */
import { NameRegistry } from '../logic/names';
import { visibleOnRadar } from '../logic/radar';
import { nearbyCafes } from '../logic/meet';
import { BLITZ_SECONDS, DECISION_SECONDS, sanitizeMessage } from '../logic/room';
import { SNAPS_PER_MATCH } from '../logic/snap';
import { DEMO_ORIGIN, demoRegistry, demoReply, demoUsers, demoVenues } from '../demo/world';
import type {
  Backend,
  ChatMessage,
  IncomingSnap,
  MatchView,
  Profile,
  RadarEntry,
  Unsubscribe,
} from './types';

export const DEMO_TIMING = {
  strikeAcceptMs: 900,
  strikeCountdownMs: 3000,
  replyMs: 1300,
  voteAfterRoomMs: 2500,
  snapAfterChatMs: 15000,
};

/** Yuvarlanmış mesafeyi sayıya çevirir (sunucu da istemciye yalnızca yaklaşık mesafe verir). */
function roundDistance(m: number): number {
  return m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
}

export class DemoBackend implements Backend {
  readonly mode = 'demo' as const;
  private registry: NameRegistry;
  private profile: Profile | null = null;
  private users = demoUsers();
  private hidden = new Set<string>();
  private match: MatchView | null = null;
  private messages: ChatMessage[] = [];
  private incoming: IncomingSnap | null = null;
  private seq = 0;
  private replies = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private matchListeners = new Set<(m: MatchView | null) => void>();
  private messageListeners = new Set<(m: ChatMessage[]) => void>();
  private snapListeners = new Set<(s: IncomingSnap | null) => void>();

  constructor(rng?: () => number) {
    this.registry = demoRegistry(rng);
  }

  /** Testlerde bekleyen zamanlayıcıları temizlemek için */
  dispose() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  private emitMatch() {
    const m = this.match ? { ...this.match, votes: { ...this.match.votes } } : null;
    this.matchListeners.forEach((cb) => cb(m));
  }
  private emitMessages() {
    const list = [...this.messages];
    this.messageListeners.forEach((cb) => cb(list));
  }
  private emitSnap() {
    this.snapListeners.forEach((cb) => cb(this.incoming));
  }
  private push(from: ChatMessage['from'], kind: ChatMessage['kind'], text: string) {
    this.messages.push({ id: `d${++this.seq}`, from, kind, text, at: Date.now() });
    this.emitMessages();
  }

  private close(reason: MatchView['closedReason'], byMe: boolean) {
    if (!this.match || this.match.state === 'closed') return;
    this.hidden.add(this.match.partner.id);
    this.match = { ...this.match, state: 'closed', closedReason: reason, closedByMe: byMe };
    this.emitMatch();
    this.match = null;
    this.incoming = null;
    this.dispose();
  }

  async restore() {
    return this.profile;
  }

  async register(input: { gender: Profile['gender']; adultConfirmed: true; termsVersion: string }) {
    if (!input.adultConfirmed) throw new Error('18 yaş onayı gerekli');
    const identity = this.registry.assign();
    this.profile = { uid: 'me', identity, gender: input.gender, rerolled: false };
    return this.profile;
  }

  async reroll() {
    if (!this.profile) throw new Error('Kayıt yok');
    if (this.profile.rerolled) return this.profile;
    this.profile = { ...this.profile, identity: this.registry.reroll(this.profile.identity), rerolled: true };
    return this.profile;
  }

  async updatePresence() {
    /* demo: konum sabit (DEMO_ORIGIN) */
  }

  async nearby(): Promise<RadarEntry[]> {
    if (!this.profile) return [];
    return visibleOnRadar({ gender: this.profile.gender, location: DEMO_ORIGIN }, this.users, this.hidden).map((h) => ({
      id: h.id,
      identity: h.identity,
      distanceM: roundDistance(h.distanceM),
      struckMe: h.id === 'demo-0',
    }));
  }

  async strike(targetId: string) {
    const target = (await this.nearby()).find((u) => u.id === targetId);
    if (!target || this.match) throw new Error('Bu kişi artık uygun değil');
    await new Promise<void>((r) => this.later(DEMO_TIMING.strikeAcceptMs, r));
    const now = Date.now();
    const roomStartsAt = now + DEMO_TIMING.strikeCountdownMs;
    const roomEndsAt = roomStartsAt + BLITZ_SECONDS * 1000;
    this.messages = [];
    this.incoming = null;
    this.match = {
      id: `match-${now}`,
      partner: { id: target.id, identity: target.identity },
      distanceM: target.distanceM,
      state: 'room',
      roomStartsAt,
      roomEndsAt,
      decisionEndsAt: roomEndsAt + DECISION_SECONDS * 1000,
      votes: { me: null, them: null },
      snapsSentByMe: 0,
      meetEligible: true,
      closedReason: null,
      closedByMe: false,
    };
    this.later(roomEndsAt - now + DEMO_TIMING.voteAfterRoomMs, () => this.partnerVote());
    this.later(roomEndsAt - now + DECISION_SECONDS * 1000 + 500, () => {
      if (this.match && this.match.state === 'room') this.close('expired', false);
    });
    this.emitMatch();
    this.emitMessages();
    return { matched: true };
  }

  private partnerVote() {
    if (!this.match || this.match.state !== 'room') return;
    this.match = { ...this.match, votes: { ...this.match.votes, them: 'continue' } };
    this.evaluate();
  }

  private evaluate() {
    const m = this.match;
    if (!m) return;
    if (m.votes.me === 'leave' || m.votes.them === 'leave') return this.close('decision', m.votes.me === 'leave');
    if (m.votes.me === 'continue' && m.votes.them === 'continue') {
      this.match = { ...m, state: 'chat' };
      this.emitMatch();
      this.push('system', 'system', 'İkiniz de Devam dediniz. Artık süre yok.');
      this.later(DEMO_TIMING.snapAfterChatMs, () => {
        if (this.match?.state === 'chat' && !this.incoming) {
          this.incoming = { id: `snap-${Date.now()}`, capturedAt: Date.now() - 3000 };
          this.push('system', 'system', `${this.match.partner.identity.name} sana bir BlitzSnap gönderdi.`);
          this.emitSnap();
        }
      });
      return;
    }
    this.emitMatch();
  }

  onActiveMatch(cb: (m: MatchView | null) => void): Unsubscribe {
    this.matchListeners.add(cb);
    cb(this.match);
    return () => this.matchListeners.delete(cb);
  }

  onMessages(_matchId: string, cb: (m: ChatMessage[]) => void): Unsubscribe {
    this.messageListeners.add(cb);
    cb([...this.messages]);
    return () => this.messageListeners.delete(cb);
  }

  private canWrite(): boolean {
    const m = this.match;
    if (!m) return false;
    if (m.state === 'chat') return true;
    const now = Date.now();
    return m.state === 'room' && now >= m.roomStartsAt && now < m.roomEndsAt;
  }

  async sendMessage(_matchId: string, text: string, kind: 'text' | 'icebreaker' | 'meet' = 'text') {
    const clean = sanitizeMessage(text);
    if (!clean) return;
    if (!this.canWrite()) throw new Error('Süre doldu');
    this.push('me', kind, clean);
    if (kind === 'meet') return;
    this.later(DEMO_TIMING.replyMs, () => {
      if (this.canWrite()) this.push('them', 'text', demoReply(this.replies++));
    });
  }

  async vote(_matchId: string, vote: 'continue' | 'leave') {
    const m = this.match;
    if (!m || m.state !== 'room' || Date.now() < m.roomEndsAt - 1000) throw new Error('Şu an oy verilemez');
    this.match = { ...m, votes: { ...m.votes, me: vote } };
    this.evaluate();
  }

  async sendSnap(_matchId: string, jpegBase64: string) {
    const m = this.match;
    if (!m || !this.canWrite()) throw new Error('Şu an gönderilemez');
    if (m.snapsSentByMe >= SNAPS_PER_MATCH) throw new Error('Bu sohbetteki kozunu zaten oynadın');
    if (!jpegBase64) throw new Error('Fotoğraf yok');
    this.match = { ...m, snapsSentByMe: m.snapsSentByMe + 1 };
    this.emitMatch();
    this.push('system', 'system', 'BlitzSnap kozunu oynadın. Açıldığı an 5 saniye görünecek.');
  }

  onIncomingSnap(_matchId: string, cb: (s: IncomingSnap | null) => void): Unsubscribe {
    this.snapListeners.add(cb);
    cb(this.incoming);
    return () => this.snapListeners.delete(cb);
  }

  async openSnap(_matchId: string, snapId: string) {
    if (!this.incoming || this.incoming.id !== snapId) throw new Error('Bu snap artık yok');
    const capturedAt = this.incoming.capturedAt;
    this.incoming = null; // sunucuda olduğu gibi: açıldığı an silinir
    this.emitSnap();
    return { dataUri: null, capturedAt };
  }

  async meetSuggestions() {
    const m = this.match;
    if (!m) return [];
    const partner = this.users.find((u) => u.id === m.partner.id)!;
    return nearbyCafes(DEMO_ORIGIN, partner.location, demoVenues(DEMO_ORIGIN, partner.location));
  }

  async farewell(_matchId: string, text: string) {
    if (!this.match) return;
    this.push('me', 'farewell', text);
    this.close('farewell', true);
  }

  async report(input: { userId: string }) {
    this.hidden.add(input.userId);
    if (this.match?.partner.id === input.userId) this.close('reported', true);
  }

  async block(userId: string) {
    this.hidden.add(userId);
    if (this.match?.partner.id === userId) this.close('blocked', true);
  }

  async deleteAccount() {
    if (this.profile) this.registry.release(this.profile.identity.name);
    this.profile = null;
    this.match = null;
    this.dispose();
  }
}

