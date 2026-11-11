import type { CafeSuggestion } from '../logic/meet';
import type { ChatMessage, ClosedReason, IncomingSnap, MatchView, OpenedSnap, Profile } from '../backend/types';

/**
 * İstemci durumu. Eşleşmenin kendisi (süreler, oylar, kapanış) sunucudan gelir;
 * burada yalnızca onun yansıması ve ekran üstü katmanlar (snap, buluşma, veda, şikayet…) tutulur.
 */

export type Overlay = 'snapCapture' | 'snapView' | 'meet' | 'farewell' | 'report' | 'profile' | 'legal';
export type LegalDoc = 'terms' | 'privacy';

export type Screen =
  | 'loading'
  | 'onboarding'
  | 'radar'
  | 'strike'
  | 'room'
  | 'decision'
  | 'chat'
  | 'closed'
  | Overlay;

export interface AppState {
  booted: boolean;
  profile: Profile | null;
  enteredRadar: boolean;
  match: MatchView | null;
  messages: ChatMessage[];
  incomingSnap: IncomingSnap | null;
  openedSnap: (OpenedSnap & { openedAt: number }) | null;
  overlay: Overlay | null;
  legalDoc: LegalDoc;
  meet: { cafes: CafeSuggestion[]; selectedId: string | null; going: boolean } | null;
  closed: { reason: ClosedReason; byMe: boolean } | null;
  icebreaker: number;
  location: 'unknown' | 'granted' | 'denied';
}

export const initialState: AppState = {
  booted: false,
  profile: null,
  enteredRadar: false,
  match: null,
  messages: [],
  incomingSnap: null,
  openedSnap: null,
  overlay: null,
  legalDoc: 'terms',
  meet: null,
  closed: null,
  icebreaker: 0,
  location: 'unknown',
};

export type Action =
  | { type: 'BOOTED'; profile: Profile | null }
  | { type: 'PROFILE'; profile: Profile }
  | { type: 'ENTER_RADAR' }
  | { type: 'MATCH'; match: MatchView | null }
  | { type: 'MATCH_EXPIRED' }
  | { type: 'MESSAGES'; messages: ChatMessage[] }
  | { type: 'INCOMING_SNAP'; snap: IncomingSnap | null }
  | { type: 'SNAP_OPENED'; snap: OpenedSnap; now: number }
  | { type: 'OPEN'; overlay: Overlay; legalDoc?: LegalDoc }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'MEET_LOADED'; cafes: CafeSuggestion[] }
  | { type: 'MEET_SELECT'; id: string }
  | { type: 'MEET_GOING' }
  | { type: 'SET_ICEBREAKER'; index: number }
  | { type: 'DISMISS_CLOSED' }
  | { type: 'LOCATION'; status: AppState['location'] }
  | { type: 'SIGNED_OUT' };

const MATCH_OVERLAYS: readonly Overlay[] = ['snapCapture', 'snapView', 'meet', 'farewell', 'report'];

function endMatch(state: AppState, reason: ClosedReason, byMe: boolean): AppState {
  return {
    ...state,
    match: null,
    messages: [],
    incomingSnap: null,
    openedSnap: null,
    meet: null,
    overlay: state.overlay && MATCH_OVERLAYS.includes(state.overlay) ? null : state.overlay,
    closed: { reason, byMe },
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'BOOTED':
      return { ...state, booted: true, profile: action.profile, enteredRadar: !!action.profile };
    case 'PROFILE':
      return { ...state, profile: action.profile };
    case 'ENTER_RADAR':
      return state.profile ? { ...state, enteredRadar: true } : state;

    case 'MATCH': {
      const m = action.match;
      if (!m) return state.match ? endMatch(state, 'expired', false) : state;
      if (m.state === 'closed') {
        if (!state.match || state.match.id !== m.id) return state;
        return endMatch(state, m.closedReason ?? 'expired', m.closedByMe);
      }
      const isNew = state.match?.id !== m.id;
      return {
        ...state,
        match: m,
        closed: isNew ? null : state.closed,
        messages: isNew ? [] : state.messages,
        incomingSnap: isNew ? null : state.incomingSnap,
        openedSnap: isNew ? null : state.openedSnap,
        meet: isNew ? null : state.meet,
        overlay: isNew && state.overlay && MATCH_OVERLAYS.includes(state.overlay) ? null : state.overlay,
      };
    }
    case 'MATCH_EXPIRED':
      return state.match && state.match.state === 'room' ? endMatch(state, 'expired', false) : state;

    case 'MESSAGES':
      return state.match ? { ...state, messages: action.messages } : state;
    case 'INCOMING_SNAP':
      return state.match ? { ...state, incomingSnap: action.snap } : state;
    case 'SNAP_OPENED':
      return { ...state, openedSnap: { ...action.snap, openedAt: action.now }, incomingSnap: null };

    case 'OPEN':
      if (MATCH_OVERLAYS.includes(action.overlay) && !state.match) return state;
      return { ...state, overlay: action.overlay, legalDoc: action.legalDoc ?? state.legalDoc };
    case 'CLOSE_OVERLAY':
      return { ...state, overlay: null, openedSnap: state.overlay === 'snapView' ? null : state.openedSnap };

    case 'MEET_LOADED':
      return { ...state, meet: { cafes: action.cafes, selectedId: action.cafes[0]?.venue.id ?? null, going: false } };
    case 'MEET_SELECT':
      if (!state.meet || state.meet.going || !state.meet.cafes.some((c) => c.venue.id === action.id)) return state;
      return { ...state, meet: { ...state.meet, selectedId: action.id } };
    case 'MEET_GOING':
      return state.meet?.selectedId ? { ...state, meet: { ...state.meet, going: true } } : state;

    case 'SET_ICEBREAKER':
      return { ...state, icebreaker: action.index };
    case 'DISMISS_CLOSED':
      return { ...state, closed: null };
    case 'LOCATION':
      return { ...state, location: action.status };
    case 'SIGNED_OUT':
      return { ...initialState, booted: true };
    default:
      return state;
  }
}

export const DECISION_GRACE_MS = 3000;

/** Ekranın ne olduğu, durum + şimdiki zamandan türetilir (sunucu zamanlarına göre). */
export function screenOf(state: AppState, now: number): Screen {
  if (!state.booted) return 'loading';
  if (!state.profile || !state.enteredRadar) return 'onboarding';
  if (state.closed) return 'closed';
  // 'legal' alttaki ekranın üstünde ayrı bir katman olarak çizilir (alttaki ekranın durumu korunur).
  if (state.overlay && state.overlay !== 'legal') return state.overlay;
  const m = state.match;
  if (!m) return 'radar';
  if (m.state === 'chat') return 'chat';
  if (now < m.roomStartsAt) return 'strike';
  if (now < m.roomEndsAt) return 'room';
  return 'decision';
}

/** Karar penceresi (+ tolerans) geçti mi */
export function isExpired(m: MatchView | null, now: number): boolean {
  return !!m && m.state === 'room' && now > m.decisionEndsAt + DECISION_GRACE_MS;
}
