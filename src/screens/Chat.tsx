import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { canBlitzMeet, pickVenue, tableCode } from '../logic/meet';
import { distanceMeters, formatDistance } from '../logic/radar';
import { snapsLeft } from '../logic/snap';
import { demoVenues } from '../demo/world';
import { Btn, Composer, Thread } from '../ui/components';
import { Glyph } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { IncomingSnapBanner, PartnerHeader } from './ChatParts';
import type { ScreenProps } from './types';

export function Chat({ state, dispatch, services }: ScreenProps) {
  const me = state.me!;
  const partner = state.partner!;
  const dist = distanceMeters(me.location, partner.location);
  const meetable = canBlitzMeet(me, { location: partner.location, outdoors: partner.outdoors ?? false });
  const showMeet = meetable && !state.meetDismissed;

  const openMeet = () => {
    const venue = pickVenue(me.location, partner.location, demoVenues(me.location, partner.location));
    if (venue) dispatch({ type: 'OPEN_MEET', venue, code: tableCode(services.rng), now: Date.now() });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <PartnerHeader
        state={state}
        status={`çevrimiçi · ${formatDistance(dist)}`}
        right={
          <Pressable
            testID="open-farewell"
            accessibilityRole="button"
            onPress={() => dispatch({ type: 'OPEN_FAREWELL' })}
            style={{ height: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Glyph name="wave" size={16} color={colors.textSoft} />
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textSoft }}>Kibarca bitir</Text>
          </Pressable>
        }
      />

      <View style={{ alignSelf: 'flex-start', height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.volt, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Glyph name="infinity" size={18} color={colors.ink} strokeWidth={2.2} />
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.ink }}>Süre duvarı yıkıldı · Sonsuz oda</Text>
      </View>

      <Thread messages={state.messages} />

      <IncomingSnapBanner state={state} onOpen={() => dispatch({ type: 'VIEW_SNAP', now: Date.now() })} />

      {showMeet && (
        <View testID="meet-card" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.spark, borderRadius: 20, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Glyph name="pin" size={18} color={colors.spark} />
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.5, color: colors.spark }}>BLITZMEET HAZIR</Text>
          </View>
          <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.text, lineHeight: 20 }}>
            İkiniz de dışarıdasınız ve aranızda {formatDistance(dist)} var. Yazışmak yerine 15 dakikada buluşalım mı?
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn testID="meet-now" label="Şimdi buluş" variant="spark" onPress={openMeet} style={{ flex: 1, height: 44 }} />
            <Btn label="Sonra" variant="outline" onPress={() => dispatch({ type: 'DISMISS_MEET' })} style={{ height: 44 }} />
          </View>
        </View>
      )}

      <Composer
        placeholder="Artık acele yok…"
        snapsLeft={snapsLeft(state.snapsSent)}
        onSnap={() => dispatch({ type: 'OPEN_SNAP_CAPTURE' })}
        onSend={(text) => dispatch({ type: 'SEND', from: 'me', text, now: Date.now() })}
      />
      </View>
    </KeyboardAvoidingView>
  );
}
