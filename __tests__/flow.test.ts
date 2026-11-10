import { initialState, reducer, type Action, type AppState } from '../src/state/app';
import { demoUsers, demoVenues, DEMO_ORIGIN } from '../src/demo/world';
import { createSnap } from '../src/logic/snap';

const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const tilki = demoUsers()[0];
const me = {
  identity: { name: 'Cesur Vaşak', kind: 'lynx' as const, color: '#D7FF3A' },
  gender: 'male' as const,
  rerolled: false,
  location: DEMO_ORIGIN,
  outdoors: true,
};

function inRoom(now = 0) {
  return run(initialState, { type: 'ONBOARD', me }, { type: 'ENTER_RADAR' }, { type: 'STRIKE', partner: tilki }, { type: 'OPEN_ROOM', now });
}

describe('Uygulama akışı', () => {
  test('giriş → radar → strike → BlitzRoom', () => {
    const s = inRoom(1000);
    expect(s.screen).toBe('room');
    expect(s.partner?.id).toBe('demo-0');
    expect(s.roomEndsAt).toBe(91_000);
  });

  test('hayvan yalnızca bir kez yeniden çekilebilir', () => {
    const other = { name: 'Asi Tavşan', kind: 'rabbit' as const, color: '#FFB23F' };
    let s = run(initialState, { type: 'ONBOARD', me }, { type: 'REROLL', identity: other });
    expect(s.me?.identity.name).toBe('Asi Tavşan');
    s = reducer(s, { type: 'REROLL', identity: me.identity });
    expect(s.me?.identity.name).toBe('Asi Tavşan');
  });

  test('süre dolunca mesaj gönderilemez ve karar ekranına geçilir', () => {
    let s = inRoom(0);
    s = reducer(s, { type: 'SEND', from: 'me', text: 'selam', now: 5000 });
    expect(s.messages).toHaveLength(1);
    s = reducer(s, { type: 'SEND', from: 'me', text: 'geç kaldım', now: 90_000 });
    expect(s.messages).toHaveLength(1);
    expect(reducer(s, { type: 'ROOM_TIMEUP', now: 89_000 }).screen).toBe('room');
    s = reducer(s, { type: 'ROOM_TIMEUP', now: 90_000 });
    expect(s.screen).toBe('decision');
  });

  test('ikisi de Devam derse süre duvarı yıkılır, sonsuz sohbet açılır', () => {
    let s = run(inRoom(0), { type: 'ROOM_TIMEUP', now: 90_000 });
    s = reducer(s, { type: 'VOTE', who: 'me', vote: 'continue', now: 91_000 });
    expect(s.screen).toBe('decision');
    s = reducer(s, { type: 'VOTE', who: 'them', vote: 'continue', now: 92_000 });
    expect(s.screen).toBe('chat');
    expect(s.roomEndsAt).toBeNull();
    expect(s.messages.at(-1)?.from).toBe('system');
    s = reducer(s, { type: 'SEND', from: 'me', text: 'artık acele yok', now: 999_999 });
    expect(s.messages.at(-1)?.text).toBe('artık acele yok');
  });

  test('karar süresi biter ve biri Devam demezse oda kapanır, kişi radardan gizlenir', () => {
    let s = run(inRoom(0), { type: 'ROOM_TIMEUP', now: 90_000 }, { type: 'VOTE', who: 'me', vote: 'continue', now: 91_000 });
    s = reducer(s, { type: 'DECISION_TIMEUP' });
    expect(s.screen).toBe('closed');
    expect(s.closedReason).toBe('decision');
    expect(s.hidden).toContain('demo-0');
    expect(reducer(reducer(s, { type: 'ENTER_RADAR' }), { type: 'STRIKE', partner: tilki }).screen).toBe('radar');
  });

  test('BlitzSnap: tek hak, gönderince sohbete döner', () => {
    let s = run(inRoom(0), { type: 'OPEN_SNAP_CAPTURE' });
    expect(s.screen).toBe('snapCapture');
    s = reducer(s, { type: 'SNAP_SENT', now: 1000 });
    expect(s.screen).toBe('room');
    expect(s.snapsSent).toBe(1);
    expect(reducer(s, { type: 'OPEN_SNAP_CAPTURE' }).screen).toBe('room');
  });

  test('gelen BlitzSnap bir kez açılır ve 5 sn sonra silinir', () => {
    const snap = createSnap('s', 'demo-0', { uri: null as unknown as string, source: 'camera', capturedAt: 0 }, 0);
    let s = run(inRoom(0), { type: 'SNAP_RECEIVED', snap, now: 1000 });
    expect(s.incomingSnap?.state).toBe('sealed');
    s = reducer(s, { type: 'VIEW_SNAP', now: 2000 });
    expect(s.screen).toBe('snapView');
    s = reducer(s, { type: 'SNAP_TICK', now: 7000 });
    expect(s.incomingSnap?.state).toBe('deleted');
    s = reducer(s, { type: 'CLOSE_SNAP_VIEW' });
    expect(reducer(s, { type: 'VIEW_SNAP', now: 8000 }).screen).toBe('room');
  });

  function inChat() {
    return run(
      inRoom(0),
      { type: 'ROOM_TIMEUP', now: 90_000 },
      { type: 'VOTE', who: 'me', vote: 'continue', now: 91_000 },
      { type: 'VOTE', who: 'them', vote: 'continue', now: 91_500 },
    );
  }

  test('BlitzMeet: 15 dakikalık plan, başka mekan ve geliyorum', () => {
    const venues = demoVenues(me.location, tilki.location);
    let s = reducer(inChat(), { type: 'OPEN_MEET', venue: venues[0], code: 'BLZ-7K2Q', now: 100_000 });
    expect(s.screen).toBe('meet');
    expect(s.meet?.deadline).toBe(100_000 + 15 * 60_000);
    s = reducer(s, { type: 'MEET_OTHER_VENUE', venue: venues[1] });
    expect(s.meet?.venue.id).toBe('v2');
    expect(s.meet?.excluded).toEqual(['v1']);
    s = reducer(s, { type: 'MEET_GOING' });
    expect(s.meet?.going).toBe(true);
    expect(reducer(s, { type: 'BACK_TO_CHAT' }).screen).toBe('chat');
  });

  test('Kibarca bitir: oda kapanır, kişi gizlenir, radara dönülür', () => {
    let s = run(inChat(), { type: 'OPEN_FAREWELL' });
    expect(s.screen).toBe('farewell');
    s = reducer(s, { type: 'SEND_FAREWELL', text: 'bol şans', now: 200_000 });
    expect(s.screen).toBe('closed');
    expect(s.closedReason).toBe('farewell-sent');
    expect(s.partner).toBeNull();
    expect(s.hidden).toContain('demo-0');
    expect(reducer(s, { type: 'ENTER_RADAR' }).screen).toBe('radar');
  });

  test('BlitzRoom içinden Kibarca bitir açılmaz (yalnızca sonsuz sohbette)', () => {
    expect(reducer(inRoom(0), { type: 'OPEN_FAREWELL' }).screen).toBe('room');
  });
});
