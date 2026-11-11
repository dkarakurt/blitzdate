/**
 * Fink sunucusu — Cloud Functions (2. nesil), bölge europe-west1.
 * İstemci yalnızca kendi konumunu ve mesajlarını yazar; eşleşme, süreler, oylar,
 * snap'ler, engelleme ve şikayet burada, sunucu otoritesiyle yürür.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { distanceBetween, geohashQueryBounds } from 'geofire-common';
import {
  applyVote,
  cafesFromOverpass,
  candidateName,
  canWrite,
  checkSnap,
  cleanText,
  CLOSED_MATCH_RETENTION_MS,
  filterNearby,
  isActive,
  isFresh,
  isGender,
  matchTimes,
  MEET_MAX_DISTANCE_M,
  overpassQuery,
  RADAR_RADIUS_M,
  REPORT_REASONS,
  roundDistance,
  STRIKE_TTL_MS,
  UNOPENED_SNAP_TTL_MS,
  VOTE_GRACE_MS,
  type Candidate,
  type MatchState,
  type MatchTimes,
  type Vote,
} from './core';
import { midpoint } from './shared/meet';

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const FAR_FUTURE = Timestamp.fromMillis(Date.UTC(2100, 0, 1));
const TERMS_VERSION_MIN = '2026-11-11';

type ClosedReason = 'decision' | 'farewell' | 'blocked' | 'reported' | 'expired' | 'left';

function uidOf(req: CallableRequest<unknown>): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Oturum gerekli');
  return uid;
}

function str(x: unknown, max = 128): string {
  if (typeof x !== 'string' || !x || x.length > max) throw new HttpsError('invalid-argument', 'Geçersiz değer');
  return x;
}

const ms = (t: Timestamp | null | undefined) => (t ? t.toMillis() : 0);

function timesOf(d: FirebaseFirestore.DocumentData): MatchTimes {
  return { roomStartsAt: ms(d.roomStartsAt), roomEndsAt: ms(d.roomEndsAt), decisionEndsAt: ms(d.decisionEndsAt) };
}

async function blockedSet(uid: string): Promise<Set<string>> {
  const [mine, theirs] = await Promise.all([
    db.collection('blocks').where('by', '==', uid).get(),
    db.collection('blocks').where('target', '==', uid).get(),
  ]);
  const s = new Set<string>();
  mine.docs.forEach((d) => s.add(d.get('target')));
  theirs.docs.forEach((d) => s.add(d.get('by')));
  return s;
}

function isBusy(user: DocumentSnapshot, now: number): boolean {
  const until = user.get('busyUntil') as Timestamp | undefined;
  return !!until && until.toMillis() > now;
}

function profileOf(user: DocumentSnapshot) {
  return { name: user.get('name') as string, kind: user.get('kind') as string, color: user.get('color') as string };
}

/** Bir işlem içinde eşleşmeyi kapatır; kullanıcıların "meşgul" işaretini kaldırır. */
function closeInTx(
  tx: Transaction,
  matchRef: DocumentReference,
  users: DocumentSnapshot[],
  reason: ClosedReason,
  by: string | null,
) {
  tx.update(matchRef, { state: 'closed', closedReason: reason, closedBy: by, closedAt: Timestamp.now() });
  for (const u of users) {
    if (u.exists && u.get('activeMatchId') === matchRef.id) {
      tx.update(u.ref, { activeMatchId: FieldValue.delete(), busyUntil: FieldValue.delete() });
    }
  }
}

function systemMessage(tx: Transaction, matchRef: DocumentReference, text: string) {
  tx.set(matchRef.collection('messages').doc(), { from: 'system', kind: 'system', text, at: FieldValue.serverTimestamp() });
}

// ───────────────────────── Kayıt ve kimlik ─────────────────────────

export const register = onCall(async (req) => {
  const uid = uidOf(req);
  const data = (req.data ?? {}) as { gender?: unknown; adultConfirmed?: unknown; termsVersion?: unknown };
  if (!isGender(data.gender)) throw new HttpsError('invalid-argument', 'Cinsiyet gerekli');
  if (data.adultConfirmed !== true) throw new HttpsError('failed-precondition', '18 yaş onayı gerekli');
  if (typeof data.termsVersion !== 'string' || data.termsVersion < TERMS_VERSION_MIN) {
    throw new HttpsError('failed-precondition', 'Güncel koşullar kabul edilmeli');
  }
  const userRef = db.doc(`users/${uid}`);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(userRef);
    if (existing.exists) return { uid, ...profileOf(existing), gender: existing.get('gender'), rerolled: !!existing.get('rerolled') };
    for (let attempt = 0; attempt < 40; attempt++) {
      const id = candidateName(Math.random, attempt);
      const nameRef = db.doc(`names/${id.name}`);
      if ((await tx.get(nameRef)).exists) continue;
      tx.create(nameRef, { uid });
      tx.create(userRef, {
        ...id,
        gender: data.gender,
        rerolled: false,
        adultConfirmedAt: FieldValue.serverTimestamp(),
        termsVersion: data.termsVersion,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { uid, ...id, gender: data.gender, rerolled: false };
    }
    throw new HttpsError('resource-exhausted', 'Şu an isim atanamadı, tekrar dene');
  });
});

export const reroll = onCall(async (req) => {
  const uid = uidOf(req);
  const userRef = db.doc(`users/${uid}`);
  return db.runTransaction(async (tx) => {
    const user = await tx.get(userRef);
    if (!user.exists) throw new HttpsError('failed-precondition', 'Kayıt yok');
    if (user.get('rerolled')) return { uid, ...profileOf(user), gender: user.get('gender'), rerolled: true };
    for (let attempt = 0; attempt < 40; attempt++) {
      const id = candidateName(Math.random, attempt);
      const nameRef = db.doc(`names/${id.name}`);
      if ((await tx.get(nameRef)).exists) continue;
      tx.create(nameRef, { uid });
      tx.delete(db.doc(`names/${user.get('name')}`));
      tx.update(userRef, { ...id, rerolled: true });
      return { uid, ...id, gender: user.get('gender'), rerolled: true };
    }
    throw new HttpsError('resource-exhausted', 'Şu an isim atanamadı, tekrar dene');
  });
});

// ───────────────────────── Radar ve Strike ─────────────────────────

async function candidatesAround(lat: number, lng: number): Promise<Candidate[]> {
  const bounds = geohashQueryBounds([lat, lng], RADAR_RADIUS_M);
  const snaps = await Promise.all(
    bounds.map(([s, e]) => db.collection('presence').orderBy('geohash').startAt(s).endAt(e).limit(300).get()),
  );
  const seen = new Map<string, Candidate>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const g = d.get('gender');
      if (!isGender(g)) continue;
      seen.set(d.id, { uid: d.id, gender: g, location: { lat: d.get('lat'), lng: d.get('lng') }, updatedAt: ms(d.get('updatedAt')) });
    }
  }
  return [...seen.values()];
}

export const nearby = onCall(async (req) => {
  const uid = uidOf(req);
  const now = Date.now();
  const [me, pres] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`presence/${uid}`).get()]);
  if (!me.exists) throw new HttpsError('failed-precondition', 'Kayıt yok');
  if (!pres.exists || !isFresh(ms(pres.get('updatedAt')), now)) return { entries: [], needLocation: true, serverNow: now };
  const location = { lat: pres.get('lat') as number, lng: pres.get('lng') as number };
  const [candidates, blocked] = await Promise.all([candidatesAround(location.lat, location.lng), blockedSet(uid)]);
  const hits = filterNearby({ uid, gender: me.get('gender'), location }, candidates, blocked, now).slice(0, 30);
  if (hits.length === 0) return { entries: [], needLocation: false, serverNow: now };
  const [users, strikes] = await Promise.all([
    db.getAll(...hits.map((h) => db.doc(`users/${h.uid}`))),
    db.collection('strikes').where('to', '==', uid).where('at', '>=', Timestamp.fromMillis(now - STRIKE_TTL_MS)).get(),
  ]);
  const struck = new Set(strikes.docs.map((d) => d.get('from') as string));
  const byId = new Map(users.map((u) => [u.id, u]));
  const entries = hits
    .filter((h) => {
      const u = byId.get(h.uid);
      return u?.exists && !isBusy(u, now);
    })
    .map((h) => ({ id: h.uid, ...profileOf(byId.get(h.uid)!), distanceM: roundDistance(h.distanceM), struckMe: struck.has(h.uid) }));
  return { entries, needLocation: false, serverNow: now };
});

export const strike = onCall(async (req) => {
  const uid = uidOf(req);
  const target = str((req.data as { targetId?: unknown })?.targetId);
  if (target === uid) throw new HttpsError('invalid-argument', 'Kendine çarpamazsın');
  const now = Date.now();
  const [me, other, myPres, otherPres, blocked] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`users/${target}`).get(),
    db.doc(`presence/${uid}`).get(),
    db.doc(`presence/${target}`).get(),
    blockedSet(uid),
  ]);
  if (!me.exists || !other.exists) throw new HttpsError('not-found', 'Kişi bulunamadı');
  if (blocked.has(target)) throw new HttpsError('permission-denied', 'Bu kişi artık uygun değil');
  if (me.get('gender') === other.get('gender')) throw new HttpsError('permission-denied', 'Bu kişi artık uygun değil');
  if (!myPres.exists || !otherPres.exists || !isFresh(ms(myPres.get('updatedAt')), now) || !isFresh(ms(otherPres.get('updatedAt')), now)) {
    throw new HttpsError('failed-precondition', 'Konum güncel değil');
  }
  const d = distanceBetween([myPres.get('lat'), myPres.get('lng')], [otherPres.get('lat'), otherPres.get('lng')]) * 1000;
  if (d > RADAR_RADIUS_M) throw new HttpsError('failed-precondition', 'Bu kişi artık yakında değil');
  if (isBusy(me, now) || isBusy(other, now)) throw new HttpsError('failed-precondition', 'Şu an başka bir odada');

  await db.doc(`strikes/${uid}_${target}`).set({ from: uid, to: target, at: Timestamp.fromMillis(now) });
  const reverseRef = db.doc(`strikes/${target}_${uid}`);

  const matched = await db.runTransaction(async (tx) => {
    const [reverse, meTx, otherTx] = await Promise.all([tx.get(reverseRef), tx.get(me.ref), tx.get(other.ref)]);
    if (!reverse.exists || now - ms(reverse.get('at')) > STRIKE_TTL_MS) return false;
    if (isBusy(meTx, now) || isBusy(otherTx, now)) return false;
    const t = matchTimes(now);
    const matchRef = db.collection('matches').doc();
    tx.create(matchRef, {
      users: [uid, target],
      profiles: { [uid]: profileOf(meTx), [target]: profileOf(otherTx) },
      state: 'room',
      roomStartsAt: Timestamp.fromMillis(t.roomStartsAt),
      roomEndsAt: Timestamp.fromMillis(t.roomEndsAt),
      decisionEndsAt: Timestamp.fromMillis(t.decisionEndsAt),
      votes: {},
      snapsSent: {},
      distanceM: roundDistance(d),
      closedReason: null,
      closedBy: null,
      closedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    const busyUntil = Timestamp.fromMillis(t.decisionEndsAt + VOTE_GRACE_MS);
    tx.update(meTx.ref, { activeMatchId: matchRef.id, busyUntil });
    tx.update(otherTx.ref, { activeMatchId: matchRef.id, busyUntil });
    tx.delete(reverseRef);
    tx.delete(db.doc(`strikes/${uid}_${target}`));
    return true;
  });
  return { matched, serverNow: now };
});

// ───────────────────────── Oda, karar, snap ─────────────────────────

async function participantMatch(tx: Transaction, uid: string, matchId: string) {
  const ref = db.doc(`matches/${matchId}`);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new HttpsError('not-found', 'Oda bulunamadı');
  const users = snap.get('users') as [string, string];
  if (!users.includes(uid)) throw new HttpsError('permission-denied', 'Bu odaya erişimin yok');
  return { ref, snap, users };
}

export const vote = onCall(async (req) => {
  const uid = uidOf(req);
  const data = (req.data ?? {}) as { matchId?: unknown; vote?: unknown };
  const matchId = str(data.matchId);
  if (data.vote !== 'continue' && data.vote !== 'leave') throw new HttpsError('invalid-argument', 'Geçersiz oy');
  const v = data.vote as Vote;
  await db.runTransaction(async (tx) => {
    const { ref, snap, users } = await participantMatch(tx, uid, matchId);
    const userDocs = await Promise.all(users.map((u) => tx.get(db.doc(`users/${u}`))));
    const result = applyVote(snap.get('state') as MatchState, timesOf(snap.data()!), users, snap.get('votes') ?? {}, uid, v, Date.now());
    if (result.kind === 'rejected') throw new HttpsError('failed-precondition', 'Şu an oy verilemez');
    if (result.kind === 'closed') {
      tx.update(ref, { votes: result.votes });
      closeInTx(tx, ref, userDocs, 'decision', v === 'leave' ? uid : null);
    } else if (result.kind === 'chat') {
      tx.update(ref, { votes: result.votes, state: 'chat' });
      for (const u of userDocs) if (u.exists) tx.update(u.ref, { busyUntil: FAR_FUTURE });
      systemMessage(tx, ref, 'İkiniz de Devam dediniz. Artık süre yok.');
    } else {
      tx.update(ref, { votes: result.votes });
    }
  });
  return { ok: true };
});

export const sendSnap = onCall(async (req) => {
  const uid = uidOf(req);
  const data = (req.data ?? {}) as { matchId?: unknown; imageBase64?: unknown; capturedAt?: unknown };
  const matchId = str(data.matchId);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const { ref, snap, users } = await participantMatch(tx, uid, matchId);
    if (!canWrite(snap.get('state'), timesOf(snap.data()!), now)) throw new HttpsError('failed-precondition', 'Şu an gönderilemez');
    const sent = (snap.get('snapsSent') ?? {})[uid] ?? 0;
    const check = checkSnap(sent, data.imageBase64, data.capturedAt, now);
    if (!check.ok) throw new HttpsError('failed-precondition', check.reason);
    const to = users.find((u) => u !== uid)!;
    const metaRef = ref.collection('snaps').doc();
    tx.create(db.doc(`snapData/${metaRef.id}`), { data: data.imageBase64, matchId, createdAt: Timestamp.fromMillis(now) });
    tx.create(metaRef, { from: uid, to, capturedAt: Timestamp.fromMillis(Math.min(now, data.capturedAt as number)), state: 'sealed', createdAt: Timestamp.fromMillis(now) });
    tx.update(ref, { [`snapsSent.${uid}`]: FieldValue.increment(1) });
    const name = (snap.get('profiles') ?? {})[uid]?.name ?? 'Biri';
    systemMessage(tx, ref, `${name} BlitzSnap kozunu oynadı.`);
  });
  return { ok: true };
});

export const openSnap = onCall(async (req) => {
  const uid = uidOf(req);
  const data = (req.data ?? {}) as { matchId?: unknown; snapId?: unknown };
  const matchId = str(data.matchId);
  const snapId = str(data.snapId);
  return db.runTransaction(async (tx) => {
    const metaRef = db.doc(`matches/${matchId}/snaps/${snapId}`);
    const dataRef = db.doc(`snapData/${snapId}`);
    const [meta, payload] = await Promise.all([tx.get(metaRef), tx.get(dataRef)]);
    if (!meta.exists || meta.get('to') !== uid) throw new HttpsError('permission-denied', 'Bu snap sana ait değil');
    if (meta.get('state') !== 'sealed' || !payload.exists) throw new HttpsError('not-found', 'Bu snap artık yok');
    // Açıldığı an sunucudan silinir; istemci 5 saniye gösterir.
    tx.update(metaRef, { state: 'opened', openedAt: FieldValue.serverTimestamp() });
    tx.delete(dataRef);
    return { imageBase64: payload.get('data') as string, capturedAt: ms(meta.get('capturedAt')) };
  });
});

// ───────────────────────── BlitzMeet ─────────────────────────

export const meetSuggestions = onCall({ timeoutSeconds: 20 }, async (req) => {
  const uid = uidOf(req);
  const matchId = str((req.data as { matchId?: unknown })?.matchId);
  const match = await db.doc(`matches/${matchId}`).get();
  const users = (match.get('users') ?? []) as string[];
  if (!match.exists || !users.includes(uid)) throw new HttpsError('permission-denied', 'Bu odaya erişimin yok');
  if (match.get('state') !== 'chat') return { cafes: [] };
  const now = Date.now();
  const other = users.find((u) => u !== uid)!;
  const [a, b] = await Promise.all([db.doc(`presence/${uid}`).get(), db.doc(`presence/${other}`).get()]);
  if (!a.exists || !b.exists || !isFresh(ms(a.get('updatedAt')), now) || !isFresh(ms(b.get('updatedAt')), now)) return { cafes: [] };
  const pa = { lat: a.get('lat'), lng: a.get('lng') };
  const pb = { lat: b.get('lat'), lng: b.get('lng') };
  if (distanceBetween([pa.lat, pa.lng], [pb.lat, pb.lng]) * 1000 > MEET_MAX_DISTANCE_M) return { cafes: [] };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Fink/0.2 (cafe suggestions)' },
      body: 'data=' + encodeURIComponent(overpassQuery(midpoint(pa, pb))),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const json = (await res.json()) as { elements?: Parameters<typeof cafesFromOverpass>[2] };
    const cafes = cafesFromOverpass(pa, pb, json.elements ?? []).map((c) => ({
      venue: { id: c.venue.id, name: c.venue.name, kind: 'cafe', location: c.venue.location, isPublic: true, tags: c.venue.tags },
      toA: roundDistance(c.toA),
      toB: roundDistance(c.toB),
    }));
    return { cafes };
  } catch (e) {
    logger.warn('meetSuggestions failed', e);
    throw new HttpsError('unavailable', 'Kafe bilgisi şu an alınamadı');
  } finally {
    clearTimeout(timer);
  }
});

// ───────────────────────── Veda, engelle, şikayet ─────────────────────────

export const farewell = onCall(async (req) => {
  const uid = uidOf(req);
  const data = (req.data ?? {}) as { matchId?: unknown; text?: unknown };
  const matchId = str(data.matchId);
  const text = cleanText(data.text);
  if (!text) throw new HttpsError('invalid-argument', 'Mesaj gerekli');
  await db.runTransaction(async (tx) => {
    const { ref, snap, users } = await participantMatch(tx, uid, matchId);
    const userDocs = await Promise.all(users.map((u) => tx.get(db.doc(`users/${u}`))));
    if (!isActive(snap.get('state'), timesOf(snap.data()!), Date.now())) return;
    tx.set(ref.collection('messages').doc(), { from: uid, kind: 'farewell', text, at: FieldValue.serverTimestamp() });
    closeInTx(tx, ref, userDocs, 'farewell', uid);
  });
  return { ok: true };
});

async function blockAndClose(uid: string, target: string, reason: 'blocked' | 'reported') {
  await db.doc(`blocks/${uid}_${target}`).set({ by: uid, target, at: FieldValue.serverTimestamp() });
  const me = await db.doc(`users/${uid}`).get();
  const matchId = me.get('activeMatchId') as string | undefined;
  if (!matchId) return;
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`matches/${matchId}`);
    const snap = await tx.get(ref);
    const users = (snap.get('users') ?? []) as string[];
    if (!snap.exists || !users.includes(target) || snap.get('state') === 'closed') return;
    const userDocs = await Promise.all(users.map((u) => tx.get(db.doc(`users/${u}`))));
    closeInTx(tx, ref, userDocs, reason, uid);
  });
}

export const block = onCall(async (req) => {
  const uid = uidOf(req);
  const target = str((req.data as { userId?: unknown })?.userId);
  if (target === uid) throw new HttpsError('invalid-argument', 'Geçersiz');
  await blockAndClose(uid, target, 'blocked');
  return { ok: true };
});

export const report = onCall(async (req) => {
  const uid = uidOf(req);
  const data = (req.data ?? {}) as { userId?: unknown; matchId?: unknown; reason?: unknown; note?: unknown };
  const target = str(data.userId);
  if (target === uid) throw new HttpsError('invalid-argument', 'Geçersiz');
  if (!REPORT_REASONS.includes(data.reason as (typeof REPORT_REASONS)[number])) throw new HttpsError('invalid-argument', 'Geçersiz neden');
  await db.collection('reports').add({
    by: uid,
    target,
    matchId: typeof data.matchId === 'string' ? data.matchId : null,
    reason: data.reason,
    note: typeof data.note === 'string' ? data.note.slice(0, 500) : null,
    status: 'open',
    at: FieldValue.serverTimestamp(),
  });
  await blockAndClose(uid, target, 'reported');
  return { ok: true };
});

// ───────────────────────── Hesabı sil (KVKK / Play) ─────────────────────────

export const deleteAccount = onCall(async (req) => {
  const uid = uidOf(req);
  const userRef = db.doc(`users/${uid}`);
  const user = await userRef.get();
  const matchId = user.get('activeMatchId') as string | undefined;
  if (matchId) {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`matches/${matchId}`);
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get('state') === 'closed') return;
      const users = (snap.get('users') ?? []) as string[];
      const userDocs = await Promise.all(users.map((u) => tx.get(db.doc(`users/${u}`))));
      closeInTx(tx, ref, userDocs, 'left', uid);
    });
  }
  const batch = db.batch();
  const [strFrom, strTo, blocksBy] = await Promise.all([
    db.collection('strikes').where('from', '==', uid).get(),
    db.collection('strikes').where('to', '==', uid).get(),
    db.collection('blocks').where('by', '==', uid).get(),
  ]);
  [...strFrom.docs, ...strTo.docs, ...blocksBy.docs].forEach((d) => batch.delete(d.ref));
  batch.delete(db.doc(`presence/${uid}`));
  if (user.exists) batch.delete(db.doc(`names/${user.get('name')}`));
  batch.delete(userRef);
  await batch.commit();
  await getAuth().deleteUser(uid).catch((e) => logger.warn('auth delete failed', e));
  return { ok: true };
});

// ───────────────────────── Zamanlanmış temizlik ─────────────────────────

export const cleanup = onSchedule({ schedule: 'every 10 minutes', timeZone: 'Europe/Istanbul' }, async () => {
  const now = Date.now();
  // Süresi geçmiş odalar
  const expired = await db
    .collection('matches')
    .where('state', '==', 'room')
    .where('decisionEndsAt', '<', Timestamp.fromMillis(now - VOTE_GRACE_MS - 5000))
    .limit(200)
    .get();
  for (const m of expired.docs) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(m.ref);
      if (snap.get('state') !== 'room') return;
      const userDocs = await Promise.all((snap.get('users') as string[]).map((u) => tx.get(db.doc(`users/${u}`))));
      closeInTx(tx, m.ref, userDocs, 'expired', null);
    });
  }
  // Eski konumlar ve çarpmalar
  const [oldPresence, oldStrikes] = await Promise.all([
    db.collection('presence').where('updatedAt', '<', Timestamp.fromMillis(now - 15 * 60_000)).limit(400).get(),
    db.collection('strikes').where('at', '<', Timestamp.fromMillis(now - STRIKE_TTL_MS)).limit(400).get(),
  ]);
  const batch = db.batch();
  [...oldPresence.docs, ...oldStrikes.docs].forEach((d) => batch.delete(d.ref));
  await batch.commit();
  // Açılmamış snap'ler 24 saat sonra silinir
  const stale = await db
    .collectionGroup('snaps')
    .where('state', '==', 'sealed')
    .where('createdAt', '<', Timestamp.fromMillis(now - UNOPENED_SNAP_TTL_MS))
    .limit(200)
    .get();
  const b2 = db.batch();
  stale.docs.forEach((d) => {
    b2.update(d.ref, { state: 'expired' });
    b2.delete(db.doc(`snapData/${d.id}`));
  });
  await b2.commit();
  // Kapanmış odalar 30 gün sonra tüm mesajlarıyla silinir (saklama süresi)
  const old = await db
    .collection('matches')
    .where('state', '==', 'closed')
    .where('closedAt', '<', Timestamp.fromMillis(now - CLOSED_MATCH_RETENTION_MS))
    .limit(50)
    .get();
  for (const m of old.docs) await db.recursiveDelete(m.ref);
  logger.info('cleanup', { expired: expired.size, presence: oldPresence.size, strikes: oldStrikes.size, snaps: stale.size, purged: old.size });
});
