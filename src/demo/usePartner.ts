import { useEffect, useRef } from 'react';
import type React from 'react';
import type { Action, AppState } from '../state/app';
import { createSnap } from '../logic/snap';
import { demoReply } from './world';

export const DEMO_TIMING = {
  replyMs: 1300,
  voteMs: 2500,
  snapAfterChatMs: 15000,
};

/**
 * DEMO: Karşı tarafı simüle eder. Gerçek sürümde bu olaylar gerçek zamanlı sunucudan gelir.
 * - Senin mesajına kısa bir cevap yazar.
 * - Karar anında "Devam" der.
 * - Sonsuz sohbette bir süre sonra kendi BlitzSnap kozunu oynar.
 */
export function useDemoPartner(state: AppState, dispatch: React.Dispatch<Action>) {
  const replies = useRef(0);
  const snapSentFor = useRef<string | null>(null);
  const last = state.messages[state.messages.length - 1];

  useEffect(() => {
    if (!state.partner || last?.from !== 'me') return;
    const t = setTimeout(() => {
      dispatch({ type: 'SEND', from: 'them', text: demoReply(replies.current++), now: Date.now() });
    }, DEMO_TIMING.replyMs);
    return () => clearTimeout(t);
  }, [last?.id, last?.from, state.partner, dispatch]);

  useEffect(() => {
    if (state.screen !== 'decision' || state.votes.them) return;
    const t = setTimeout(() => dispatch({ type: 'VOTE', who: 'them', vote: 'continue', now: Date.now() }), DEMO_TIMING.voteMs);
    return () => clearTimeout(t);
  }, [state.screen, state.votes.them, dispatch]);

  const partnerId = state.partner?.id ?? null;
  const inChat = state.screen === 'chat';
  useEffect(() => {
    if (!inChat || !partnerId || state.incomingSnap || snapSentFor.current === partnerId) return;
    const t = setTimeout(() => {
      snapSentFor.current = partnerId;
      const now = Date.now();
      // Demo: karşı tarafın kamerası olmadığından fotoğraf yerine yer tutucu gösterilir (uri: null).
      const snap = { ...createSnap(`snap-${now}`, partnerId, { uri: '', source: 'camera', capturedAt: now - 3000 }, now), uri: null };
      dispatch({ type: 'SNAP_RECEIVED', snap, now });
    }, DEMO_TIMING.snapAfterChatMs);
    return () => clearTimeout(t);
  }, [inChat, partnerId, state.incomingSnap, dispatch]);
}
