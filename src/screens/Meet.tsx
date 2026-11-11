import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { walkingMinutes } from '../logic/meet';
import { Avatar, Btn, T } from '../ui/components';
import { Glyph } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import type { ScreenProps } from './types';

/** BlitzMeet: ikinize de yürüme mesafesindeki kafeler. */
export function Meet({ state, dispatch }: ScreenProps) {
  const me = state.me!;
  const partner = state.partner!;
  const plan = state.meet!;
  const selected = plan.cafes.find((c) => c.venue.id === plan.selectedId);

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
        <Text style={T.body}>İkinize de yürüme mesafesindeki kafeler.</Text>
      </View>

      <View style={{ height: 170, borderRadius: 20, backgroundColor: colors.radar, overflow: 'hidden' }}>
        <Svg width="100%" height={170} viewBox="0 0 350 170" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute' }}>
          <Path d="M0 55 H350 M0 120 H350 M90 0 V170 M210 0 V170 M290 0 V170" stroke={colors.surface2} strokeWidth={10} />
          <Path d="M60 135 Q110 110 175 85" fill="none" stroke={colors.volt} strokeWidth={3} strokeDasharray="6 6" strokeLinecap="round" />
          <Path d="M290 40 Q240 62 175 85" fill="none" stroke={colors.spark} strokeWidth={3} strokeDasharray="6 6" strokeLinecap="round" />
        </Svg>
        <View style={{ position: 'absolute', left: '11%', top: 115 }}>
          <Avatar identity={me.identity} size={40} />
        </View>
        <View style={{ position: 'absolute', right: '11%', top: 20 }}>
          <Avatar identity={partner.identity} size={40} />
        </View>
        <View style={{ position: 'absolute', left: '50%', marginLeft: -24, top: 61, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name="cup" size={24} color={colors.ink} />
        </View>
      </View>

      {plan.cafes.length === 0 ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 16 }}>
          <Text testID="no-cafes" style={T.body}>Şu an ikinize de yakın uygun bir kafe bulamadık. Sohbete devam edin, yaklaşınca tekrar bakarız.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10 }}>
          {plan.cafes.map((c) => {
            const isSel = c.venue.id === plan.selectedId;
            return (
              <Pressable
                key={c.venue.id}
                testID={`cafe-${c.venue.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSel }}
                onPress={() => dispatch({ type: 'MEET_SELECT', id: c.venue.id })}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 20,
                  padding: 14,
                  borderWidth: 2,
                  borderColor: isSel ? colors.volt : 'transparent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isSel ? colors.volt : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph name="cup" size={20} color={isSel ? colors.ink : colors.textSoft} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[T.strong, { fontSize: 16 }]}>{c.venue.name}</Text>
                  <Text style={T.small}>
                    Sana {walkingMinutes(c.toA)} dk · Ona {walkingMinutes(c.toB)} dk yürüme
                    {c.venue.tags.length ? ` · ${c.venue.tags.join(', ')}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {selected ? (
        <Text style={[T.small, { color: colors.textSoft }]}>
          ● Sen: {plan.going ? 'yoldasın' : 'seçim yapıyorsun'}   ● {partner.identity.name}: bekliyor
        </Text>
      ) : null}

      <Btn
        testID="meet-going"
        label={plan.going ? 'Yoldasın! Görüşürsünüz' : 'Buraya geliyorum'}
        big
        variant={plan.going ? 'spark' : 'volt'}
        disabled={!selected}
        onPress={() => dispatch({ type: 'MEET_GOING' })}
      />
      <Text style={[T.small, { textAlign: 'center' }]}>
        Tam konumun paylaşılmaz, yalnızca buluşma noktası. Bir arkadaşına haber vermeyi unutma.
      </Text>
    </View>
  );
}
