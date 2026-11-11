import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Gender } from '../logic/radar';
import { TERMS_VERSION } from '../backend/types';
import { friendlyError } from '../backend/errors';
import { Avatar, Btn, T, Wordmark } from '../ui/components';
import { Glyph } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { ErrorLine } from './ChatParts';
import type { ScreenProps } from './types';

function Check({ checked, onToggle, testID, children }: { checked: boolean; onToggle: () => void; testID: string; children: React.ReactNode }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: checked ? colors.volt : colors.line,
          backgroundColor: checked ? colors.volt : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked ? <Glyph name="check" size={16} color={colors.ink} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export function Onboarding({ state, dispatch, services }: ScreenProps) {
  const profile = state.profile;
  const [gender, setGender] = useState<Gender | null>(null);
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!gender || !adult || !terms) return;
    setBusy(true);
    setError(null);
    try {
      const p = await services.backend.register({ gender, adultConfirmed: true, termsVersion: TERMS_VERSION });
      dispatch({ type: 'PROFILE', profile: p });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const reroll = async () => {
    setBusy(true);
    setError(null);
    try {
      dispatch({ type: 'PROFILE', profile: await services.backend.reroll() });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!profile) {
    const link = (label: string, doc: 'terms' | 'privacy') => (
      <Text
        accessibilityRole="link"
        onPress={() => dispatch({ type: 'OPEN', overlay: 'legal', legalDoc: doc })}
        style={{ color: colors.volt, fontFamily: fonts.bodySemi, textDecorationLine: 'underline' }}
      >
        {label}
      </Text>
    );
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 20 }}>
        <Wordmark />
        <View style={{ gap: 10 }}>
          <Text style={[T.h1, { fontSize: 40, lineHeight: 42 }]}>İsim yok.{'\n'}Fotoğraf yok.{'\n'}Sadece sen.</Text>
          <Text style={T.body}>Burada herkes anonim. Bize tek bir şey söyle, gerisini biz hallederiz.</Text>
        </View>
        <View style={{ flex: 1, minHeight: 12 }} />
        <Text style={T.label}>Cinsiyetin</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {(['female', 'male'] as const).map((g) => {
            const sel = gender === g;
            return (
              <Pressable
                key={g}
                testID={`gender-${g}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel }}
                onPress={() => setGender(g)}
                style={{
                  flex: 1,
                  height: 60,
                  borderRadius: 20,
                  borderWidth: 2,
                  borderColor: sel ? colors.volt : colors.line,
                  backgroundColor: colors.surface,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: fonts.bodySemi, fontSize: 18, color: colors.text }}>{g === 'female' ? 'Kadın' : 'Erkek'}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={T.small}>Radarda yalnızca karşı cinsi göreceksin. Cinsiyetin kimseye gösterilmez.</Text>
        <View style={{ gap: 4 }}>
          <Check testID="check-adult" checked={adult} onToggle={() => setAdult((x) => !x)}>
            <Text style={[T.body, { color: colors.text }]}>18 yaşından büyüğüm.</Text>
          </Check>
          <Check testID="check-terms" checked={terms} onToggle={() => setTerms((x) => !x)}>
            <Text style={[T.body, { color: colors.text }]}>
              {link('Kullanım Koşulları', 'terms')}’nı ve {link('KVKK Aydınlatma Metni', 'privacy')}’ni okudum, kabul ediyorum.
            </Text>
          </Check>
        </View>
        <ErrorLine text={error} />
        <Btn testID="register" label={busy ? 'Hazırlanıyor…' : 'Devam'} big disabled={!gender || !adult || !terms || busy} onPress={submit} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, alignItems: 'center', gap: 20 }}>
      <View style={{ alignSelf: 'flex-start' }}>
        <Wordmark />
      </View>
      <Text style={[T.label, { marginTop: 24 }]}>Bundan sonra sen</Text>
      <Avatar identity={profile.identity} size={180} />
      <Text testID="my-name" style={[T.h1, { fontSize: 42, textAlign: 'center' }]}>
        {profile.identity.name}
      </Text>
      <Text style={[T.body, { textAlign: 'center', maxWidth: 300 }]}>
        {"Bu isim yalnızca sana ait. Radarda, Strike'ta ve BlitzRoom'da seni herkes böyle tanıyacak."}
      </Text>
      <View style={{ flex: 1 }} />
      <ErrorLine text={error} />
      <Btn testID="enter-radar" label="Radara gir" big onPress={() => dispatch({ type: 'ENTER_RADAR' })} style={{ alignSelf: 'stretch' }} />
      <Btn
        testID="reroll"
        label={profile.rerolled ? 'Hayvanın belli oldu' : 'Bir kez yeniden çek'}
        variant="ghost"
        disabled={profile.rerolled || busy}
        onPress={reroll}
      />
    </View>
  );
}
