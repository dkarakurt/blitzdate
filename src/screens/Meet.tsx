import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { formatClock, pickVenue, walkingMinutes } from '../logic/meet';
import { distanceMeters } from '../logic/radar';
import { demoVenues } from '../demo/world';
import { Avatar, Btn, T, useNow } from '../ui/components';
import { Glyph } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import type { ScreenProps } from './types';

export function Meet({ state, dispatch }: ScreenProps) {
  const now = useNow(1000);
  const me = state.me!;
  const partner = state.partner!;
  const plan = state.meet!;
  const left = Math.max(0, Math.round((plan.deadline - now) / 1000));

  const otherVenue = () => {
    const all = demoVenues(me.location, partner.location);
    const next = pickVenue(me.location, partner.location, all, new Set([...plan.excluded, plan.venue.id]));
    if (next) dispatch({ type: 'MEET_OTHER_VENUE', venue: next });
  };

  const myMin = walkingMinutes(distanceMeters(me.location, plan.venue.location));
  const theirMin = walkingMinutes(distanceMeters(partner.location, plan.venue.location));

  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 14 }}>
      <Pressable
        testID="meet-back"
        accessibilityRole="button"
        onPress={() => dispatch({ type: 'BACK_TO_CHAT' })}
        style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
      >
        <Glyph name="back" size={18} color={colors.textSoft} strokeWidth={2.2} />
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.textSoft }}>Sohbet</Text>
      </Pressable>

      <View style={{ gap: 4 }}>
        <Text style={[T.h1, { fontSize: 36 }]}>Şimdi buluş.</Text>
        <Text style={T.body}>Tam ortanızda, ikinize de yakın bir yer.</Text>
      </View>

      <View style={{ height: 190, borderRadius: 20, backgroundColor: colors.radar, overflow: 'hidden' }}>
        <Svg width="100%" height={190} viewBox="0 0 350 190" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute' }}>
          <Path d="M0 60 H350 M0 130 H350 M90 0 V190 M210 0 V190 M290 0 V190" stroke={colors.surface2} strokeWidth={10} />
          <Path d="M60 150 Q110 120 175 95" fill="none" stroke={colors.volt} strokeWidth={3} strokeDasharray="6 6" strokeLinecap="round" />
          <Path d="M290 45 Q240 70 175 95" fill="none" stroke={colors.spark} strokeWidth={3} strokeDasharray="6 6" strokeLinecap="round" />
        </Svg>
        <View style={{ position: 'absolute', left: '11%', top: 130 }}>
          <Avatar identity={me.identity} size={40} />
        </View>
        <View style={{ position: 'absolute', right: '11%', top: 25 }}>
          <Avatar identity={partner.identity} size={40} />
        </View>
        <View style={{ position: 'absolute', left: '50%', marginLeft: -24, top: 71, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name="cup" size={24} color={colors.ink} />
        </View>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 14, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text testID="venue-name" style={[T.strong, { fontSize: 17, flex: 1 }]}>{plan.venue.name}</Text>
          <Btn testID="other-venue" label="Başka yer" variant="outline" onPress={otherVenue} style={{ height: 36, paddingHorizontal: 12 }} />
        </View>
        <Text style={T.small}>
          Sana {myMin} dk · Ona {theirMin} dk yürüme · halka açık mekan
        </Text>
      </View>

      <View style={{ backgroundColor: colors.volt, borderRadius: 20, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.5, color: colors.ink }}>MASA KODU</Text>
          <Text testID="table-code" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>{plan.code}</Text>
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.ink }}>Fink Kahve İndirimi</Text>
        </View>
        <View accessibilityRole="timer" style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink }}>{formatClock(left)}</Text>
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 11, color: colors.ink }}>içinde orada ol</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Text style={[T.small, { flex: 1, color: colors.textSoft }]}>● Sen: {plan.going ? 'yolda' : 'karar bekleniyor'}</Text>
        <Text style={[T.small, { flex: 1, color: colors.textSoft }]}>● {partner.identity.name}: geliyor</Text>
      </View>

      <View style={{ flex: 1 }} />
      <Btn
        testID="meet-going"
        label={plan.going ? 'Yoldasın! Kodu kasada göster' : 'Geliyorum'}
        big
        variant={plan.going ? 'spark' : 'volt'}
        onPress={() => dispatch({ type: 'MEET_GOING' })}
      />
      <Text style={[T.small, { textAlign: 'center' }]}>
        Tam konumun paylaşılmaz, yalnızca buluşma noktası. Bir arkadaşına haber vermeyi unutma.
      </Text>
    </View>
  );
}
