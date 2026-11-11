/**
 * CANLI SUNUCU — Firebase (Auth anonim, Firestore, Cloud Functions europe-west1).
 * Ayarlar EXPO_PUBLIC_FIREBASE_* ortam değişkenlerinden gelir (derlemede gömülür).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type User,
} from '@firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { geohashForLocation } from 'geofire-common';
import type { AnimalIdentity, AnimalKind } from '../logic/names';
import type { Gender, GeoPoint } from '../logic/radar';
import type { CafeSuggestion } from '../logic/meet';
import type { Backend, ChatMessage, IncomingSnap, MatchView, Profile, RadarEntry, ReportReason, Unsubscribe } from './types';
export { friendlyError } from './errors';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  storageBucket?: string;
}

export function firebaseConfigFromEnv(): FirebaseConfig | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    projectId,
    appId,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };
}

const ms = (t: unknown): number => (t instanceof Timestamp ? t.toMillis() : typeof t === 'number' ? t : 0);

function identityOf(p: { name?: string; kind?: string; color?: string } | undefined): AnimalIdentity {
  return { name: p?.name ?? 'Anonim', kind: (p?.kind as AnimalKind) ?? 'fox', color: p?.color ?? '#FF5C8A' };
}

export class LiveBackend implements Backend {
  readonly mode = 'live' as const;
  private app: FirebaseApp;
  private auth: Auth;
  private db: Firestore;
  private fns: Functions;
  /** sunucu saati − cihaz saati (ms); süreler sunucuya göre hesaplanır */
  private clockOffset = 0;
  private closedSeen = new Set<string>();
  private gender: Gender | null = null;

  constructor(config: FirebaseConfig) {
    this.app = getApps()[0] ?? initializeApp(config);
    this.auth = initializeAuth(this.app, { persistence: getReactNativePersistence(AsyncStorage) });
    this.db = initializeFirestore(this.app, { experimentalAutoDetectLongPolling: true });
    this.fns = getFunctions(this.app, 'europe-west1');
  }

  private call<T>(name: string, data: unknown = {}): Promise<T> {
    return httpsCallable(this.fns, name)(data).then((r) => r.data as T);
  }

  private get uid(): string {
    const u = this.auth.currentUser;
    if (!u) throw new Error('Oturum yok');
    return u.uid;
  }

  private syncClock(serverNow: number | undefined) {
    if (typeof serverNow === 'number') this.clockOffset = serverNow - Date.now();
  }
  /** Sunucu zamanını cihaz zamanına çevirir */
  private local(t: unknown): number {
    return ms(t) - this.clockOffset;
  }

  private waitForAuth(): Promise<User | null> {
    return new Promise((resolve) => {
      const unsub = onAuthStateChanged(this.auth, (u) => {
        unsub();
        resolve(u);
      });
    });
  }

  private toProfile(p: { uid: string; name: string; kind: string; color: string; gender: Gender; rerolled: boolean }): Profile {
    this.gender = p.gender;
    return { uid: p.uid, identity: identityOf(p), gender: p.gender, rerolled: !!p.rerolled };
  }

  async restore(): Promise<Profile | null> {
    const user = this.auth.currentUser ?? (await this.waitForAuth());
    if (!user) return null;
    const snap = await getDoc(doc(this.db, 'users', user.uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return this.toProfile({ uid: user.uid, name: d.name, kind: d.kind, color: d.color, gender: d.gender, rerolled: d.rerolled });
  }

  async register(input: { gender: Gender; adultConfirmed: true; termsVersion: string }): Promise<Profile> {
    if (!this.auth.currentUser) await signInAnonymously(this.auth);
    const p = await this.call<{ uid: string; name: string; kind: string; color: string; gender: Gender; rerolled: boolean }>('register', input);
    return this.toProfile(p);
  }

  async reroll(): Promise<Profile> {
    const p = await this.call<{ uid: string; name: string; kind: string; color: string; gender: Gender; rerolled: boolean }>('reroll');
    return this.toProfile(p);
  }

  async updatePresence(location: GeoPoint | null): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || !this.gender) return;
    const ref = doc(this.db, 'presence', user.uid);
    if (!location) {
      await deleteDoc(ref).catch(() => {});
      return;
    }
    await setDoc(ref, {
      lat: location.lat,
      lng: location.lng,
      geohash: geohashForLocation([location.lat, location.lng], 9),
      gender: this.gender,
      updatedAt: serverTimestamp(),
    });
  }

  async nearby(): Promise<RadarEntry[]> {
    const r = await this.call<{
      entries: { id: string; name: string; kind: string; color: string; distanceM: number; struckMe: boolean }[];
      serverNow: number;
    }>('nearby');
    this.syncClock(r.serverNow);
    return r.entries.map((e) => ({ id: e.id, identity: identityOf(e), distanceM: e.distanceM, struckMe: e.struckMe }));
  }

  async strike(targetId: string): Promise<{ matched: boolean }> {
    const r = await this.call<{ matched: boolean; serverNow: number }>('strike', { targetId });
    this.syncClock(r.serverNow);
    return { matched: r.matched };
  }

  private toView(id: string, d: DocumentData): MatchView {
    const me = this.uid;
    const users = (d.users ?? []) as string[];
    const other = users.find((u) => u !== me) ?? '';
    const votes = (d.votes ?? {}) as Record<string, 'continue' | 'leave'>;
    return {
      id,
      partner: { id: other, identity: identityOf(d.profiles?.[other]) },
      distanceM: d.distanceM ?? 0,
      state: d.state,
      roomStartsAt: this.local(d.roomStartsAt),
      roomEndsAt: this.local(d.roomEndsAt),
      decisionEndsAt: this.local(d.decisionEndsAt),
      votes: { me: votes[me] ?? null, them: votes[other] ?? null },
      snapsSentByMe: (d.snapsSent ?? {})[me] ?? 0,
      meetEligible: (d.distanceM ?? 0) <= 2000,
      closedReason: d.closedReason ?? null,
      closedByMe: d.closedBy === me,
    };
  }

  onActiveMatch(cb: (m: MatchView | null) => void): Unsubscribe {
    let currentId: string | null = null;
    const q = query(collection(this.db, 'matches'), where('users', 'array-contains', this.uid), where('state', 'in', ['room', 'chat']));
    return onSnapshot(
      q,
      async (snap) => {
        const docs = snap.docs.filter((d) => !this.closedSeen.has(d.id)).sort((a, b) => ms(b.get('roomStartsAt')) - ms(a.get('roomStartsAt')));
        const top = docs[0];
        if (top) {
          currentId = top.id;
          cb(this.toView(top.id, top.data()));
          return;
        }
        if (currentId) {
          // Oda listeden düştü: kapanış nedenini öğrenmek için belgeyi bir kez oku.
          const id = currentId;
          currentId = null;
          this.closedSeen.add(id);
          const closed = await getDoc(doc(this.db, 'matches', id)).catch(() => null);
          if (closed?.exists()) cb({ ...this.toView(id, closed.data()), state: 'closed' });
          else cb(null);
          return;
        }
        cb(null);
      },
      () => cb(null),
    );
  }

  onMessages(matchId: string, cb: (msgs: ChatMessage[]) => void): Unsubscribe {
    const me = this.uid;
    const q = query(collection(this.db, 'matches', matchId, 'messages'), orderBy('at'));
    return onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
      cb(
        snap.docs.map((d) => {
          const x = d.data({ serverTimestamps: 'estimate' });
          const from: ChatMessage['from'] = x.from === 'system' ? 'system' : x.from === me ? 'me' : 'them';
          return { id: d.id, from, kind: x.kind, text: x.text, at: ms(x.at) || Date.now() };
        }),
      );
    });
  }

  async sendMessage(matchId: string, text: string, kind: 'text' | 'icebreaker' | 'meet' = 'text'): Promise<void> {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!clean) return;
    await addDoc(collection(this.db, 'matches', matchId, 'messages'), { from: this.uid, kind, text: clean, at: serverTimestamp() });
  }

  async vote(matchId: string, vote: 'continue' | 'leave'): Promise<void> {
    await this.call('vote', { matchId, vote });
  }

  async sendSnap(matchId: string, jpegBase64: string, capturedAt: number): Promise<void> {
    await this.call('sendSnap', { matchId, imageBase64: jpegBase64, capturedAt: capturedAt + this.clockOffset });
  }

  onIncomingSnap(matchId: string, cb: (s: IncomingSnap | null) => void): Unsubscribe {
    const q = query(collection(this.db, 'matches', matchId, 'snaps'), where('to', '==', this.uid), where('state', '==', 'sealed'));
    return onSnapshot(
      q,
      (snap) => {
        const d = snap.docs[0];
        cb(d ? { id: d.id, capturedAt: this.local(d.get('capturedAt')) } : null);
      },
      () => cb(null),
    );
  }

  async openSnap(matchId: string, snapId: string) {
    const r = await this.call<{ imageBase64: string; capturedAt: number }>('openSnap', { matchId, snapId });
    return { dataUri: `data:image/jpeg;base64,${r.imageBase64}`, capturedAt: r.capturedAt - this.clockOffset };
  }

  async meetSuggestions(matchId: string): Promise<CafeSuggestion[]> {
    const r = await this.call<{ cafes: CafeSuggestion[] }>('meetSuggestions', { matchId });
    return r.cafes;
  }

  async farewell(matchId: string, text: string): Promise<void> {
    await this.call('farewell', { matchId, text });
  }

  async report(input: { userId: string; matchId?: string; reason: ReportReason; note?: string }): Promise<void> {
    await this.call('report', input);
  }

  async block(userId: string): Promise<void> {
    await this.call('block', { userId });
  }

  async deleteAccount(): Promise<void> {
    await this.updatePresence(null);
    await this.call('deleteAccount');
    await this.auth.signOut();
    this.gender = null;
  }
}
