import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { formatDistance } from '../logic/radar';
import { snapsLeft } from '../logic/snap';
import { friendlyError } from '../backend/errors';
import { Btn, Composer, Thread } from '../ui/components';
import { Glyph } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { ErrorLine, IncomingSnapBanner, PartnerHeader } from './ChatParts';
import type { ScreenProps } from './types';

export function Chat({ state, dispatch, services }: ScreenProps) {
  const m = state.match!;
  const [meetDismissed, setMeetDismissed] = useState(false);
  const [loadingMeet, setLoadingMeet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showMeet = m.meetEligible && !meetDismissed;

  const openMeet = async () => {
    setLoadingMeet(true);
    setError(null);
    try {
      const cafes = await services.backend.meetSuggestions(m.id);
      dispatch({ type: 'MEET_LOADED', cafes });
      dispatch({ type: 'OPEN', overlay: 'meet' });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoadingMeet(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <PartnerHeader
          state={state}
          status={`çevrimiçi · ${formatDistance(m.distanceM)}`}
          onReport={() => dispatch({ type: 'OPEN', overlay: 'report' })}
          right={
            <Pressable
              testID="open-farewell"
              accessibilityRole="button"
              onPress={() => dispatch({ type: 'OPEN', overlay: 'farewell' })}
              style={{ height: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}
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
        <IncomingSnapBanner state={state} onOpen={() => dispatch({ type: 'OPEN', overlay: 'snapView' })} />

        {showMeet && (
          <View testID="meet-card" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.spark, borderRadius: 20, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Glyph name="pin" size={18} color={colors.spark} />
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.5, color: colors.spark }}>BLITZMEET</Text>
            </View>
            <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.text, lineHeight: 20 }}>
              Aranızda yaklaşık {formatDistance(m.distanceM)} var. Yakınınızdaki bir kafede buluşalım mı?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn testID="meet-now" label={loadingMeet ? 'Bakılıyor…' : 'Kafelere bak'} variant="spark" disabled={loadingMeet} onPress={openMeet} style={{ flex: 1, height: 44 }} />
              <Btn label="Sonra" variant="outline" onPress={() => setMeetDismissed(true)} style={{ height: 44 }} />
            </View>
          </View>
        )}
        <ErrorLine text={error} />

        <Composer
          placeholder="Artık acele yok…"
          snapsLeft={snapsLeft(m.snapsSentByMe)}
          onSnap={() => dispatch({ type: 'OPEN', overlay: 'snapCapture' })}
          onSend={(text) => services.backend.sendMessage(m.id, text).catch(() => {})}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
