import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { AppState } from '../state/app';
import { Avatar, T } from '../ui/components';
import { CameraIcon } from '../ui/icons';
import { colors, fonts } from '../ui/theme';

export function PartnerHeader({ state, status, right }: { state: AppState; status: string; right?: React.ReactNode }) {
  const p = state.partner!;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Avatar identity={p.identity} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={T.strong}>{p.identity.name}</Text>
        <Text style={T.small}>{status}</Text>
      </View>
      {right}
    </View>
  );
}

/** Gelen, henüz açılmamış BlitzSnap için dokunulabilir şerit. */
export function IncomingSnapBanner({ state, onOpen }: { state: AppState; onOpen: () => void }) {
  if (!state.incomingSnap || state.incomingSnap.state !== 'sealed' || !state.partner) return null;
  return (
    <Pressable
      testID="open-snap"
      accessibilityRole="button"
      accessibilityLabel="Gelen BlitzSnap'i aç, 5 saniye görünür"
      onPress={onOpen}
      style={{ backgroundColor: colors.spark, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <CameraIcon color={colors.spark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink }}>{state.partner.identity.name} kozunu oynadı!</Text>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink }}>Görmek için dokun · 5 saniye · tek şans</Text>
      </View>
    </Pressable>
  );
}
