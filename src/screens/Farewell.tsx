import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { farewellMessage, FAREWELL_TEMPLATES } from '../logic/farewell';
import { dative } from '../logic/turkish';
import { friendlyError } from '../backend/errors';
import type { ClosedReason } from '../backend/types';
import { Avatar, Btn, T } from '../ui/components';
import { Glyph } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { ErrorLine } from './ChatParts';
import type { ScreenProps } from './types';

export function Farewell({ state, dispatch, services }: ScreenProps) {
  const m = state.match!;
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = farewellMessage(i);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await services.backend.farewell(m.id, text);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, gap: 16 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
        <View style={{ gap: 6 }}>
          <Text style={[T.h1, { fontSize: 30 }]}>Kibarca bitir</Text>
          <Text style={T.body}>Ghosting yok. {dative(m.partner.identity.name)} şu mesaj gidecek ve oda güvenle kapanacak:</Text>
        </View>
        <View style={{ backgroundColor: colors.night, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 12 }}>
          <Avatar identity={state.profile!.identity} size={36} />
          <Text testID="farewell-text" style={{ flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text }}>
            {text}
          </Text>
        </View>
        <Btn
          testID="farewell-next"
          label={`Başka bir cümle (${(i % FAREWELL_TEMPLATES.length) + 1}/${FAREWELL_TEMPLATES.length})`}
          variant="outline"
          icon={<Glyph name="refresh" size={14} color={colors.textSoft} strokeWidth={2.2} />}
          onPress={() => setI((x) => x + 1)}
          style={{ alignSelf: 'flex-start', height: 44 }}
        />
        <ErrorLine text={error} />
        <Btn testID="farewell-send" label={busy ? 'Gönderiliyor…' : 'Gönder ve odayı kapat'} variant="spark" big disabled={busy} onPress={send} />
        <Btn label="Vazgeç, sohbete dön" variant="ghost" onPress={() => dispatch({ type: 'CLOSE_OVERLAY' })} />
      </View>
    </View>
  );
}

function closedText(reason: ClosedReason, byMe: boolean): string {
  switch (reason) {
    case 'farewell':
      return byMe ? 'Kibar vedan iletildi. Bu oda bir daha açılmayacak.' : 'Karşı taraf kibarca vedalaştı: kimyanız tam tutmadı. Radarda yeni kıvılcımlar seni bekliyor.';
    case 'decision':
      return byMe ? 'Veda ettin. Bu oda sonsuza dek kapandı.' : 'İkiniz birden "Devam" demediniz. Bu oda sonsuza dek kapandı.';
    case 'blocked':
      return byMe ? 'Engellendi. Bu kişiyi bir daha görmeyeceksin.' : 'Oda kapandı.';
    case 'reported':
      return byMe ? 'Şikayetin alındı, inceleyeceğiz. Bu kişiyi bir daha görmeyeceksin.' : 'Oda kapandı.';
    case 'left':
      return 'Karşı taraf uygulamadan ayrıldı. Oda kapandı.';
    default:
      return 'Süre doldu, oda kapandı. Radarda yeni kıvılcımlar seni bekliyor.';
  }
}

export function Closed({ state, dispatch }: Pick<ScreenProps, 'state' | 'dispatch'>) {
  const c = state.closed!;
  const positive = c.byMe && (c.reason === 'farewell' || c.reason === 'reported' || c.reason === 'blocked');
  return (
    <View style={{ flex: 1, padding: 28, alignItems: 'center', gap: 18 }}>
      <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 100 }}>
        <Glyph name={positive ? 'check' : 'close'} size={56} color={positive ? colors.volt : colors.muted} strokeWidth={1.8} />
      </View>
      <Text style={[T.h1, { textAlign: 'center' }]}>Oda kapandı.</Text>
      <Text testID="closed-text" style={[T.body, { textAlign: 'center', maxWidth: 300 }]}>
        {closedText(c.reason, c.byMe)}
      </Text>
      <View style={{ flex: 1 }} />
      <Btn testID="back-to-radar" label="Radara dön" big onPress={() => dispatch({ type: 'DISMISS_CLOSED' })} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}
