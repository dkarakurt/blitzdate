/**
 * MatchRoom — her eşleşme için ayrı bir Durable Object.
 * 90 saniyelik oda, karar, sonsuz sohbet, mesajlar ve BlitzSnap burada.
 * Süreler Durable Object alarmlarıyla yönetilir; iki taraf WebSocket ile canlı izler.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  applyVote,
  canWrite,
  checkSnap,
  cleanText,
  CLOSED_MATCH_RETENTION_MS,
  isActive,
  UNOPENED_SNAP_TTL_MS,
  VOTE_GRACE_MS,
  type MatchState,
  type Vote,
} from './core';
import { ApiError, hubOf, type Env, type PublicProfile } from './env';

export type ClosedReason = 'decision' | 'farewell' | 'blocked' | 'reported' | 'expired' | 'left';

export interface RoomMeta {
  id: string;
  users: [string, string];
  profiles: Record<string, PublicProfile>;
  distanceM: number;
  roomStartsAt: number;
  roomEndsAt: number;
  decisionEndsAt: number;
  state: MatchState;
  votes: Record<string, Vote>;
  snapsSent: Record<string, number>;
  closedReason: ClosedReason | null;
  closedBy: string | null;
  closedAt: number | null;
}

export interface RoomView {
  id: string;
  partner: { id: string } & PublicProfile;
  distanceM: number;
  state: MatchState;
  roomStartsAt: number;
  roomEndsAt: number;
  decisionEndsAt: number;
  votes: { me: Vote | null; them: Vote | null };
  snapsSentByMe: number;
  meetEligible: boolean;
  closedReason: ClosedReason | null;
  closedByMe: boolean;
}

export interface MessageOut {
  id: string;
  from: string; // uid ya da 'system'
  kind: 'text' | 'icebreaker' | 'meet' | 'farewell' | 'system';
  text: string;
  at: number;
}

const MEET_MAX_M = 2000;
const MAX_MESSAGES = 2000;

export class MatchRoom extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, from_uid TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS snaps (id TEXT PRIMARY KEY, from_uid TEXT NOT NULL, to_uid TEXT NOT NULL, captured_at INTEGER NOT NULL,
        state TEXT NOT NULL, data TEXT, created_at INTEGER NOT NULL);
    `);
  }

  private meta(): RoomMeta | null {
    const r = this.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'meta'").toArray()[0];
    return r ? (JSON.parse(r.v) as RoomMeta) : null;
  }

  private save(m: RoomMeta) {
    this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('meta', ?)", JSON.stringify(m));
  }

  private require(uid: string): RoomMeta {
    const m = this.meta();
    if (!m) throw new ApiError(404, 'no-room', 'Oda bulunamadı');
    if (!m.users.includes(uid)) throw new ApiError(403, 'not-participant', 'Bu odaya erişimin yok');
    return m;
  }

  private viewFor(m: RoomMeta, uid: string): RoomView {
    const other = m.users.find((u) => u !== uid)!;
    return {
      id: m.id,
      partner: { id: other, ...m.profiles[other] },
      distanceM: m.distanceM,
      state: m.state,
      roomStartsAt: m.roomStartsAt,
      roomEndsAt: m.roomEndsAt,
      decisionEndsAt: m.decisionEndsAt,
      votes: { me: m.votes[uid] ?? null, them: m.votes[other] ?? null },
      snapsSentByMe: m.snapsSent[uid] ?? 0,
      meetEligible: m.distanceM <= MEET_MAX_M,
      closedReason: m.closedReason,
      closedByMe: m.closedBy === uid,
    };
  }

  private messages(): MessageOut[] {
    return this.sql
      .exec<{ id: number; from_uid: string; kind: MessageOut['kind']; text: string; at: number }>('SELECT * FROM messages ORDER BY id')
      .toArray()
      .map((r) => ({ id: String(r.id), from: r.from_uid, kind: r.kind, text: r.text, at: r.at }));
  }

  private sealedFor(uid: string): { id: string; capturedAt: number } | null {
    const r = this.sql.exec<{ id: string; captured_at: number }>("SELECT id, captured_at FROM snaps WHERE to_uid = ? AND state = 'sealed' LIMIT 1", uid).toArray()[0];
    return r ? { id: r.id, capturedAt: r.captured_at } : null;
  }

  private send(uid: string, payload: object) {
    const s = JSON.stringify({ ...payload, serverNow: Date.now() });
    for (const ws of this.ctx.getWebSockets(uid)) {
      try {
        ws.send(s);
      } catch {
        /* kopmuş */
      }
    }
  }

  private broadcastState(m: RoomMeta) {
    for (const u of m.users) this.send(u, { type: 'state', match: this.viewFor(m, u) });
  }

  private addMessage(from: string, kind: MessageOut['kind'], text: string, at = Date.now()) {
    const id = this.sql.exec<{ id: number }>('INSERT INTO messages (from_uid, kind, text, at) VALUES (?, ?, ?, ?) RETURNING id', from, kind, text, at).one().id;
    const msg: MessageOut = { id: String(id), from, kind, text, at };
    const m = this.meta();
    if (m) for (const u of m.users) this.send(u, { type: 'message', message: msg });
  }

  private async scheduleAlarm(m: RoomMeta) {
    const times: number[] = [];
    if (m.state === 'room') times.push(m.decisionEndsAt + VOTE_GRACE_MS);
    if (m.state === 'closed' && m.closedAt) times.push(m.closedAt + CLOSED_MATCH_RETENTION_MS);
    const oldest = this.sql.exec<{ t: number | null }>("SELECT MIN(created_at) AS t FROM snaps WHERE state = 'sealed'").one().t;
    if (oldest) times.push(oldest + UNOPENED_SNAP_TTL_MS);
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
    else await this.ctx.storage.deleteAlarm();
  }

  private async close(m: RoomMeta, reason: ClosedReason, by: string | null, now = Date.now()) {
    if (m.state === 'closed') return;
    m.state = 'closed';
    m.closedReason = reason;
    m.closedBy = by;
    m.closedAt = now;
    this.save(m);
    // Açılmamış snap'ler de silinir
    this.sql.exec("UPDATE snaps SET state = 'expired', data = NULL WHERE state = 'sealed'");
    this.broadcastState(m);
    await hubOf(this.env).setBusy(m.users, m.id, null);
    await this.scheduleAlarm(m);
  }

  // ───── RPC ─────

  async init(input: Pick<RoomMeta, 'id' | 'users' | 'profiles' | 'distanceM' | 'roomStartsAt' | 'roomEndsAt' | 'decisionEndsAt'>): Promise<void> {
    if (this.meta()) return;
    const m: RoomMeta = { ...input, state: 'room', votes: {}, snapsSent: {}, closedReason: null, closedBy: null, closedAt: null };
    this.save(m);
    await this.scheduleAlarm(m);
  }

  async view(uid: string): Promise<RoomView> {
    return this.viewFor(this.require(uid), uid);
  }

  async postMessage(uid: string, text: unknown, kind: unknown, now = Date.now()): Promise<void> {
    const m = this.require(uid);
    if (!canWrite(m.state, m, now)) throw new ApiError(409, 'closed', 'Süre doldu');
    const k = kind === 'icebreaker' || kind === 'meet' ? kind : 'text';
    const clean = cleanText(text);
    if (!clean) throw new ApiError(400, 'empty', 'Mesaj boş');
    const count = this.sql.exec<{ c: number }>('SELECT COUNT(*) AS c FROM messages').one().c;
    if (count >= MAX_MESSAGES) throw new ApiError(429, 'too-many', 'Mesaj sınırına ulaşıldı');
    this.addMessage(uid, k, clean, now);
  }

  async vote(uid: string, vote: unknown, now = Date.now()): Promise<void> {
    const m = this.require(uid);
    if (vote !== 'continue' && vote !== 'leave') throw new ApiError(400, 'bad-vote', 'Geçersiz oy');
    const r = applyVote(m.state, m, m.users, m.votes, uid, vote, now);
    if (r.kind === 'rejected') throw new ApiError(409, r.reason, 'Şu an oy verilemez');
    m.votes = r.votes;
    if (r.kind === 'closed') {
      this.save(m);
      return this.close(m, 'decision', vote === 'leave' ? uid : null, now);
    }
    if (r.kind === 'chat') {
      m.state = 'chat';
      this.save(m);
      this.addMessage('system', 'system', 'İkiniz de Devam dediniz. Artık süre yok.', now);
      await hubOf(this.env).setBusy(m.users, m.id, 'forever');
      await this.scheduleAlarm(m);
    } else {
      this.save(m);
    }
    this.broadcastState(m);
  }

  async sendSnap(uid: string, imageBase64: unknown, capturedAt: unknown, now = Date.now()): Promise<void> {
    const m = this.require(uid);
    if (!canWrite(m.state, m, now)) throw new ApiError(409, 'closed', 'Şu an gönderilemez');
    const check = checkSnap(m.snapsSent[uid] ?? 0, imageBase64, capturedAt, now);
    if (!check.ok) throw new ApiError(400, check.reason, check.reason === 'no-snaps-left' ? 'Bu sohbetteki kozunu zaten oynadın' : 'Fotoğraf kabul edilmedi');
    const to = m.users.find((u) => u !== uid)!;
    const id = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO snaps (id, from_uid, to_uid, captured_at, state, data, created_at) VALUES (?, ?, ?, ?, 'sealed', ?, ?)",
      id, uid, to, Math.min(now, capturedAt as number), imageBase64 as string, now,
    );
    m.snapsSent[uid] = (m.snapsSent[uid] ?? 0) + 1;
    this.save(m);
    this.addMessage('system', 'system', `${m.profiles[uid].name} BlitzSnap kozunu oynadı.`, now);
    this.send(to, { type: 'snap', snap: this.sealedFor(to) });
    this.broadcastState(m);
    await this.scheduleAlarm(m);
  }

  /** Açıldığı an fotoğraf silinir; veri yalnızca bu yanıtla bir kez döner. */
  async openSnap(uid: string, snapId: string, now = Date.now()): Promise<{ imageBase64: string; capturedAt: number }> {
    this.require(uid);
    const r = this.sql.exec<{ to_uid: string; state: string; data: string | null; captured_at: number }>('SELECT to_uid, state, data, captured_at FROM snaps WHERE id = ?', snapId).toArray()[0];
    if (!r || r.to_uid !== uid) throw new ApiError(403, 'not-yours', 'Bu snap sana ait değil');
    if (r.state !== 'sealed' || !r.data) throw new ApiError(410, 'gone', 'Bu snap artık yok');
    this.sql.exec("UPDATE snaps SET state = 'opened', data = NULL, created_at = ? WHERE id = ?", now, snapId);
    this.send(uid, { type: 'snap', snap: this.sealedFor(uid) });
    return { imageBase64: r.data, capturedAt: r.captured_at };
  }

  async farewell(uid: string, text: unknown, now = Date.now()): Promise<void> {
    const m = this.require(uid);
    const clean = cleanText(text);
    if (!clean) throw new ApiError(400, 'empty', 'Mesaj gerekli');
    if (!isActive(m.state, m, now)) return;
    this.addMessage(uid, 'farewell', clean, now);
    await this.close(m, 'farewell', uid, now);
  }

  /** Engelleme / şikayet / hesap silme ile kapatma */
  async closeBy(uid: string, reason: ClosedReason): Promise<void> {
    const m = this.require(uid);
    await this.close(m, reason, uid);
  }

  async participants(uid: string): Promise<[string, string]> {
    return this.require(uid).users;
  }

  // ───── WebSocket ─────

  async fetch(req: Request): Promise<Response> {
    const uid = req.headers.get('X-Fink-Uid');
    if (!uid || req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    let m: RoomMeta;
    try {
      m = this.require(uid);
    } catch (e) {
      const err = ApiError.from(e);
      return new Response(err.text, { status: err.status });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [uid]);
    const now = Date.now();
    server.send(JSON.stringify({ type: 'state', match: this.viewFor(m, uid), serverNow: now }));
    server.send(JSON.stringify({ type: 'messages', messages: this.messages(), serverNow: now }));
    server.send(JSON.stringify({ type: 'snap', snap: this.sealedFor(uid), serverNow: now }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (msg === 'ping') ws.send('pong');
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      /* zaten kapalı */
    }
  }

  // ───── zamanlayıcı ─────

  async alarm(): Promise<void> {
    const m = this.meta();
    if (!m) return;
    const now = Date.now();
    this.sql.exec("UPDATE snaps SET state = 'expired', data = NULL WHERE state = 'sealed' AND created_at < ?", now - UNOPENED_SNAP_TTL_MS);
    if (m.state === 'room' && now >= m.decisionEndsAt + VOTE_GRACE_MS) {
      await this.close(m, 'expired', null, now);
      return;
    }
    if (m.state === 'closed' && m.closedAt && now >= m.closedAt + CLOSED_MATCH_RETENTION_MS) {
      // Saklama süresi doldu: odadaki her şey kalıcı olarak silinir.
      for (const ws of this.ctx.getWebSockets()) ws.close(4002, 'purged');
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.scheduleAlarm(m);
  }
}
