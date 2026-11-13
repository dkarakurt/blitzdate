/**
 * Uçtan uca sunucu testleri: gerçek Workers çalışma ortamı (workerd), D1 ve Durable Objects ile.
 */
import { describe, expect, test } from 'vitest';
import { env, runDurableObjectAlarm, SELF } from 'cloudflare:test';
import { hubOf, newRoomId, roomOf } from '../src/env';

const BASE = 'https://fink.test';
const origin = { lat: 40.9903, lng: 29.029 };
const off = (n: number, e: number) => ({ lat: origin.lat + n / 111320, lng: origin.lng + e / (111320 * Math.cos((origin.lat * Math.PI) / 180)) });
const JPEG = '/9j/' + 'A'.repeat(400);

async function api(path: string, opts: { token?: string; method?: string; body?: unknown } = {}) {
  const res = await SELF.fetch(BASE + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json()) as Record<string, any>;
  return { status: res.status, data };
}

async function user(gender: 'female' | 'male', at = origin) {
  const r = await api('/v1/register', { body: { gender, adultConfirmed: true, termsVersion: '2026-11-11' } });
  expect(r.status).toBe(201);
  const token = r.data.token as string;
  const p = await api('/v1/presence', { token, body: at });
  expect(p.status).toBe(200);
  return { token, id: r.data.profile.uid as string, name: r.data.profile.name as string };
}

/** Karşılıklı çarpma ile oda açar */
async function match(a: { token: string; id: string }, b: { token: string; id: string }) {
  const s1 = await api('/v1/strike', { token: a.token, body: { targetId: b.id } });
  expect(s1.data.matched).toBe(false);
  const s2 = await api('/v1/strike', { token: b.token, body: { targetId: a.id } });
  expect(s2.data.matched).toBe(true);
  return s2.data.matchId as string;
}

async function openWs(path: string, token: string) {
  const res = await SELF.fetch(`${BASE}${path}?token=${encodeURIComponent(token)}`, { headers: { Upgrade: 'websocket' } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const inbox: any[] = [];
  ws.addEventListener('message', (e) => inbox.push(JSON.parse(e.data as string)));
  ws.accept();
  const next = async (type: string) => {
    for (let i = 0; i < 50; i++) {
      const idx = inbox.findIndex((m) => m.type === type);
      if (idx >= 0) return inbox.splice(idx, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('no ' + type);
  };
  return { ws, inbox, next };
}

describe('kayıt ve oturum', () => {
  test('18 yaş onayı, cinsiyet ve güncel koşullar zorunlu', async () => {
    expect((await api('/v1/register', { body: { gender: 'male', termsVersion: '2026-11-11' } })).status).toBe(400);
    expect((await api('/v1/register', { body: { gender: 'x', adultConfirmed: true, termsVersion: '2026-11-11' } })).status).toBe(400);
    expect((await api('/v1/register', { body: { gender: 'male', adultConfirmed: true, termsVersion: '2020-01-01' } })).status).toBe(400);
    const ok = await api('/v1/register', { body: { gender: 'male', adultConfirmed: true, termsVersion: '2026-11-11' } });
    expect(ok.status).toBe(201);
    expect(ok.data.profile.name).toMatch(/^\S.* \S+/);
    expect(ok.data.token.length).toBeGreaterThan(30);
  });

  test('isimler benzersiz', async () => {
    const names = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const r = await api('/v1/register', { body: { gender: i % 2 ? 'male' : 'female', adultConfirmed: true, termsVersion: '2026-11-11' } });
      names.add(r.data.profile.name);
    }
    expect(names.size).toBe(60);
  });

  test('oturumsuz istek reddedilir; profil ve tek yeniden çekme', async () => {
    expect((await api('/v1/me')).status).toBe(401);
    expect((await api('/v1/me', { token: 'yanlis' })).status).toBe(401);
    const u = await user('female');
    const me = await api('/v1/me', { token: u.token });
    expect(me.data.profile.name).toBe(u.name);
    const r1 = await api('/v1/reroll', { token: u.token, body: {} });
    expect(r1.data.profile.name).not.toBe(u.name);
    expect(r1.data.profile.rerolled).toBe(true);
    const r2 = await api('/v1/reroll', { token: u.token, body: {} });
    expect(r2.data.profile.name).toBe(r1.data.profile.name);
  });
});

describe('radar', () => {
  test('yalnızca karşı cins, 1 km içi, taze konum; mesafe yuvarlanır, kesin konum dönmez', async () => {
    const a = await user('male', off(0, 0));
    const b = await user('female', off(60, 50));
    const c = await user('female', off(2000, 0)); // uzak
    const d = await user('male', off(30, 0)); // aynı cins
    const r = await api('/v1/nearby', { token: a.token });
    const ids = r.data.entries.map((e: any) => e.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(c.id);
    expect(ids).not.toContain(d.id);
    const eb = r.data.entries.find((e: any) => e.id === b.id);
    expect(eb.distanceM % 10).toBe(0);
    expect(eb).not.toHaveProperty('lat');
    expect(eb).not.toHaveProperty('lng');
    const rb = await api('/v1/nearby', { token: b.token });
    expect(rb.data.entries.map((e: any) => e.id)).toEqual(expect.arrayContaining([a.id, d.id]));
  });

  test('çevrimdışı olan ve eski konumu olan görünmez', async () => {
    const a = await user('male');
    const b = await user('female', off(100, 0));
    await api('/v1/presence', { token: b.token, body: { offline: true } });
    expect((await api('/v1/nearby', { token: a.token })).data.entries.map((e: any) => e.id)).not.toContain(b.id);
    const hub = hubOf(env);
    const c = await user('female', off(100, 0));
    await hub.setPresence(c.id, { name: c.name, kind: 'fox', color: '#f00', gender: 'female' }, off(100, 0), Date.now() - 10 * 60_000);
    expect((await api('/v1/nearby', { token: a.token })).data.entries.map((e: any) => e.id)).not.toContain(c.id);
  });
});

describe('strike ve oda', () => {
  test('karşılıklı çarpma odayı açar; gelen kutusu anında haber verir; ikisi de meşgul olur', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const inboxA = await openWs('/v1/inbox', a.token);
    await inboxA.next('hello');
    await api('/v1/strike', { token: a.token, body: { targetId: b.id } });
    const nb = await api('/v1/nearby', { token: b.token });
    expect(nb.data.entries.find((e: any) => e.id === a.id).struckMe).toBe(true);
    const s = await api('/v1/strike', { token: b.token, body: { targetId: a.id } });
    expect(s.data.matched).toBe(true);
    const ev = await inboxA.next('match');
    expect(ev.matchId).toBe(s.data.matchId);
    expect((await api('/v1/me', { token: a.token })).data.activeMatchId).toBe(s.data.matchId);
    // meşguller radarda görünmez, başkasıyla çarpışamaz
    const c = await user('female', off(50, 0));
    expect((await api('/v1/nearby', { token: c.token })).data.entries.map((e: any) => e.id)).not.toContain(a.id);
    expect((await api('/v1/strike', { token: c.token, body: { targetId: a.id } })).status).toBe(409);
    inboxA.ws.close();
  });

  test('oda WebSocket: durum, mesajlar ve canlı mesaj', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const id = await match(a, b);
    const wsB = await openWs(`/v1/matches/${id}/ws`, b.token);
    const st = await wsB.next('state');
    expect(st.match.partner.id).toBe(a.id);
    expect(st.match.state).toBe('room');
    expect((await wsB.next('messages')).messages).toEqual([]);
    // oda henüz başlamadı (3,5 sn sayaç)
    expect((await api(`/v1/matches/${id}/messages`, { token: a.token, body: { text: 'erken' } })).status).toBe(409);
    const room = roomOf(env, id);
    const v = await room.view(a.id);
    await room.postMessage(a.id, 'Kenar yenir!', 'text', v.roomStartsAt + 1000);
    const live = await wsB.next('message');
    expect(live.message.text).toBe('Kenar yenir!');
    expect(live.message.from).toBe(a.id);
    // başkası odaya giremez
    const c = await user('female', off(10, 0));
    expect((await api(`/v1/matches/${id}`, { token: c.token })).status).toBe(403);
    const bad = await SELF.fetch(`${BASE}/v1/matches/${id}/ws?token=${c.token}`, { headers: { Upgrade: 'websocket' } });
    expect(bad.status).toBe(403);
    wsB.ws.close();
  });

  test('süre: bitince mesaj yazılamaz; oylama penceresi; ikisi de devam → sonsuz sohbet', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const id = await match(a, b);
    const room = roomOf(env, id);
    const t = await room.view(a.id);
    await expect(room.postMessage(a.id, 'geç', 'text', t.roomEndsAt + 1)).rejects.toThrow(/409/);
    await expect(room.vote(a.id, 'continue', t.roomStartsAt + 1000)).rejects.toThrow(/too-early/);
    await room.vote(a.id, 'continue', t.roomEndsAt + 500);
    expect((await room.view(b.id)).votes.them).toBe('continue');
    await room.vote(b.id, 'continue', t.roomEndsAt + 900);
    const v = await room.view(a.id);
    expect(v.state).toBe('chat');
    await room.postMessage(a.id, 'artık acele yok', 'text', t.roomEndsAt + 10 * 60_000);
    // sohbet sürerken ikisi de meşgul kalır
    expect(await hubOf(env).activeMatch(a.id, Date.now() + 3600_000)).toBe(id);
  });

  test('biri veda ederse oda kapanır ve ikisi serbest kalır', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const id = await match(a, b);
    const room = roomOf(env, id);
    const t = await room.view(a.id);
    await room.vote(a.id, 'leave', t.roomEndsAt + 100);
    const v = await room.view(b.id);
    expect(v.state).toBe('closed');
    expect(v.closedReason).toBe('decision');
    expect(await hubOf(env).activeMatch(a.id)).toBeNull();
  });

  test('kimse oy vermezse alarm odayı kapatır (süre doldu)', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    // süresi geçmiş bir oda kur
    const id = newRoomId(env);
    const room = roomOf(env, id);
    const past = Date.now() - 200_000;
    await room.init({ id, users: [a.id, b.id], profiles: { [a.id]: { name: 'A', kind: 'fox', color: '#000' }, [b.id]: { name: 'B', kind: 'owl', color: '#000' } }, distanceM: 80, roomStartsAt: past, roomEndsAt: past + 90_000, decisionEndsAt: past + 100_000 });
    // Geçmişe kurulan alarm hemen çalışabilir; çalışmadıysa şimdi tetikle.
    await runDurableObjectAlarm(room);
    const v = await room.view(a.id);
    expect(v.state).toBe('closed');
    expect(v.closedReason).toBe('expired');
  });
});

describe('BlitzSnap', () => {
  test('tek hak; yalnızca alıcı açar; açılınca silinir', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const id = await match(a, b);
    const room = roomOf(env, id);
    const t = await room.view(a.id);
    const inRoom = t.roomStartsAt + 2000;
    await expect(room.sendSnap(a.id, 'iVBORw0' + 'A'.repeat(300), inRoom, inRoom)).rejects.toThrow(/not-jpeg/);
    await room.sendSnap(a.id, JPEG, inRoom - 500, inRoom);
    await expect(room.sendSnap(a.id, JPEG, inRoom, inRoom)).rejects.toThrow(/no-snaps-left/);
    const wsB = await openWs(`/v1/matches/${id}/ws`, b.token);
    const snapEv = await wsB.next('snap');
    expect(snapEv.snap).not.toBeNull();
    const sid = snapEv.snap.id as string;
    expect((await api(`/v1/matches/${id}/snaps/${sid}/open`, { token: a.token, body: {} })).status).toBe(403);
    const opened = await api(`/v1/matches/${id}/snaps/${sid}/open`, { token: b.token, body: {} });
    expect(opened.status).toBe(200);
    expect(opened.data.imageBase64).toBe(JPEG);
    expect((await api(`/v1/matches/${id}/snaps/${sid}/open`, { token: b.token, body: {} })).status).toBe(410);
    wsB.ws.close();
  });
});

describe('güvenlik', () => {
  test('engelleme odayı kapatır ve iki taraf birbirini bir daha görmez', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const id = await match(a, b);
    expect((await api('/v1/block', { token: a.token, body: { userId: b.id } })).status).toBe(200);
    const v = await roomOf(env, id).view(b.id);
    expect(v.state).toBe('closed');
    expect(v.closedReason).toBe('blocked');
    expect((await api('/v1/nearby', { token: a.token })).data.entries.map((e: any) => e.id)).not.toContain(b.id);
    expect((await api('/v1/nearby', { token: b.token })).data.entries.map((e: any) => e.id)).not.toContain(a.id);
    expect((await api('/v1/strike', { token: b.token, body: { targetId: a.id } })).status).toBe(409);
  });

  test('şikayet kaydedilir, kişi engellenir', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const id = await match(a, b);
    expect((await api('/v1/report', { token: b.token, body: { userId: a.id, matchId: id, reason: 'nope' } })).status).toBe(400);
    expect((await api('/v1/report', { token: b.token, body: { userId: a.id, matchId: id, reason: 'harassment' } })).status).toBe(200);
    const row = await env.DB.prepare('SELECT reason, status FROM reports WHERE target = ?').bind(a.id).first<{ reason: string; status: string }>();
    expect(row).toEqual({ reason: 'harassment', status: 'open' });
    expect((await roomOf(env, id).view(a.id)).closedReason).toBe('reported');
  });

  test('kibar veda mesajı gider, oda kapanır', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const id = await match(a, b);
    const room = roomOf(env, id);
    const t = await room.view(a.id);
    await room.vote(a.id, 'continue', t.roomEndsAt + 100);
    await room.vote(b.id, 'continue', t.roomEndsAt + 200);
    expect((await api(`/v1/matches/${id}/farewell`, { token: a.token, body: { text: 'Bol şans!' } })).status).toBe(200);
    const v = await room.view(b.id);
    expect(v.state).toBe('closed');
    expect(v.closedReason).toBe('farewell');
    expect(v.closedByMe).toBe(false);
  });

  test('hesap silme: oturum geçersiz olur, isim serbest kalır, aktif oda kapanır', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const id = await match(a, b);
    expect((await api('/v1/me', { token: a.token, method: 'DELETE' })).status).toBe(200);
    expect((await api('/v1/me', { token: a.token })).status).toBe(401);
    expect(await env.DB.prepare('SELECT COUNT(*) AS c FROM users WHERE name = ?').bind(a.name).first('c')).toBe(0);
    const v = await roomOf(env, id).view(b.id);
    expect(v.closedReason).toBe('left');
  });

  test('kafeler yalnızca sonsuz sohbette istenebilir', async () => {
    const a = await user('male');
    const b = await user('female', off(80, 0));
    const id = await match(a, b);
    const r = await api(`/v1/matches/${id}/cafes`, { token: a.token });
    expect(r.status).toBe(200);
    expect(r.data.cafes).toEqual([]);
  });
});
