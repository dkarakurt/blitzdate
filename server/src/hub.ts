/**
 * RadarHub — tek bir Durable Object (AB yargı bölgesinde).
 * Çevrimiçi kişilerin konumu, çarpmalar, engellemeler ve "meşgul" durumu burada, belleğe yakın
 * SQLite'ta tutulur. Böylece her konum güncellemesi D1'in günlük yazma hakkını harcamaz.
 * Eşleşme olduğunda iki kullanıcının "gelen kutusu" WebSocket'ine anında haber verir.
 */
import { DurableObject } from 'cloudflare:workers';
import { distanceMeters, type Gender, type GeoPoint } from './shared/radar';
import {
  filterNearby,
  isFresh,
  matchTimes,
  RADAR_RADIUS_M,
  roundDistance,
  STRIKE_TTL_MS,
  VOTE_GRACE_MS,
  type Candidate,
} from './core';
import { ApiError, newRoomId, roomOf, type Env, type PublicProfile } from './env';

const FAR_FUTURE = Date.UTC(2100, 0, 1);
const PRESENCE_TTL_MS = 15 * 60_000;
/** ~1,1 km enlem; boylam için Türkiye enleminde biraz daha geniş tutulur */
const BOX_LAT = 0.0105;
const BOX_LNG = 0.014;

type Row = Record<string, SqlStorageValue>;

export interface NearbyEntry extends PublicProfile {
  id: string;
  distanceM: number;
  struckMe: boolean;
}

export class RadarHub extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS presence (
        uid TEXT PRIMARY KEY, lat REAL NOT NULL, lng REAL NOT NULL, gender TEXT NOT NULL,
        name TEXT NOT NULL, kind TEXT NOT NULL, color TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS presence_lat ON presence (lat);
      CREATE TABLE IF NOT EXISTS busy (uid TEXT PRIMARY KEY, match_id TEXT NOT NULL, until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS strikes (from_uid TEXT NOT NULL, to_uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (from_uid, to_uid));
      CREATE INDEX IF NOT EXISTS strikes_to ON strikes (to_uid, at);
      CREATE TABLE IF NOT EXISTS blocks (by_uid TEXT NOT NULL, target TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (by_uid, target));
      CREATE INDEX IF NOT EXISTS blocks_target ON blocks (target);
    `);
  }

  private one<T extends Row>(q: string, ...args: SqlStorageValue[]): T | null {
    const r = this.sql.exec<T>(q, ...args).toArray();
    return r[0] ?? null;
  }

  private blockedSet(uid: string): Set<string> {
    const s = new Set<string>();
    for (const r of this.sql.exec<{ x: string }>('SELECT target AS x FROM blocks WHERE by_uid = ? UNION SELECT by_uid AS x FROM blocks WHERE target = ?', uid, uid)) s.add(r.x);
    return s;
  }

  private busyMatch(uid: string, now: number): string | null {
    const r = this.one<{ match_id: string; until: number }>('SELECT match_id, until FROM busy WHERE uid = ?', uid);
    return r && r.until > now ? r.match_id : null;
  }

  // ───── konum ─────

  async setPresence(uid: string, p: PublicProfile & { gender: Gender }, loc: GeoPoint | null, now = Date.now()): Promise<void> {
    if (!loc) {
      this.sql.exec('DELETE FROM presence WHERE uid = ?', uid);
      return;
    }
    if (!(Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180)) throw new ApiError(400, 'bad-location', 'Geçersiz konum');
    this.sql.exec(
      `INSERT INTO presence (uid, lat, lng, gender, name, kind, color, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(uid) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, gender=excluded.gender, name=excluded.name,
       kind=excluded.kind, color=excluded.color, updated_at=excluded.updated_at`,
      uid, loc.lat, loc.lng, p.gender, p.name, p.kind, p.color, now,
    );
  }

  /** Profil değişince (yeniden çekme) radardaki görünen isim güncellenir */
  async updateProfile(uid: string, p: PublicProfile): Promise<void> {
    this.sql.exec('UPDATE presence SET name = ?, kind = ?, color = ? WHERE uid = ?', p.name, p.kind, p.color, uid);
  }

  async nearby(uid: string, now = Date.now()): Promise<{ entries: NearbyEntry[]; needLocation: boolean }> {
    const me = this.one<{ lat: number; lng: number; gender: Gender; updated_at: number }>('SELECT lat, lng, gender, updated_at FROM presence WHERE uid = ?', uid);
    if (!me || !isFresh(me.updated_at, now)) return { entries: [], needLocation: true };
    const rows = this.sql
      .exec<{ uid: string; lat: number; lng: number; gender: Gender; name: string; kind: string; color: string; updated_at: number }>(
        'SELECT uid, lat, lng, gender, name, kind, color, updated_at FROM presence WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 500',
        me.lat - BOX_LAT, me.lat + BOX_LAT, me.lng - BOX_LNG, me.lng + BOX_LNG,
      )
      .toArray();
    const byId = new Map(rows.map((r) => [r.uid, r]));
    const excluded = this.blockedSet(uid);
    for (const r of rows) if (this.busyMatch(r.uid, now)) excluded.add(r.uid);
    const candidates: Candidate[] = rows.map((r) => ({ uid: r.uid, gender: r.gender, location: { lat: r.lat, lng: r.lng }, updatedAt: r.updated_at }));
    const hits = filterNearby({ uid, gender: me.gender, location: { lat: me.lat, lng: me.lng } }, candidates, excluded, now).slice(0, 30);
    const struck = new Set(
      this.sql.exec<{ from_uid: string }>('SELECT from_uid FROM strikes WHERE to_uid = ? AND at >= ?', uid, now - STRIKE_TTL_MS).toArray().map((r) => r.from_uid),
    );
    return {
      needLocation: false,
      entries: hits.map((h) => {
        const r = byId.get(h.uid)!;
        return { id: h.uid, name: r.name, kind: r.kind, color: r.color, distanceM: roundDistance(h.distanceM), struckMe: struck.has(h.uid) };
      }),
    };
  }

  // ───── çarpma ve eşleşme ─────

  async strike(uid: string, target: string, now = Date.now()): Promise<{ matched: boolean; matchId: string | null }> {
    if (uid === target) throw new ApiError(400, 'self', 'Kendine çarpamazsın');
    const me = this.one<{ lat: number; lng: number; gender: string; name: string; kind: string; color: string; updated_at: number }>('SELECT * FROM presence WHERE uid = ?', uid);
    const other = this.one<{ lat: number; lng: number; gender: string; name: string; kind: string; color: string; updated_at: number }>('SELECT * FROM presence WHERE uid = ?', target);
    if (!me || !isFresh(me.updated_at, now)) throw new ApiError(409, 'no-location', 'Konum güncel değil');
    if (!other || !isFresh(other.updated_at, now) || other.gender === me.gender || this.blockedSet(uid).has(target)) {
      throw new ApiError(409, 'unavailable', 'Bu kişi artık uygun değil');
    }
    const d = distanceMeters({ lat: me.lat, lng: me.lng }, { lat: other.lat, lng: other.lng });
    if (d > RADAR_RADIUS_M) throw new ApiError(409, 'too-far', 'Bu kişi artık yakında değil');
    if (this.busyMatch(uid, now) || this.busyMatch(target, now)) throw new ApiError(409, 'busy', 'Şu an başka bir odada');

    this.sql.exec('INSERT INTO strikes (from_uid, to_uid, at) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET at = excluded.at', uid, target, now);
    const reverse = this.one<{ at: number }>('SELECT at FROM strikes WHERE from_uid = ? AND to_uid = ?', target, uid);
    if (!reverse || now - reverse.at > STRIKE_TTL_MS) return { matched: false, matchId: null };

    // Karşılıklı çarpma: oda aç. "Meşgul" işareti beklemeden önce yazılır (yarış koşuluna karşı).
    const t = matchTimes(now);
    const matchId = newRoomId(this.env);
    const until = t.decisionEndsAt + VOTE_GRACE_MS;
    this.sql.exec('INSERT OR REPLACE INTO busy (uid, match_id, until) VALUES (?, ?, ?), (?, ?, ?)', uid, matchId, until, target, matchId, until);
    this.sql.exec('DELETE FROM strikes WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)', uid, target, target, uid);
    await roomOf(this.env, matchId).init({
      id: matchId,
      users: [uid, target],
      profiles: { [uid]: { name: me.name, kind: me.kind, color: me.color }, [target]: { name: other.name, kind: other.kind, color: other.color } },
      distanceM: roundDistance(d),
      ...t,
    });
    this.notify([uid, target], { type: 'match', matchId });
    return { matched: true, matchId };
  }

  /** Oda sohbete dönünce süresiz meşgul; kapanınca serbest */
  async setBusy(users: string[], matchId: string, until: number | 'forever' | null): Promise<void> {
    for (const u of users) {
      if (until === null) this.sql.exec('DELETE FROM busy WHERE uid = ? AND match_id = ?', u, matchId);
      else this.sql.exec('INSERT OR REPLACE INTO busy (uid, match_id, until) VALUES (?, ?, ?)', u, matchId, until === 'forever' ? FAR_FUTURE : until);
    }
  }

  async activeMatch(uid: string, now = Date.now()): Promise<string | null> {
    return this.busyMatch(uid, now);
  }

  /** BlitzMeet için iki kişinin taze konumu (yalnızca sunucu içinde kullanılır) */
  async locations(a: string, b: string, now = Date.now()): Promise<[GeoPoint, GeoPoint] | null> {
    const pa = this.one<{ lat: number; lng: number; updated_at: number }>('SELECT lat, lng, updated_at FROM presence WHERE uid = ?', a);
    const pb = this.one<{ lat: number; lng: number; updated_at: number }>('SELECT lat, lng, updated_at FROM presence WHERE uid = ?', b);
    if (!pa || !pb || !isFresh(pa.updated_at, now) || !isFresh(pb.updated_at, now)) return null;
    return [{ lat: pa.lat, lng: pa.lng }, { lat: pb.lat, lng: pb.lng }];
  }

  // ───── engelleme ve hesap silme ─────

  /** Engeller; ikisi aynı odadaysa o odanın kimliğini döndürür (kapatılsın diye) */
  async block(by: string, target: string, now = Date.now()): Promise<string | null> {
    this.sql.exec('INSERT OR IGNORE INTO blocks (by_uid, target, at) VALUES (?, ?, ?)', by, target, now);
    this.sql.exec('DELETE FROM strikes WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)', by, target, target, by);
    const a = this.busyMatch(by, now);
    return a && a === this.busyMatch(target, now) ? a : null;
  }

  /** Hesap silinince kişiyle ilgili her şeyi unutur; aktif odasını döndürür */
  async forget(uid: string, now = Date.now()): Promise<string | null> {
    const active = this.busyMatch(uid, now);
    this.sql.exec('DELETE FROM presence WHERE uid = ?', uid);
    this.sql.exec('DELETE FROM strikes WHERE from_uid = ? OR to_uid = ?', uid, uid);
    this.sql.exec('DELETE FROM blocks WHERE by_uid = ?', uid);
    this.sql.exec('DELETE FROM busy WHERE uid = ?', uid);
    for (const ws of this.ctx.getWebSockets(uid)) ws.close(4001, 'deleted');
    return active;
  }

  async cleanup(now = Date.now()): Promise<{ presence: number; strikes: number; busy: number }> {
    const presence = this.sql.exec('DELETE FROM presence WHERE updated_at < ?', now - PRESENCE_TTL_MS).rowsWritten;
    const strikes = this.sql.exec('DELETE FROM strikes WHERE at < ?', now - STRIKE_TTL_MS).rowsWritten;
    const busy = this.sql.exec('DELETE FROM busy WHERE until < ?', now).rowsWritten;
    return { presence, strikes, busy };
  }

  // ───── gelen kutusu (WebSocket) ─────

  async fetch(req: Request): Promise<Response> {
    const uid = req.headers.get('X-Fink-Uid');
    if (!uid || req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [uid]);
    const active = this.busyMatch(uid, Date.now());
    server.send(JSON.stringify({ type: 'hello', serverNow: Date.now(), matchId: active }));
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

  private notify(users: string[], payload: unknown) {
    const s = JSON.stringify({ ...(payload as object), serverNow: Date.now() });
    for (const u of users) for (const ws of this.ctx.getWebSockets(u)) {
      try {
        ws.send(s);
      } catch {
        /* kopmuş bağlantı */
      }
    }
  }
}
