import React, { useEffect, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { ageLabel, snapRemainingMs, SNAP_VIEW_MS } from '../logic/snap';
import { Btn, T, useNow } from '../ui/components';
import { CameraIcon, Glyph } from '../ui/icons';
import { genitive } from '../logic/turkish';
import { colors, fonts } from '../ui/theme';
import type { ScreenProps } from './types';

const PREVENT_KEY = 'blitzsnap';

/**
 * Gelen BlitzSnap'i 5 saniye gösterir, sonra siler.
 * Android: ekran görüntüsü/kaydı engellenir (FLAG_SECURE).
 * iOS: ekran kaydı gizlenir; ekran görüntüsü engellenemez, yalnızca algılanır.
 */
export function SnapView({ state, dispatch }: ScreenProps) {
  const now = useNow(100);
  const snap = state.incomingSnap;
  const [screenshotTaken, setScreenshotTaken] = useState(false);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync(PREVENT_KEY).catch(() => {});
    // Android'de FLAG_SECURE ekran görüntüsünü zaten engeller; dinleyici yalnızca iOS'ta gerekir.
    let sub: { remove: () => void } | null = null;
    if (Platform.OS === 'ios') {
      try {
        sub = ScreenCapture.addScreenshotListener(() => setScreenshotTaken(true));
      } catch {
        sub = null;
      }
    }
    return () => {
      sub?.remove();
      ScreenCapture.allowScreenCaptureAsync(PREVENT_KEY).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (snap?.state === 'viewing') dispatch({ type: 'SNAP_TICK', now });
  }, [now, snap?.state, dispatch]);

  if (!snap || snap.state === 'deleted') {
    return (
      <View style={{ flex: 1, padding: 28, alignItems: 'center', gap: 16 }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 100 }}>
          <CameraIcon size={52} color={colors.muted} strokeWidth={1.8} crossed />
        </View>
        <Text testID="snap-gone" style={[T.h1, { textAlign: 'center' }]}>Snap silindi.</Text>
        <Text style={[T.body, { textAlign: 'center', fontSize: 16, color: colors.textSoft }]}>Gerisini yüz yüze gör.</Text>
        {screenshotTaken && Platform.OS === 'ios' ? (
          <Text style={[T.small, { textAlign: 'center', color: colors.spark }]}>Ekran görüntüsü alındı; karşı taraf bilgilendirilecek.</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Btn testID="snap-close" label="Sohbete dön" big onPress={() => dispatch({ type: 'CLOSE_SNAP_VIEW' })} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  const remaining = snapRemainingMs(snap, now);
  const pct = remaining / SNAP_VIEW_MS;

  return (
    <View style={{ flex: 1, backgroundColor: colors.line }}>
      {snap.uri ? (
        <Image source={{ uri: snap.uri }} style={{ flex: 1 }} resizeMode="cover" accessibilityLabel="BlitzSnap fotoğrafı" />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 }}>
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textSoft, textAlign: 'center' }}>
            [{genitive(state.partner?.identity.name ?? '')} şu anki fotoğrafı]
          </Text>
          <Text style={[T.small, { textAlign: 'center' }]}>Demo modunda karşı tarafın gerçek kamerası yok; burada onun o an çektiği kare görünür.</Text>
        </View>
      )}
      <View style={{ position: 'absolute', left: 12, right: 12, top: 8, height: 4, borderRadius: 2, backgroundColor: colors.night }}>
        <View style={{ width: `${pct * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.paper }} />
      </View>
      <View style={{ position: 'absolute', left: 16, right: 16, top: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.night, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Glyph name="check" size={14} color={colors.volt} strokeWidth={2.4} />
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12, color: colors.volt }}>Canlı çekim · {ageLabel(snap.capturedAt, now)}</Text>
        </View>
        <View accessibilityRole="timer" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text }}>{Math.ceil(remaining / 1000)}</Text>
        </View>
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center' }}>
        <View style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.night, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Glyph name="shield" size={14} color={colors.textSoft} />
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.textSoft }}>
            {Platform.OS === 'android' ? 'Ekran görüntüsü engellendi' : 'Ekran görüntüsü alınırsa karşı taraf bilgilendirilir'}
          </Text>
        </View>
      </View>
    </View>
  );
}
