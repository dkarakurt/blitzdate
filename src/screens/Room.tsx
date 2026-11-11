import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { BLITZ_SECONDS, ICEBREAKERS, isUrgent, nextIcebreaker, ringProgress, secondsLeft } from '../logic/room';
import { formatDistance } from '../logic/radar';
import { snapsLeft } from '../logic/snap';
import { Composer, Thread, TimerRing } from '../ui/components';
import { Bolt, Glyph } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { IncomingSnapBanner, PartnerHeader } from './ChatParts';
import type { ScreenProps } from './types';

export function Room({ state, dispatch, services, now }: ScreenProps) {
  const m = state.match!;
  const left = secondsLeft(m.roomEndsAt, now);
  const color = isUrgent(left) ? colors.spark : colors.volt;
  const send = (text: string, kind: 'text' | 'icebreaker' = 'text') => services.backend.sendMessage(m.id, text, kind).catch(() => {});

  return (
    <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <PartnerHeader
          state={state}
          status={`BlitzRoom · ${formatDistance(m.distanceM)}`}
          right={<TimerRing progress={ringProgress(left, BLITZ_SECONDS)} label={String(left)} color={color} />}
          onReport={() => dispatch({ type: 'OPEN', overlay: 'report' })}
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
          <Pressable
            testID="send-icebreaker"
            accessibilityRole="button"
            accessibilityLabel="Bu soruyu sohbete gönder"
            disabled={left === 0}
            onPress={() => {
              send(ICEBREAKERS[state.icebreaker], 'icebreaker');
              dispatch({ type: 'SET_ICEBREAKER', index: nextIcebreaker(state.icebreaker, services.rng) });
            }}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              height: 40,
              paddingHorizontal: 14,
              borderRadius: 20,
              backgroundColor: colors.volt,
              borderWidth: 2,
              borderColor: colors.ink,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Bolt size={14} />
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink }}>Sohbete gönder</Text>
          </Pressable>
        </View>

        <Thread messages={state.messages} />
        <IncomingSnapBanner state={state} onOpen={() => dispatch({ type: 'OPEN', overlay: 'snapView' })} />
        <Composer
          placeholder="Hızlı yaz, süre akıyor…"
          snapsLeft={snapsLeft(m.snapsSentByMe)}
          onSnap={() => dispatch({ type: 'OPEN', overlay: 'snapCapture' })}
          onSend={(text) => send(text)}
          disabled={left === 0}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
