import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatDistance, genderPlural, oppositeGender, visibleOnRadar, type RadarHit } from '../logic/radar';
import { Avatar, Btn, T, Wordmark } from '../ui/components';
import { Bolt } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import type { ScreenProps } from './types';

const M_PER_DEG = 111_320;

export function Radar({ state, dispatch, services }: ScreenProps) {
  const me = state.me!;
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 360);
  const R = size / 2;
  const hidden = useMemo(() => new Set(state.hidden), [state.hidden]);
  const hits = useMemo(() => visibleOnRadar(me, services.users, hidden), [me, services.users, hidden]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const selected: RadarHit | undefined = hits.find((h) => h.id === selectedId) ?? hits[0];

  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  const rotate = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  useEffect(() => {
    if (!pending || !selected) return;
    // Demo: karşı taraf da çarpıyor (gerçek sürümde sunucu iki tarafın onayını bekler).
    const t = setTimeout(() => dispatch({ type: 'STRIKE', partner: selected }), 900);
    return () => clearTimeout(t);
  }, [pending, selected, dispatch]);

  const pos = (h: RadarHit) => {
    const north = (h.location.lat - me.location.lat) * M_PER_DEG;
    const east = (h.location.lng - me.location.lng) * M_PER_DEG * Math.cos((me.location.lat * Math.PI) / 180);
    // Çok yakındakiler "Sen" simgesinin altında kalmasın diye en az 46 px dışarıda çizilir.
    const dist = Math.hypot(north, east) || 1;
    const r = 46 + (dist / 1000) * (R - 26 - 46);
    return { left: R + (east / dist) * r, top: R - (north / dist) * r };
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 22, paddingRight: 12, paddingLeft: 4, height: 44, borderWidth: 1, borderColor: colors.line }}>
          <Avatar identity={me.identity} size={36} />
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{me.identity.name}</Text>
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <Text style={T.h1}>Şu an buradasın.</Text>
        <Text style={T.body}>
          1 km içinde <Text style={{ color: colors.volt, fontFamily: fonts.bodySemi }}>{hits.length} {genderPlural(oppositeGender(me.gender))}</Text> çevrimiçi
        </Text>
      </View>

      <View style={{ width: size, height: size, alignSelf: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={R} cy={R} r={R - 2} fill={colors.radar} stroke={colors.line} />
          <Circle cx={R} cy={R} r={(R - 26) * 0.7} fill="none" stroke={colors.line} />
          <Circle cx={R} cy={R} r={(R - 26) * 0.35} fill="none" stroke={colors.line} />
        </Svg>
        <Animated.View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate }] }}>
          <Svg width={size} height={size}>
            <Path d={`M${R} ${R} L${R} 2 A${R - 2} ${R - 2} 0 0 1 ${size - 2} ${R} Z`} fill={colors.volt} fillOpacity={0.08} />
            <Line x1={R} y1={R} x2={R} y2={2} stroke={colors.volt} strokeOpacity={0.6} strokeWidth={2} />
          </Svg>
        </Animated.View>
        <View style={{ position: 'absolute', left: R - 20, top: R - 20 }}>
          <Avatar identity={me.identity} size={40} bg={colors.paper} />
        </View>
        {hits.map((h) => {
          const p = pos(h);
          const isSel = selected?.id === h.id;
          const d = isSel ? 56 : 44;
          return (
            <Pressable
              key={h.id}
              testID={`radar-${h.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${h.identity.name}, ${formatDistance(h.distanceM)}`}
              onPress={() => setSelectedId(h.id)}
              style={{ position: 'absolute', left: p.left - d / 2, top: p.top - d / 2 }}
            >
              <Avatar identity={h.identity} size={d} ring={isSel ? colors.volt : colors.line} />
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar identity={selected.identity} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text testID="selected-name" style={T.strong}>{selected.identity.name}</Text>
            <Text style={T.small}>
              {formatDistance(selected.distanceM)}
              {selected.sameVenue ? ' · aynı mekanda' : ' · şu an çevrimiçi'}
            </Text>
          </View>
          <Btn
            testID="strike-button"
            label={pending ? 'Bekleniyor' : 'Çarp'}
            disabled={pending}
            icon={<Bolt size={16} />}
            onPress={() => setPending(true)}
          />
        </View>
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20 }}>
          <Text style={T.body}>Şu an yakında kimse yok. Radar taramaya devam ediyor.</Text>
        </View>
      )}

      <Text style={[T.small, { textAlign: 'center' }]}>Radarda yalnızca karşı cins görünür. Konum yalnızca yaklaşık mesafe.</Text>
    </View>
  );
}
