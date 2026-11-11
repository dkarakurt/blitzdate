import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { distanceMeters, formatDistance } from '../logic/radar';
import { Avatar, Btn, T, useNow } from '../ui/components';
import { colors, fonts } from '../ui/theme';
import type { ScreenProps } from './types';

export function Strike({ state, dispatch }: ScreenProps) {
  const me = state.me!;
  const partner = state.partner!;
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const now = useNow(200);
  const count = Math.max(0, 3 - Math.floor((now - startedAt) / 1000));
  const opened = useRef(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  useEffect(() => {
    if (count > 0 || opened.current) return;
    opened.current = true;
    dispatch({ type: 'OPEN_ROOM', now: Date.now() });
  }, [count, dispatch]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.volt, padding: 24, alignItems: 'center', gap: 24 }}>
      <Text style={[T.label, { color: colors.ink, marginTop: 24 }]}>İkiniz de çarptınız</Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 96, lineHeight: 86, color: colors.ink, textAlign: 'center', letterSpacing: -4, paddingTop: 10 }}>
        STRI{'\n'}KE!
      </Text>
      <View style={{ width: 300, height: 160 }}>
        <View style={{ position: 'absolute', left: 20, top: 10 }}>
          <Avatar identity={me.identity} size={140} bg={colors.ink} iconColor={colors.volt} />
        </View>
        <View style={{ position: 'absolute', left: 140, top: 10 }}>
          <Avatar identity={partner.identity} size={140} ring={colors.volt} />
        </View>
        <Svg width={70} height={110} viewBox="0 0 24 34" style={{ position: 'absolute', left: 115, top: 25 }}>
          <Path d="M15 1 L2 19 h9 l-3 14 l14-20 h-9 l4-12 z" fill={colors.paper} stroke={colors.ink} strokeWidth={1.6} strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 20, color: colors.ink }}>
          {me.identity.name} × {partner.identity.name}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft }}>
          {formatDistance(distanceMeters(me.location, partner.location))} uzaklıkta
          {partner.sameVenue ? ' · aynı mekanda' : ''}
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ alignSelf: 'stretch', backgroundColor: colors.ink, borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 4, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.volt }}>{count}</Text>
        </View>
        <View>
          <Text style={T.strong}>BlitzRoom açılıyor…</Text>
          <Text style={T.small}>Yazışma · 90 saniyen var</Text>
        </View>
      </View>
      <Btn label="Hemen gir" variant="dark" onPress={() => setStartedAt(0)} />
    </View>
  );
}
