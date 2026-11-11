import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { farewellMessage, FAREWELL_TEMPLATES } from '../logic/farewell';
import { Avatar, Btn, T } from '../ui/components';
import { Glyph } from '../ui/icons';
import { dative } from '../logic/turkish';
import { colors, fonts } from '../ui/theme';
import type { ScreenProps } from './types';

export function Farewell({ state, dispatch }: ScreenProps) {
  const [i, setI] = useState(0);
  const text = farewellMessage(i);
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, gap: 16 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
        <View style={{ gap: 6 }}>
          <Text style={[T.h1, { fontSize: 30 }]}>Kibarca bitir</Text>
          <Text style={T.body}>
            Ghosting yok. {dative(state.partner!.identity.name)} şu mesaj gidecek ve oda güvenle kapanacak:
          </Text>
        </View>
        <View style={{ backgroundColor: colors.night, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 12 }}>
          <Avatar identity={state.me!.identity} size={36} />
          <Text testID="farewell-text" style={{ flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text }}>
            {text}
          </Text>
        </View>
        <Btn
          testID="farewell-next"
          label={`Başka bir cümle (${i + 1}/${FAREWELL_TEMPLATES.length})`}
          variant="outline"
          icon={<Glyph name="refresh" size={14} color={colors.textSoft} strokeWidth={2.2} />}
          onPress={() => setI((x) => x + 1)}
          style={{ alignSelf: 'flex-start', height: 44 }}
        />
        <Btn
          testID="farewell-send"
          label="Gönder ve odayı kapat"
          variant="spark"
          big
          onPress={() => dispatch({ type: 'SEND_FAREWELL', text, now: Date.now() })}
        />
        <Btn label="Vazgeç, sohbete dön" variant="ghost" onPress={() => dispatch({ type: 'BACK_TO_CHAT' })} />
      </View>
    </View>
  );
}

export function Closed({ state, dispatch }: { state: ScreenProps['state']; dispatch: ScreenProps['dispatch'] }) {
  const farewell = state.closedReason === 'farewell-sent';
  return (
    <View style={{ flex: 1, padding: 28, alignItems: 'center', gap: 18 }}>
      <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 100 }}>
        <Glyph name={farewell ? 'check' : 'close'} size={56} color={farewell ? colors.volt : colors.muted} strokeWidth={1.8} />
      </View>
      <Text style={[T.h1, { textAlign: 'center' }]}>Oda kapandı.</Text>
      <Text testID="closed-text" style={[T.body, { textAlign: 'center', maxWidth: 300 }]}>
        {farewell
          ? 'Kibar vedan iletildi. Bu oda bir daha açılmayacak.'
          : 'İkiniz birden "Devam" demediniz. Bu oda sonsuza dek kapandı; radarda yeni kıvılcımlar seni bekliyor.'}
      </Text>
      <View style={{ flex: 1 }} />
      <Btn testID="back-to-radar" label="Radara dön" big onPress={() => dispatch({ type: 'ENTER_RADAR' })} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}
