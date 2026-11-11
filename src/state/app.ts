import type { AnimalIdentity } from '../logic/names';
import type { Gender, GeoPoint, RadarUser } from '../logic/radar';
import { BLITZ_SECONDS, DECISION_SECONDS, decide, sanitizeMessage, type Vote } from '../logic/room';
import { openSnap, tickSnap, type Snap } from '../logic/snap';
import type { CafeSuggestion } from '../logic/meet';

export type Screen =
  | 'onboarding'
  | 'radar'
  | 'strike'
  | 'room'
  | 'decision'
  | 'chat'
  | 'meet'
  | 'farewell'
  | 'closed'
  | 'snapCapture'
  | 'snapView';

export interface Me {
  identity: AnimalIdentity;
  gender: Gender;
  rerolled: boolean;
  location: GeoPoint;
  outdoors: boolean;
}

export interface Message {
  id: string;
  from: 'me' | 'them' | 'system';
  text: string;
  at: number;
}

export interface MeetPlan {
  cafes: CafeSuggestion[];
  selectedId: string | null;
  going: boolean;
}

export type ClosedReason = 'farewell-sent' | 'decision' | null;

export interface AppState {
  screen: Screen;
  me: Me | null;
  partner: RadarUser | null;
  messages: Message[];
  roomEndsAt: number | null;
  decisionEndsAt: number | null;
  votes: { me: Vote; them: Vote };
  icebreaker: number;
  snapsSent: number;
  incomingSnap: Snap | null;
  snapReturn: 'room' | 'chat';
  meetDismissed: boolean;
  meet: MeetPlan | null;
  hidden: string[];
  closedReason: ClosedReason;
  seq: number;
}

export const initialState: AppState = {
  screen: 'onboarding',
  me: null,
  partner: null,
  messages: [],
  roomEndsAt: null,
  decisionEndsAt: null,
  votes: { me: null, them: null },
  icebreaker: 0,
  snapsSent: 0,
  incomingSnap: null,
  snapReturn: 'chat',
  meetDismissed: false,
  meet: null,
  hidden: [],
  closedReason: null,
  seq: 0,
};

export type Action =
  | { type: 'ONBOARD'; me: Me }
  | { type: 'REROLL'; identity: AnimalIdentity }
  | { type: 'ENTER_RADAR' }
  | { type: 'STRIKE'; partner: RadarUser }
  | { type: 'OPEN_ROOM'; now: number }
  | { type: 'SEND'; from: 'me' | 'them'; text: string; now: number }
  | { type: 'ROOM_TIMEUP'; now: number }
  | { type: 'VOTE'; who: 'me' | 'them'; vote: Exclude<Vote, null>; now: number }
  | { type: 'DECISION_TIMEUP' }
  | { type: 'SET_ICEBREAKER'; index: number }
  | { type: 'OPEN_SNAP_CAPTURE' }
  | { type: 'CANCEL_SNAP' }
  | { type: 'SNAP_SENT'; now: number }
  | { type: 'SNAP_RECEIVED'; snap: Snap; now: number }
  | { type: 'VIEW_SNAP'; now: number }
  | { type: 'SNAP_TICK'; now: number }
  | { type: 'CLOSE_SNAP_VIEW' }
  | { type: 'DISMISS_MEET' }
  | { type: 'OPEN_MEET'; cafes: CafeSuggestion[] }
  | { type: 'MEET_SELECT'; id: string }
  | { type: 'MEET_GOING' }
  | { type: 'BACK_TO_CHAT' }
  | { type: 'OPEN_FAREWELL' }
  | { type: 'SEND_FAREWELL'; text: string; now: number }
  | { type: 'RETURN_TO_RADAR' };

function addMessage(state: AppState, from: Message['from'], text: string, now: number): AppState {
  const seq = state.seq + 1;
  return { ...state, seq, messages: [...state.messages, { id: `m${seq}`, from, text, at: now }] };
}

function resetMatch(state: AppState, extraHidden: string[] = []): AppState {
  return {
    ...state,
    partner: null,
    messages: [],
    roomEndsAt: null,
    decisionEndsAt: null,
    votes: { me: null, them: null },
    snapsSent: 0,
    incomingSnap: null,
    meetDismissed: false,
    meet: null,
    hidden: [...state.hidden, ...extraHidden],
  };
}

const CHAT_SCREENS: readonly Screen[] = ['room', 'chat'];

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ONBOARD':
      return { ...state, me: action.me, screen: 'onboarding' };

    case 'REROLL':
      if (!state.me || state.me.rerolled) return state;
      return { ...state, me: { ...state.me, identity: action.identity, rerolled: true } };

    case 'ENTER_RADAR':
      if (!state.me) return state;
      return { ...resetMatch(state), screen: 'radar', closedReason: null };

    case 'STRIKE':
      if (state.screen !== 'radar' || state.hidden.includes(action.partner.id)) return state;
      return { ...state, partner: action.partner, screen: 'strike' };

    case 'OPEN_ROOM':
      if (state.screen !== 'strike') return state;
      return {
        ...state,
        screen: 'room',
        messages: [],
        roomEndsAt: action.now + BLITZ_SECONDS * 1000,
        votes: { me: null, them: null },
      };

    case 'SEND': {
      const text = sanitizeMessage(action.text);
      if (!text || !state.partner) return state;
      const inChat = CHAT_SCREENS.includes(state.screen) || state.screen === 'snapCapture' || state.screen === 'snapView';
      if (!inChat) return state;
      if (state.roomEndsAt != null && state.decisionEndsAt == null && action.now >= state.roomEndsAt) return state;
      return addMessage(state, action.from, text, action.now);
    }

    case 'ROOM_TIMEUP':
      if (state.roomEndsAt == null || state.decisionEndsAt != null || action.now < state.roomEndsAt) return state;
      return { ...state, screen: 'decision', decisionEndsAt: action.now + DECISION_SECONDS * 1000 };

    case 'VOTE': {
      if (state.screen !== 'decision' && state.decisionEndsAt == null) return state;
      const votes = { ...state.votes, [action.who]: action.vote };
      const timeUp = state.decisionEndsAt != null && action.now > state.decisionEndsAt;
      const outcome = decide(votes.me, votes.them, timeUp);
      if (outcome === 'continue') {
        const next = { ...state, votes, roomEndsAt: null, decisionEndsAt: null, screen: 'chat' as Screen };
        return addMessage(next, 'system', 'İkiniz de Devam dediniz. Artık süre yok.', action.now);
      }
      if (outcome === 'closed') {
        return { ...resetMatch(state, state.partner ? [state.partner.id] : []), screen: 'closed', closedReason: 'decision' };
      }
      return { ...state, votes };
    }

    case 'DECISION_TIMEUP':
      if (state.decisionEndsAt == null) return state;
      if (decide(state.votes.me, state.votes.them, true) === 'continue') return state;
      return { ...resetMatch(state, state.partner ? [state.partner.id] : []), screen: 'closed', closedReason: 'decision' };

    case 'SET_ICEBREAKER':
      return { ...state, icebreaker: action.index };

    case 'OPEN_SNAP_CAPTURE':
      if (!CHAT_SCREENS.includes(state.screen) || state.snapsSent >= 1) return state;
      return { ...state, snapReturn: state.screen as 'room' | 'chat', screen: 'snapCapture' };

    case 'CANCEL_SNAP':
      if (state.screen !== 'snapCapture') return state;
      return { ...state, screen: state.snapReturn };

    case 'SNAP_SENT': {
      if (state.screen !== 'snapCapture') return state;
      const next = { ...state, snapsSent: state.snapsSent + 1, screen: state.snapReturn };
      return addMessage(next, 'system', 'BlitzSnap kozunu oynadın. Açıldığı an 5 saniye görünecek.', action.now);
    }

    case 'SNAP_RECEIVED': {
      if (!state.partner || state.incomingSnap) return state;
      const next = { ...state, incomingSnap: action.snap };
      return addMessage(next, 'system', `${state.partner.identity.name} sana bir BlitzSnap gönderdi.`, action.now);
    }

    case 'VIEW_SNAP':
      if (!state.incomingSnap || state.incomingSnap.state !== 'sealed') return state;
      if (!CHAT_SCREENS.includes(state.screen)) return state;
      return {
        ...state,
        snapReturn: state.screen as 'room' | 'chat',
        screen: 'snapView',
        incomingSnap: openSnap(state.incomingSnap, action.now),
      };

    case 'SNAP_TICK':
      if (!state.incomingSnap) return state;
      return { ...state, incomingSnap: tickSnap(state.incomingSnap, action.now) };

    case 'CLOSE_SNAP_VIEW':
      if (state.screen !== 'snapView') return state;
      return { ...state, screen: state.snapReturn };

    case 'DISMISS_MEET':
      return { ...state, meetDismissed: true };

    case 'OPEN_MEET':
      if (state.screen !== 'chat' && state.screen !== 'snapView') return state;
      return {
        ...state,
        screen: 'meet',
        meet: { cafes: action.cafes, selectedId: action.cafes[0]?.venue.id ?? null, going: false },
      };

    case 'MEET_SELECT':
      if (!state.meet || state.meet.going || !state.meet.cafes.some((c) => c.venue.id === action.id)) return state;
      return { ...state, meet: { ...state.meet, selectedId: action.id } };

    case 'MEET_GOING':
      if (!state.meet || !state.meet.selectedId) return state;
      return { ...state, meet: { ...state.meet, going: true } };

    case 'BACK_TO_CHAT':
      if (!state.partner || state.decisionEndsAt != null || state.roomEndsAt != null) return state;
      return { ...state, screen: 'chat' };

    case 'OPEN_FAREWELL':
      if (state.screen !== 'chat') return state;
      return { ...state, screen: 'farewell' };

    case 'SEND_FAREWELL':
      if (state.screen !== 'farewell' || !state.partner) return state;
      return {
        ...resetMatch(state, [state.partner.id]),
        screen: 'closed',
        closedReason: 'farewell-sent',
      };

    case 'RETURN_TO_RADAR':
      return { ...resetMatch(state, state.partner ? [state.partner.id] : []), screen: 'radar', closedReason: null };

    default:
      return state;
  }
}
