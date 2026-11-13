/**
 * CANLI SUNUCU — Cloudflare (Worker + D1 + Durable Objects).
 * HTTPS ile istekler, WebSocket ile canlı olaylar (eşleşme bildirimi, oda durumu, mesajlar, snap).
 * Bu dosya Expo/React Native'e bağımlı değildir (Node'da da test edilebilir).
 */
import type { AnimalIdentity, AnimalKind } from '../logic/names';
import type { Gender, GeoPoint } from '../logic/radar';
import type { CafeSuggestion } from '../logic/meet';
import { ApiClientError } from './errors';
import type {
  Backend,
  ChatMessage,
  IncomingSnap,
  MatchView,
  OpenedSnap,
  Profile,
  RadarEntry,
  ReportReason,
  Unsubscribe,
} from './types';

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

interface ProfileJson {
  uid: string;
  name: string;
  kind: string;
  color: string;
  gender: Gender;
  rerolled: boolean;
}

interface RoomViewJson {
  id: string;
  partner: { id: string; name: string; kind: string; color: string };
  distanceM: number;
  state: MatchView['state'];
  roomStartsAt: number;
  roomEndsAt: number;
  decisionEndsAt: number;
  votes: MatchView['votes'];
  snapsSentByMe: number;
  meetEligible: boolean;
  closedReason: MatchView['closedReason'];
  closedByMe: boolean;
}

interface MessageJson {
  id: string;
  from: string;
  kind: ChatMessage['kind'];
  text: string;
  at: number;
}

const identityOf = (p: { name: string; kind: string; color: string }): AnimalIdentity => ({
  name: p.name,
  kind: p.kind as AnimalKind,
  color: p.color,
});

const RECONNECT_MS = [500, 1000, 2000, 5000, 10000];
const PING_MS = 25_000;

/** Kopunca kendini yeniden bağlayan WebSocket */
class LiveSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private ping: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private url: () => Promise<string | null>,
    private onMessage: (data: any) => void,
  ) {
    this.open();
  }

  private async open() {
    if (this.stopped) return;
    const url = await this.url();
    if (!url || this.stopped) return;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.ping = setInterval(() => {
        try {
          ws.send('ping');
        } catch {
          /* yok say */
        }
      }, PING_MS);
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data === 'pong') return;
      try {
        this.onMessage(JSON.parse(e.data));
      } catch {
        /* bozuk ileti */
      }
    };
    ws.onclose = (e) => {
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      if (this.stopped) return;
      // 4001 hesap silindi, 4002 oda silindi: yeniden bağlanma
      if (e.code === 4001 || e.code === 4002) return;
      const wait = RECONNECT_MS[Math.min(this.attempt++, RECONNECT_MS.length - 1)];
      this.retry = setTimeout(() => this.open(), wait);
    };
    ws.onerror = () => {
      /* ardından onclose gelir */
    };
  }

  close() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.ping) clearInterval(this.ping);
    try {
      this.ws?.close(1000, 'bye');
    } catch {
      /* zaten kapalı */
    }
  }
}

type SnapJson = { id: string; capturedAt: number } | null;

/** Bir odanın canlı bağlantısı: durum, mesajlar, gelen snap */
class RoomStream {
  view: RoomViewJson | null = null;
  messages: MessageJson[] = [];
  snap: SnapJson = null;
  readonly viewListeners = new Set<(v: RoomViewJson) => void>();
  readonly messageListeners = new Set<(m: MessageJson[]) => void>();
  readonly snapListeners = new Set<(s: SnapJson) => void>();
  private socket: LiveSocket;

  constructor(url: () => Promise<string | null>, onServerNow: (t: number) => void) {
    this.socket = new LiveSocket(url, (msg) => {
      if (typeof msg.serverNow === 'number') onServerNow(msg.serverNow);
      if (msg.type === 'state') {
        this.view = msg.match;
        this.viewListeners.forEach((cb) => cb(msg.match));
      } else if (msg.type === 'messages') {
        this.messages = msg.messages;
        this.messageListeners.forEach((cb) => cb(this.messages));
      } else if (msg.type === 'message') {
        if (!this.messages.some((m) => m.id === msg.message.id)) this.messages = [...this.messages, msg.message];
        this.messageListeners.forEach((cb) => cb(this.messages));
      } else if (msg.type === 'snap') {
        this.snap = msg.snap;
        this.snapListeners.forEach((cb) => cb(this.snap));
      }
    });
  }

  close() {
    this.socket.close();
  }
}

export class LiveBackend implements Backend {
  readonly mode = 'live' as const;
  private token: string | null = null;
  private uid: string | null = null;
  /** sunucu saati − cihaz saati (ms) */
  private offset = 0;
  private rooms = new Map<string, RoomStream>();
  private closedRooms = new Set<string>();
  private readonly base: string;
  private readonly wsBase: string;

  constructor(
    baseUrl: string,
    private store: TokenStore,
  ) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.wsBase = this.base.replace(/^http/, 'ws');
  }

  // ───── altyapı ─────

  private syncClock(serverNow: unknown) {
    if (typeof serverNow === 'number') this.offset = serverNow - Date.now();
  }
  private local(serverMs: number): number {
    return serverMs - this.offset;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(this.base + path, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      this.syncClock(data.serverNow);
      if (!res.ok) throw new ApiClientError(res.status, String(data.error ?? 'error'), String(data.message ?? ''));
      return data as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private wsUrl(path: string) {
    return async () => (this.token ? `${this.wsBase}${path}?token=${encodeURIComponent(this.token)}` : null);
  }

  private toProfile(p: ProfileJson): Profile {
    this.uid = p.uid;
    return { uid: p.uid, identity: identityOf(p), gender: p.gender, rerolled: !!p.rerolled };
  }

  private toView(v: RoomViewJson): MatchView {
    return {
      id: v.id,
      partner: { id: v.partner.id, identity: identityOf(v.partner) },
      distanceM: v.distanceM,
      state: v.state,
      roomStartsAt: this.local(v.roomStartsAt),
      roomEndsAt: this.local(v.roomEndsAt),
      decisionEndsAt: this.local(v.decisionEndsAt),
      votes: v.votes,
      snapsSentByMe: v.snapsSentByMe,
      meetEligible: v.meetEligible,
      closedReason: v.closedReason,
      closedByMe: v.closedByMe,
    };
  }

  private toMessage(m: MessageJson): ChatMessage {
    return { id: m.id, from: m.from === 'system' ? 'system' : m.from === this.uid ? 'me' : 'them', kind: m.kind, text: m.text, at: this.local(m.at) };
  }

  private room(matchId: string): RoomStream {
    let r = this.rooms.get(matchId);
    if (!r) {
      r = new RoomStream(this.wsUrl(`/v1/matches/${matchId}/ws`), (t) => this.syncClock(t));
      this.rooms.set(matchId, r);
    }
    return r;
  }

  private dropRoom(matchId: string) {
    this.rooms.get(matchId)?.close();
    this.rooms.delete(matchId);
  }

  // ───── Backend ─────

  async restore(): Promise<Profile | null> {
    this.token = await this.store.get();
    if (!this.token) return null;
    try {
      const r = await this.req<{ profile: ProfileJson }>('GET', '/v1/me');
      return this.toProfile(r.profile);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        await this.store.clear();
        this.token = null;
        return null;
      }
      throw e;
    }
  }

  async register(input: { gender: Gender; adultConfirmed: true; termsVersion: string }): Promise<Profile> {
    const r = await this.req<{ token: string; profile: ProfileJson }>('POST', '/v1/register', input);
    this.token = r.token;
    await this.store.set(r.token);
    return this.toProfile(r.profile);
  }

  async reroll(): Promise<Profile> {
    const r = await this.req<{ profile: ProfileJson }>('POST', '/v1/reroll', {});
    return this.toProfile(r.profile);
  }

  async updatePresence(location: GeoPoint | null): Promise<void> {
    if (!this.token) return;
    await this.req('POST', '/v1/presence', location ? { lat: location.lat, lng: location.lng } : { offline: true });
  }

  async nearby(): Promise<RadarEntry[]> {
    const r = await this.req<{ entries: { id: string; name: string; kind: string; color: string; distanceM: number; struckMe: boolean }[] }>('GET', '/v1/nearby');
    return r.entries.map((e) => ({ id: e.id, identity: identityOf(e), distanceM: e.distanceM, struckMe: e.struckMe }));
  }

  async strike(targetId: string): Promise<{ matched: boolean }> {
    const r = await this.req<{ matched: boolean }>('POST', '/v1/strike', { targetId });
    return { matched: r.matched };
  }

  onActiveMatch(cb: (m: MatchView | null) => void): Unsubscribe {
    let current: string | null = null;
    let detach: (() => void) | null = null;

    const attach = (matchId: string | null) => {
      if (!matchId || matchId === current || this.closedRooms.has(matchId)) return;
      detach?.();
      current = matchId;
      const room = this.room(matchId);
      const onView = (v: RoomViewJson) => {
        cb(this.toView(v));
        if (v.state === 'closed') {
          this.closedRooms.add(v.id);
          detach?.();
          detach = null;
          current = null;
          this.dropRoom(v.id);
        }
      };
      room.viewListeners.add(onView);
      if (room.view) onView(room.view);
      detach = () => room.viewListeners.delete(onView);
    };

    const inbox = new LiveSocket(this.wsUrl('/v1/inbox'), (msg) => {
      this.syncClock(msg.serverNow);
      if (msg.type === 'hello' || msg.type === 'match') attach(msg.matchId ?? null);
    });
    return () => {
      inbox.close();
      detach?.();
    };
  }

  onMessages(matchId: string, cb: (msgs: ChatMessage[]) => void): Unsubscribe {
    const room = this.room(matchId);
    const fn = (list: MessageJson[]) => cb(list.map((m) => this.toMessage(m)));
    room.messageListeners.add(fn);
    fn(room.messages);
    return () => room.messageListeners.delete(fn);
  }

  async sendMessage(matchId: string, text: string, kind: 'text' | 'icebreaker' | 'meet' = 'text'): Promise<void> {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!clean) return;
    await this.req('POST', `/v1/matches/${matchId}/messages`, { text: clean, kind });
  }

  async vote(matchId: string, vote: 'continue' | 'leave'): Promise<void> {
    await this.req('POST', `/v1/matches/${matchId}/vote`, { vote });
  }

  async sendSnap(matchId: string, jpegBase64: string, capturedAt: number): Promise<void> {
    await this.req('POST', `/v1/matches/${matchId}/snaps`, { imageBase64: jpegBase64, capturedAt: capturedAt + this.offset });
  }

  onIncomingSnap(matchId: string, cb: (s: IncomingSnap | null) => void): Unsubscribe {
    const room = this.room(matchId);
    const fn = (s: SnapJson) => cb(s ? { id: s.id, capturedAt: this.local(s.capturedAt) } : null);
    room.snapListeners.add(fn);
    fn(room.snap);
    return () => room.snapListeners.delete(fn);
  }

  async openSnap(matchId: string, snapId: string): Promise<OpenedSnap> {
    const r = await this.req<{ imageBase64: string; capturedAt: number }>('POST', `/v1/matches/${matchId}/snaps/${snapId}/open`, {});
    return { dataUri: `data:image/jpeg;base64,${r.imageBase64}`, capturedAt: this.local(r.capturedAt) };
  }

  async meetSuggestions(matchId: string): Promise<CafeSuggestion[]> {
    const r = await this.req<{ cafes: CafeSuggestion[] }>('GET', `/v1/matches/${matchId}/cafes`);
    return r.cafes;
  }

  async farewell(matchId: string, text: string): Promise<void> {
    await this.req('POST', `/v1/matches/${matchId}/farewell`, { text });
  }

  async report(input: { userId: string; matchId?: string; reason: ReportReason; note?: string }): Promise<void> {
    await this.req('POST', '/v1/report', input);
  }

  async block(userId: string): Promise<void> {
    await this.req('POST', '/v1/block', { userId });
  }

  async deleteAccount(): Promise<void> {
    await this.req('DELETE', '/v1/me');
    for (const id of [...this.rooms.keys()]) this.dropRoom(id);
    await this.store.clear();
    this.token = null;
    this.uid = null;
  }
}
