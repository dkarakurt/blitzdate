/**
 * Fink API — Cloudflare Worker.
 * Kalıcı kayıtlar D1'de (SQLite); canlı durum Durable Object'lerde (RadarHub, MatchRoom).
 */
import { candidateName, cafesFromOverpass, overpassQuery, REPORT_REASONS, roundDistance, isGender } from './core';
import { midpoint } from './shared/meet';
import { bearer, hashToken, newToken, newUserId } from './auth';
import { ApiError, hubOf, roomOf, type Env, type PublicProfile } from './env';

export { RadarHub } from './hub';
export { MatchRoom } from './room';

const TERMS_VERSION_MIN = '2026-11-11';
const API_VERSION = 'fink-api/1';

interface UserRow {
  id: string;
  name: string;
  kind: string;
  color: string;
  gender: 'female' | 'male';
  rerolled: number;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function profileJson(u: UserRow) {
  return { uid: u.id, name: u.name, kind: u.kind, color: u.color, gender: u.gender, rerolled: !!u.rerolled };
}

async function body<T>(req: Request, max = 1_200_000): Promise<T> {
  const len = Number(req.headers.get('Content-Length') ?? 0);
  if (len > max) throw new ApiError(413, 'too-large', 'İstek çok büyük');
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, 'bad-json', 'Geçersiz istek');
  }
}

async function authUser(req: Request, env: Env): Promise<UserRow> {
  const token = bearer(req);
  if (!token) throw new ApiError(401, 'unauthenticated', 'Oturum gerekli');
  const u = await env.DB.prepare('SELECT id, name, kind, color, gender, rerolled FROM users WHERE token_hash = ?').bind(await hashToken(token)).first<UserRow>();
  if (!u) throw new ApiError(401, 'unauthenticated', 'Oturum geçersiz');
  return u;
}

function isUnique(e: unknown) {
  return String((e as Error)?.message ?? e).includes('UNIQUE');
}

async function register(req: Request, env: Env) {
  const b = await body<{ gender?: unknown; adultConfirmed?: unknown; termsVersion?: unknown }>(req, 2000);
  if (!isGender(b.gender)) throw new ApiError(400, 'gender', 'Cinsiyet gerekli');
  if (b.adultConfirmed !== true) throw new ApiError(400, 'adult', '18 yaş onayı gerekli');
  if (typeof b.termsVersion !== 'string' || b.termsVersion < TERMS_VERSION_MIN) throw new ApiError(400, 'terms', 'Güncel koşullar kabul edilmeli');
  const token = newToken();
  const id = newUserId();
  const hash = await hashToken(token);
  const now = Date.now();
  for (let attempt = 0; attempt < 40; attempt++) {
    const c = candidateName(Math.random, attempt);
    try {
      await env.DB.prepare(
        'INSERT INTO users (id, token_hash, name, kind, color, gender, rerolled, adult_confirmed_at, terms_version, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
      )
        .bind(id, hash, c.name, c.kind, c.color, b.gender, now, b.termsVersion, now)
        .run();
      return json({ token, profile: profileJson({ id, name: c.name, kind: c.kind, color: c.color, gender: b.gender, rerolled: 0 }) }, 201);
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  }
  throw new ApiError(503, 'names-exhausted', 'Şu an isim atanamadı, tekrar dene');
}

async function reroll(user: UserRow, env: Env) {
  if (user.rerolled) return json({ profile: profileJson(user) });
  for (let attempt = 0; attempt < 40; attempt++) {
    const c = candidateName(Math.random, attempt);
    try {
      const r = await env.DB.prepare('UPDATE users SET name = ?, kind = ?, color = ?, rerolled = 1 WHERE id = ? AND rerolled = 0')
        .bind(c.name, c.kind, c.color, user.id)
        .run();
      if (!r.meta.changes) break;
      const updated = { ...user, name: c.name, kind: c.kind, color: c.color, rerolled: 1 };
      await hubOf(env).updateProfile(user.id, c);
      return json({ profile: profileJson(updated) });
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  }
  const fresh = await env.DB.prepare('SELECT id, name, kind, color, gender, rerolled FROM users WHERE id = ?').bind(user.id).first<UserRow>();
  return json({ profile: profileJson(fresh ?? user) });
}

async function cafes(user: UserRow, matchId: string, env: Env) {
  const room = roomOf(env, matchId);
  const view = await room.view(user.id);
  if (view.state !== 'chat') return json({ cafes: [] });
  const locs = await hubOf(env).locations(user.id, view.partner.id);
  if (!locs) return json({ cafes: [] });
  const [a, b] = locs;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Fink/0.3 (cafe suggestions)' },
      body: 'data=' + encodeURIComponent(overpassQuery(midpoint(a, b))),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const data = (await res.json()) as { elements?: Parameters<typeof cafesFromOverpass>[2] };
    const list = cafesFromOverpass(a, b, data.elements ?? []).map((c) => ({
      venue: { id: c.venue.id, name: c.venue.name, kind: 'cafe', location: c.venue.location, isPublic: true, tags: c.venue.tags },
      toA: roundDistance(c.toA),
      toB: roundDistance(c.toB),
    }));
    return json({ cafes: list });
  } catch {
    throw new ApiError(503, 'cafes-unavailable', 'Kafe bilgisi şu an alınamadı');
  } finally {
    clearTimeout(timer);
  }
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const m = req.method;

  if (path === '/v1/health') return json({ ok: true, version: API_VERSION, serverNow: Date.now() });
  if (m === 'POST' && path === '/v1/register') return register(req, env);

  const user = await authUser(req, env);
  const hub = hubOf(env);
  const profile: PublicProfile & { gender: UserRow['gender'] } = { name: user.name, kind: user.kind, color: user.color, gender: user.gender };

  if (m === 'GET' && path === '/v1/me') {
    return json({ profile: profileJson(user), activeMatchId: await hub.activeMatch(user.id), serverNow: Date.now() });
  }
  if (m === 'POST' && path === '/v1/reroll') return reroll(user, env);
  if (m === 'DELETE' && path === '/v1/me') {
    const active = await hub.forget(user.id);
    if (active) await roomOf(env, active).closeBy(user.id, 'left').catch(() => {});
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    return json({ ok: true });
  }
  if (m === 'POST' && path === '/v1/presence') {
    const b = await body<{ lat?: unknown; lng?: unknown; offline?: unknown }>(req, 500);
    if (b.offline === true) await hub.setPresence(user.id, profile, null);
    else if (typeof b.lat === 'number' && typeof b.lng === 'number') await hub.setPresence(user.id, profile, { lat: b.lat, lng: b.lng });
    else throw new ApiError(400, 'bad-location', 'Geçersiz konum');
    return json({ ok: true });
  }
  if (m === 'GET' && path === '/v1/nearby') return json({ ...(await hub.nearby(user.id)), serverNow: Date.now() });
  if (m === 'POST' && path === '/v1/strike') {
    const b = await body<{ targetId?: unknown }>(req, 500);
    if (typeof b.targetId !== 'string' || !b.targetId) throw new ApiError(400, 'target', 'Geçersiz kişi');
    return json({ ...(await hub.strike(user.id, b.targetId)), serverNow: Date.now() });
  }
  if (m === 'GET' && path === '/v1/inbox') {
    if (req.headers.get('Upgrade') !== 'websocket') throw new ApiError(426, 'websocket', 'WebSocket gerekli');
    const fwd = new Request(req.url, { headers: { Upgrade: 'websocket', 'X-Fink-Uid': user.id } });
    return hub.fetch(fwd);
  }
  if (m === 'POST' && path === '/v1/block') {
    const b = await body<{ userId?: unknown }>(req, 500);
    if (typeof b.userId !== 'string' || b.userId === user.id) throw new ApiError(400, 'target', 'Geçersiz kişi');
    const shared = await hub.block(user.id, b.userId);
    if (shared) await roomOf(env, shared).closeBy(user.id, 'blocked');
    return json({ ok: true });
  }
  if (m === 'POST' && path === '/v1/report') {
    const b = await body<{ userId?: unknown; matchId?: unknown; reason?: unknown; note?: unknown }>(req, 4000);
    if (typeof b.userId !== 'string' || b.userId === user.id) throw new ApiError(400, 'target', 'Geçersiz kişi');
    if (!REPORT_REASONS.includes(b.reason as (typeof REPORT_REASONS)[number])) throw new ApiError(400, 'reason', 'Geçersiz neden');
    await env.DB.prepare('INSERT INTO reports (by_user, target, match_id, reason, note, at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(user.id, b.userId, typeof b.matchId === 'string' ? b.matchId : null, b.reason as string, typeof b.note === 'string' ? b.note.slice(0, 500) : null, Date.now())
      .run();
    const shared = await hub.block(user.id, b.userId);
    if (shared) await roomOf(env, shared).closeBy(user.id, 'reported');
    return json({ ok: true });
  }

  const mm = path.match(/^\/v1\/matches\/([0-9a-f]{64})(\/.*)?$/);
  if (mm) {
    const matchId = mm[1];
    const sub = mm[2] ?? '';
    const room = roomOf(env, matchId);
    if (m === 'GET' && sub === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') throw new ApiError(426, 'websocket', 'WebSocket gerekli');
      return room.fetch(new Request(req.url, { headers: { Upgrade: 'websocket', 'X-Fink-Uid': user.id } }));
    }
    if (m === 'GET' && sub === '') return json({ match: await room.view(user.id), serverNow: Date.now() });
    if (m === 'POST' && sub === '/messages') {
      const b = await body<{ text?: unknown; kind?: unknown }>(req, 4000);
      await room.postMessage(user.id, b.text, b.kind);
      return json({ ok: true });
    }
    if (m === 'POST' && sub === '/vote') {
      const b = await body<{ vote?: unknown }>(req, 500);
      await room.vote(user.id, b.vote);
      return json({ ok: true });
    }
    if (m === 'POST' && sub === '/snaps') {
      const b = await body<{ imageBase64?: unknown; capturedAt?: unknown }>(req);
      await room.sendSnap(user.id, b.imageBase64, b.capturedAt);
      return json({ ok: true });
    }
    const open = sub.match(/^\/snaps\/([0-9a-f-]{36})\/open$/);
    if (m === 'POST' && open) return json(await room.openSnap(user.id, open[1]));
    if (m === 'GET' && sub === '/cafes') return cafes(user, matchId, env);
    if (m === 'POST' && sub === '/farewell') {
      const b = await body<{ text?: unknown }>(req, 4000);
      await room.farewell(user.id, b.text);
      return json({ ok: true });
    }
  }
  throw new ApiError(404, 'not-found', 'Bulunamadı');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e) {
      const err = ApiError.from(e);
      if (err.status >= 500) console.error('api error', e);
      return json({ error: err.code, message: err.text }, err.status);
    }
  },

  async scheduled(_c: ScheduledController, env: Env): Promise<void> {
    const r = await hubOf(env).cleanup();
    console.log('cleanup', r);
  },
} satisfies ExportedHandler<Env>;
