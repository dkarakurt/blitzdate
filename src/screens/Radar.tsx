import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Linking, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatDistance, genderPlural, oppositeGender, RADAR_RADIUS_M } from '../logic/radar';
import type { RadarEntry } from '../backend/types';
import { friendlyError } from '../backend/errors';
import { Avatar, Btn, T, Wordmark } from '../ui/components';
import { Bolt } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { ErrorLine } from './ChatParts';
import type { ScreenProps } from './types';

export const RADAR_POLL_MS = 15_000;

/** Yön bilgisi sızdırmamak için açı, kişiye özgü sabit bir sözde-rastgele değerdir. */
function angleFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 360) * (Math.PI / 180);
}

export function Radar({ state, dispatch, services }: ScreenProps) {
  const profile = state.profile!;
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 340);
  const R = size / 2;
  const [entries, setEntries] = useState<RadarEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const selected = entries.find((h) => h.id === selectedId) ?? entries[0];

  const [sweep] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  const rotate = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const refresh = useCallback(async () => {
    try {
      const list = await services.backend.nearby();
      // Bana çarpanlar önce
      setEntries([...list].sort((a, b) => Number(b.struckMe) - Number(a.struckMe) || a.distanceM - b.distanceM));
      setLoaded(true);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [services.backend]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, RADAR_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh, state.location]);

  const strike = async (entry: RadarEntry) => {
    setPending(entry.id);
    setError(null);
    try {
      const r = await services.backend.strike(entry.id);
      if (!r.matched) setWaiting((s) => new Set(s).add(entry.id));
      // Eşleşme olursa sunucu odayı açar; ekran kendiliğinden Strike'a geçer.
    } catch (e) {
      setError(friendlyError(e));
      refresh();
    } finally {
      setPending(null);
    }
  };

  const pos = (h: RadarEntry) => {
    const r = 46 + (Math.min(h.distanceM, RADAR_RADIUS_M) / RADAR_RADIUS_M) * (R - 26 - 46);
    const a = angleFor(h.id);
    return { left: R + Math.sin(a) * r, top: R - Math.cos(a) * r };
  };

  const want = genderPlural(oppositeGender(profile.gender));

  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark />
        <Pressable
          testID="open-profile"
          accessibilityRole="button"
          accessibilityLabel={`Profilin: ${profile.identity.name}`}
          onPress={() => dispatch({ type: 'OPEN', overlay: 'profile' })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 22, paddingRight: 12, paddingLeft: 4, height: 44, borderWidth: 1, borderColor: colors.line, maxWidth: 190 }}
        >
          <Avatar identity={profile.identity} size={36} />
          <Text numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, flexShrink: 1 }}>{profile.identity.name}</Text>
        </Pressable>
      </View>

      <View style={{ gap: 4 }}>
        <Text style={T.h1}>Şu an buradasın.</Text>
        <Text testID="radar-count" style={T.body}>
          1 km içinde <Text style={{ color: colors.volt, fontFamily: fonts.bodySemi }}>{entries.length} {want}</Text> çevrimiçi
        </Text>
      </View>

      {state.location === 'denied' ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.spark }}>
          <Text style={[T.body, { color: colors.text }]}>Yakınındakileri görmek için konum izni gerekli. Konumun yalnızca uygulama açıkken kullanılır.</Text>
          <Btn label="Ayarları aç" variant="spark" onPress={() => Linking.openSettings()} style={{ alignSelf: 'flex-start', height: 40 }} />
        </View>
      ) : null}

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
          <Avatar identity={profile.identity} size={40} bg={colors.paper} />
        </View>
        {entries.map((h) => {
          const p = pos(h);
          const isSel = selected?.id === h.id;
          const d = isSel ? 56 : 44;
          return (
            <Pressable
              key={h.id}
              testID={`radar-${h.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${h.identity.name}, ${formatDistance(h.distanceM)}${h.struckMe ? ', sana çarptı' : ''}`}
              onPress={() => setSelectedId(h.id)}
              style={{ position: 'absolute', left: p.left - d / 2, top: p.top - d / 2 }}
            >
              <Avatar identity={h.identity} size={d} ring={h.struckMe ? colors.spark : isSel ? colors.volt : colors.line} />
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar identity={selected.identity} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text testID="selected-name" style={T.strong} numberOfLines={1}>{selected.identity.name}</Text>
            <Text style={[T.small, selected.struckMe ? { color: colors.spark, fontFamily: fonts.bodySemi } : null]}>
              {formatDistance(selected.distanceM)}
              {selected.struckMe ? ' · sana çarptı!' : waiting.has(selected.id) ? ' · onun da çarpması bekleniyor' : ' · şu an çevrimiçi'}
            </Text>
          </View>
          <Btn
            testID="strike-button"
            label={pending === selected.id ? 'Bekleniyor' : waiting.has(selected.id) ? 'Çarptın' : 'Çarp'}
            disabled={!!pending || waiting.has(selected.id)}
            icon={<Bolt size={16} />}
            onPress={() => {
              void strike(selected);
            }}
          />
        </View>
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20 }}>
          <Text testID="radar-empty" style={T.body}>
            {loaded ? 'Şu an 1 km içinde çevrimiçi kimse yok. Radar taramaya devam ediyor.' : 'Radar taranıyor…'}
          </Text>
        </View>
      )}
      <ErrorLine text={error} />
      <Text style={[T.small, { textAlign: 'center' }]}>Radarda yalnızca karşı cins görünür. Konumun kimseye gösterilmez, yalnızca yaklaşık mesafe.</Text>
    </View>
  );
}
