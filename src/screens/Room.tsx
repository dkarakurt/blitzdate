import React, { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { BLITZ_SECONDS, ICEBREAKERS, isUrgent, nextIcebreaker, ringProgress, secondsLeft } from '../logic/room';
import { distanceMeters, formatDistance } from '../logic/radar';
import { snapsLeft } from '../logic/snap';
import { Composer, Thread, TimerRing, useNow } from '../ui/components';
import { Glyph } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { IncomingSnapBanner, PartnerHeader } from './ChatParts';
import type { ScreenProps } from './types';

export function Room({ state, dispatch, services }: ScreenProps) {
  const now = useNow(250);
  const left = state.roomEndsAt ? secondsLeft(state.roomEndsAt, now) : 0;
  const color = isUrgent(left) ? colors.spark : colors.volt;

  useEffect(() => {
    if (state.roomEndsAt && now >= state.roomEndsAt) dispatch({ type: 'ROOM_TIMEUP', now });
  }, [now, state.roomEndsAt, dispatch]);

  const dist = formatDistance(distanceMeters(state.me!.location, state.partner!.location));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <PartnerHeader
        state={state}
        status={`BlitzRoom · ${dist}`}
        right={<TimerRing progress={ringProgress(left, BLITZ_SECONDS)} label={String(left)} color={color} />}
      />

      <View style={{ backgroundColor: colors.paper, borderRadius: 20, padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.5, color: colors.inkSoft }}>BUZKIRAN · AI</Text>
          <Pressable
            testID="next-icebreaker"
            accessibilityRole="button"
            onPress={() => dispatch({ type: 'SET_ICEBREAKER', index: nextIcebreaker(state.icebreaker, services.rng) })}
            style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Glyph name="refresh" size={12} strokeWidth={2.4} />
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text }}>Başka soru</Text>
          </Pressable>
        </View>
        <Text testID="icebreaker" style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.ink }}>
          {ICEBREAKERS[state.icebreaker]}
        </Text>
      </View>

      <Thread messages={state.messages} />
      <IncomingSnapBanner state={state} onOpen={() => dispatch({ type: 'VIEW_SNAP', now: Date.now() })} />
      <Composer
        placeholder="Hızlı yaz, süre akıyor…"
        snapsLeft={snapsLeft(state.snapsSent)}
        onSnap={() => dispatch({ type: 'OPEN_SNAP_CAPTURE' })}
        onSend={(text) => dispatch({ type: 'SEND', from: 'me', text, now: Date.now() })}
        disabled={left === 0}
      />
      </View>
    </KeyboardAvoidingView>
  );
}
