import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ReportReason } from '../backend/types';
import { friendlyError } from '../backend/errors';
import { LEGAL_CONTACT, PRIVACY_TEXT, TERMS_TEXT } from '../legal/texts';
import { Avatar, Btn, T } from '../ui/components';
import { Glyph } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { ErrorLine } from './ChatParts';
import type { ScreenProps } from './types';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harassment', label: 'Taciz, tehdit ya da hakaret' },
  { id: 'sexual', label: 'İstenmeyen cinsel içerik' },
  { id: 'minor', label: '18 yaşından küçük olabilir' },
  { id: 'spam', label: 'Spam, reklam ya da dolandırıcılık' },
  { id: 'other', label: 'Başka bir sebep' },
];

/** Engelle / şikayet et */
export function Report({ state, dispatch, services }: ScreenProps) {
  const m = state.match!;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      // Sunucu odayı kapatır; ekran kendiliğinden "Oda kapandı"ya geçer.
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, gap: 14 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar identity={m.partner.identity} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[T.h1, { fontSize: 26 }]}>Engelle ya da şikayet et</Text>
            <Text style={T.small}>{m.partner.identity.name} bunu bilmeyecek. Oda hemen kapanır.</Text>
          </View>
        </View>
        {REASONS.map((r) => {
          const sel = reason === r.id;
          return (
            <Pressable
              key={r.id}
              testID={`reason-${r.id}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              onPress={() => setReason(r.id)}
              style={{ minHeight: 48, borderRadius: 14, borderWidth: 2, borderColor: sel ? colors.spark : colors.line, paddingHorizontal: 14, justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{r.label}</Text>
            </Pressable>
          );
        })}
        <ErrorLine text={error} />
        <Btn
          testID="report-send"
          label="Şikayet et ve engelle"
          variant="spark"
          big
          disabled={!reason || busy}
          onPress={() => run(() => services.backend.report({ userId: m.partner.id, matchId: m.id, reason: reason! }))}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn testID="block-only" label="Sadece engelle" variant="outline" disabled={busy} onPress={() => run(() => services.backend.block(m.partner.id))} style={{ flex: 1 }} />
          <Btn label="Vazgeç" variant="ghost" disabled={busy} onPress={() => dispatch({ type: 'CLOSE_OVERLAY' })} style={{ flex: 1 }} />
        </View>
        <Text style={[T.small, { textAlign: 'center' }]}>Acil bir tehlike varsa 112’yi ara.</Text>
      </View>
    </View>
  );
}

/** Profil: isim, yasal metinler, hesabı sil */
export function ProfileSheet({ state, dispatch, services }: ScreenProps) {
  const p = state.profile!;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const del = async () => {
    setBusy(true);
    setError(null);
    try {
      await services.backend.deleteAccount();
      dispatch({ type: 'SIGNED_OUT' });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  const row = (label: string, onPress: () => void, testID: string) => (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{label}</Text>
      <View style={{ transform: [{ rotate: '180deg' }] }}>
        <Glyph name="back" size={16} color={colors.muted} />
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Pressable testID="profile-close" accessibilityRole="button" accessibilityLabel="Kapat" onPress={() => dispatch({ type: 'CLOSE_OVERLAY' })} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name="close" size={20} />
      </Pressable>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar identity={p.identity} size={110} />
        <Text style={[T.h1, { fontSize: 30, textAlign: 'center' }]}>{p.identity.name}</Text>
        <Text style={T.small}>Anonim kimliğin · yalnızca sana ait</Text>
      </View>
      <View>
        {row('Kullanım Koşulları', () => dispatch({ type: 'OPEN', overlay: 'legal', legalDoc: 'terms' }), 'open-terms')}
        {row('KVKK Aydınlatma Metni', () => dispatch({ type: 'OPEN', overlay: 'legal', legalDoc: 'privacy' }), 'open-privacy')}
      </View>
      <Text style={T.small}>Destek ve başvurular: {LEGAL_CONTACT}</Text>
      <View style={{ flex: 1 }} />
      <ErrorLine text={error} />
      {confirm ? (
        <View style={{ gap: 10 }}>
          <Text style={[T.body, { color: colors.text, textAlign: 'center' }]}>Hesabın, ismin ve konum kaydın kalıcı olarak silinecek. Emin misin?</Text>
          <Btn testID="delete-confirm" label={busy ? 'Siliniyor…' : 'Evet, hesabımı sil'} variant="spark" big disabled={busy} onPress={del} />
          <Btn label="Vazgeç" variant="ghost" onPress={() => setConfirm(false)} />
        </View>
      ) : (
        <Btn testID="delete-account" label="Hesabımı sil" variant="outline" onPress={() => setConfirm(true)} />
      )}
    </View>
  );
}

export function Legal({ state, dispatch }: Pick<ScreenProps, 'state' | 'dispatch'>) {
  const text = state.legalDoc === 'privacy' ? PRIVACY_TEXT : TERMS_TEXT;
  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <Pressable testID="legal-close" accessibilityRole="button" onPress={() => dispatch({ type: 'CLOSE_OVERLAY' })} style={{ height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Glyph name="back" size={18} color={colors.textSoft} strokeWidth={2.2} />
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.textSoft }}>Geri</Text>
      </Pressable>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
        <Text testID="legal-text" style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textSoft }}>{text}</Text>
      </ScrollView>
    </View>
  );
}
