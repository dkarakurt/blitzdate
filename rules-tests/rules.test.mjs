// Firestore güvenlik kuralları testleri — Firestore emülatörüyle çalışır (CI'da).
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fink',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => env?.cleanup());

const now = () => Date.now();

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { name: 'Cesur Vaşak', kind: 'lynx', color: '#FFFF00', gender: 'male' });
    await setDoc(doc(db, 'users/bea'), { name: 'Uykucu Tilki', kind: 'fox', color: '#FF5C8A', gender: 'female' });
    await setDoc(doc(db, 'presence/bea'), { lat: 41, lng: 29, geohash: 'sxk9xyz', gender: 'female', updatedAt: Timestamp.now() });
    const t = now();
    await setDoc(doc(db, 'matches/room1'), {
      users: ['alice', 'bea'], state: 'room',
      roomStartsAt: Timestamp.fromMillis(t - 10_000), roomEndsAt: Timestamp.fromMillis(t + 60_000), decisionEndsAt: Timestamp.fromMillis(t + 70_000),
    });
    await setDoc(doc(db, 'matches/over1'), {
      users: ['alice', 'bea'], state: 'room',
      roomStartsAt: Timestamp.fromMillis(t - 200_000), roomEndsAt: Timestamp.fromMillis(t - 100_000), decisionEndsAt: Timestamp.fromMillis(t - 90_000),
    });
    await setDoc(doc(db, 'matches/chat1'), {
      users: ['alice', 'bea'], state: 'chat',
      roomStartsAt: Timestamp.fromMillis(t - 500_000), roomEndsAt: Timestamp.fromMillis(t - 400_000), decisionEndsAt: Timestamp.fromMillis(t - 390_000),
    });
    await setDoc(doc(db, 'matches/room1/snaps/s1'), { from: 'alice', to: 'bea', state: 'sealed' });
    await setDoc(doc(db, 'snapData/s1'), { data: '/9j/xxx' });
    await setDoc(doc(db, 'names/Cesur Vaşak'), { uid: 'alice' });
  });
});

const as = (u) => env.authenticatedContext(u).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const presence = (gender, extra = {}) => ({ lat: 41.01, lng: 29.02, geohash: 'sxk9abc', gender, updatedAt: serverTimestamp(), ...extra });
const msg = (from, extra = {}) => ({ from, kind: 'text', text: 'selam', at: serverTimestamp(), ...extra });

test('profil: yalnızca sahibi okur, kimse yazamaz', async () => {
  await assertSucceeds(getDoc(doc(as('alice'), 'users/alice')));
  await assertFails(getDoc(doc(as('bea'), 'users/alice')));
  await assertFails(getDoc(doc(anon(), 'users/alice')));
  await assertFails(setDoc(doc(as('alice'), 'users/alice'), { gender: 'female' }));
});

test('konum: sahibi doğru cinsiyetle yazar; kimse okuyamaz', async () => {
  await assertSucceeds(setDoc(doc(as('alice'), 'presence/alice'), presence('male')));
  await assertFails(setDoc(doc(as('alice'), 'presence/alice'), presence('female'))); // cinsiyet taklidi
  await assertFails(setDoc(doc(as('alice'), 'presence/bea'), presence('female'))); // başkasının konumu
  await assertFails(setDoc(doc(as('alice'), 'presence/alice'), presence('male', { extra: 1 })));
  await assertFails(setDoc(doc(as('alice'), 'presence/alice'), presence('male', { updatedAt: Timestamp.fromMillis(0) })));
  await assertFails(getDoc(doc(as('alice'), 'presence/bea')));
  await assertFails(getDocs(collection(as('alice'), 'presence')));
  await assertSucceeds(deleteDoc(doc(as('alice'), 'presence/alice')));
  await assertFails(setDoc(doc(as('carol'), 'presence/carol'), presence('male'))); // kayıtsız
});

test('oda: yalnızca katılımcılar okur; istemci yazamaz', async () => {
  await assertSucceeds(getDoc(doc(as('alice'), 'matches/room1')));
  await assertFails(getDoc(doc(as('carol'), 'matches/room1')));
  await assertSucceeds(getDocs(query(collection(as('alice'), 'matches'), where('users', 'array-contains', 'alice'))));
  await assertFails(setDoc(doc(as('alice'), 'matches/room1'), { state: 'chat' }, { merge: true }));
});

test('mesaj: oda açıkken ve sohbette yazılır; süre bitince ve taklitle yazılamaz', async () => {
  await assertSucceeds(addDoc(collection(as('alice'), 'matches/room1/messages'), msg('alice')));
  await assertSucceeds(addDoc(collection(as('bea'), 'matches/chat1/messages'), msg('bea', { kind: 'meet' })));
  await assertFails(addDoc(collection(as('alice'), 'matches/over1/messages'), msg('alice'))); // süre bitti
  await assertFails(addDoc(collection(as('alice'), 'matches/room1/messages'), msg('bea'))); // başkası adına
  await assertFails(addDoc(collection(as('carol'), 'matches/room1/messages'), msg('carol'))); // katılımcı değil
  await assertFails(addDoc(collection(as('alice'), 'matches/room1/messages'), msg('alice', { kind: 'system' })));
  await assertFails(addDoc(collection(as('alice'), 'matches/room1/messages'), msg('alice', { text: 'x'.repeat(281) })));
  await assertFails(addDoc(collection(as('alice'), 'matches/room1/messages'), msg('alice', { text: '' })));
  await assertSucceeds(getDocs(collection(as('bea'), 'matches/room1/messages')));
  await assertFails(getDocs(collection(as('carol'), 'matches/room1/messages')));
});

test('snap: yalnızca alıcı kaydı görür; fotoğraf verisine kimse erişemez', async () => {
  await assertSucceeds(getDoc(doc(as('bea'), 'matches/room1/snaps/s1')));
  await assertFails(getDoc(doc(as('alice'), 'matches/room1/snaps/s1')));
  await assertSucceeds(getDocs(query(collection(as('bea'), 'matches/room1/snaps'), where('to', '==', 'bea'), where('state', '==', 'sealed'))));
  await assertFails(getDoc(doc(as('bea'), 'snapData/s1')));
  await assertFails(setDoc(doc(as('alice'), 'matches/room1/snaps/s2'), { from: 'alice', to: 'bea', state: 'sealed' }));
});

test('sunucuya ait koleksiyonlar kapalı', async () => {
  await assertFails(getDoc(doc(as('alice'), 'names/Cesur Vaşak')));
  await assertFails(setDoc(doc(as('alice'), 'names/Yeni İsim'), { uid: 'alice' }));
  await assertFails(setDoc(doc(as('alice'), 'strikes/alice_bea'), { from: 'alice', to: 'bea' }));
  await assertFails(setDoc(doc(as('alice'), 'blocks/alice_bea'), { by: 'alice', target: 'bea' }));
  await assertFails(addDoc(collection(as('alice'), 'reports'), { by: 'alice' }));
});
