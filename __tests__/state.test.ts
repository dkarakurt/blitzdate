import { initialState, isExpired, reducer, screenOf, type Action, type AppState } from '../src/state/app';
import type { MatchView } from '../src/backend/types';

const run = (s: AppState, ...a: Action[]) => a.reduce(reducer, s);
const profile = { uid: 'me', identity: { name: 'Cesur Vaşak', kind: 'lynx' as const, color: '#FFFF00' }, gender: 'male' as const, rerolled: false };
const match = (over: Partial<MatchView> = {}): MatchView => ({
  id: 'm1',
  partner: { id: 'p', identity: { name: 'Uykucu Tilki', kind: 'fox', color: '#FF5C8A' } },
  distanceM: 80,
  state: 'room',
  roomStartsAt: 3000,
  roomEndsAt: 93000,
  decisionEndsAt: 103000,
  votes: { me: null, them: null },
  snapsSentByMe: 0,
  meetEligible: true,
  closedReason: null,
  closedByMe: false,
  ...over,
});
const ready = run(initialState, { type: 'BOOTED', profile: null }, { type: 'PROFILE', profile }, { type: 'ENTER_RADAR' });

describe('Durum ve ekran türetimi (sunucu otoriteli)', () => {
  test('açılış → giriş → radar', () => {
    expect(screenOf(initialState, 0)).toBe('loading');
    const s = run(initialState, { type: 'BOOTED', profile: null });
    expect(screenOf(s, 0)).toBe('onboarding');
    expect(screenOf(run(s, { type: 'PROFILE', profile }), 0)).toBe('onboarding'); // isim gösterimi
    expect(screenOf(ready, 0)).toBe('radar');
    // kayıtlı kullanıcı doğrudan radara
    expect(screenOf(run(initialState, { type: 'BOOTED', profile }), 0)).toBe('radar');
  });

  test('eşleşme ekranı sunucu zamanlarından türetilir: strike → oda → karar → sohbet', () => {
    const s = run(ready, { type: 'MATCH', match: match() });
    expect(screenOf(s, 1000)).toBe('strike');
    expect(screenOf(s, 5000)).toBe('room');
    expect(screenOf(s, 95000)).toBe('decision');
    expect(screenOf(run(s, { type: 'MATCH', match: match({ state: 'chat' }) }), 999999)).toBe('chat');
  });

  test('karar süresi + tolerans geçince oda süresi dolmuş sayılır', () => {
    expect(isExpired(match(), 103000)).toBe(false);
    expect(isExpired(match(), 106001)).toBe(true);
    expect(isExpired(match({ state: 'chat' }), 10 ** 9)).toBe(false);
    const s = run(ready, { type: 'MATCH', match: match() }, { type: 'MATCH_EXPIRED' });
    expect(screenOf(s, 0)).toBe('closed');
    expect(s.closed?.reason).toBe('expired');
  });

  test('kapanış nedeni ve kimin kapattığı korunur; radara dönülür', () => {
    let s = run(ready, { type: 'MATCH', match: match({ state: 'chat' }) }, { type: 'OPEN', overlay: 'farewell' });
    expect(screenOf(s, 0)).toBe('farewell');
    s = reducer(s, { type: 'MATCH', match: match({ state: 'closed', closedReason: 'farewell', closedByMe: true }) });
    expect(screenOf(s, 0)).toBe('closed');
    expect(s.closed).toEqual({ reason: 'farewell', byMe: true });
    expect(s.overlay).toBeNull();
    expect(screenOf(reducer(s, { type: 'DISMISS_CLOSED' }), 0)).toBe('radar');
  });

  test('eşleşmeye bağlı katmanlar eşleşme yokken açılamaz; yasal metin ve profil açılır', () => {
    expect(reducer(ready, { type: 'OPEN', overlay: 'snapCapture' }).overlay).toBeNull();
    expect(screenOf(reducer(ready, { type: 'OPEN', overlay: 'profile' }), 0)).toBe('profile');
    const legal = reducer(ready, { type: 'OPEN', overlay: 'legal', legalDoc: 'privacy' });
    expect(legal.legalDoc).toBe('privacy');
    expect(screenOf(legal, 0)).toBe('radar'); // yasal metin üst katman, alttaki ekran korunur
  });

  test('buluşma: yalnızca listedeki kafe seçilir; gidiliyor işareti', () => {
    const cafe = (id: string) => ({ venue: { id, name: id, kind: 'cafe' as const, location: { lat: 0, lng: 0 }, isPublic: true, tags: [] }, toA: 100, toB: 120 });
    let s = run(ready, { type: 'MATCH', match: match({ state: 'chat' }) }, { type: 'MEET_LOADED', cafes: [cafe('a'), cafe('b')] });
    expect(s.meet?.selectedId).toBe('a');
    s = run(s, { type: 'MEET_SELECT', id: 'b' }, { type: 'MEET_SELECT', id: 'zzz' });
    expect(s.meet?.selectedId).toBe('b');
    expect(reducer(s, { type: 'MEET_GOING' }).meet?.going).toBe(true);
  });

  test('hesap silinince her şey sıfırlanır', () => {
    const s = reducer(run(ready, { type: 'MATCH', match: match() }), { type: 'SIGNED_OUT' });
    expect(s.profile).toBeNull();
    expect(s.match).toBeNull();
    expect(screenOf(s, 0)).toBe('onboarding');
  });
});
