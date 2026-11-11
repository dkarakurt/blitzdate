import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Gender } from '../logic/radar';
import { DEMO_ORIGIN } from '../demo/world';
import { Avatar, Btn, T, Wordmark } from '../ui/components';
import { colors, fonts } from '../ui/theme';
import type { ScreenProps } from './types';

export function Onboarding({ state, dispatch, services }: ScreenProps) {
  const me = state.me;

  const pick = (gender: Gender) => {
    const identity = services.registry.assign();
    dispatch({
      type: 'ONBOARD',
      me: { identity, gender, rerolled: false, location: DEMO_ORIGIN, outdoors: true },
    });
  };

  if (!me) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 24 }}>
        <Wordmark />
        <View style={{ gap: 10 }}>
          <Text style={[T.h1, { fontSize: 40, lineHeight: 42 }]}>İsim yok.{'\n'}Fotoğraf yok.{'\n'}Sadece sen.</Text>
          <Text style={T.body}>Burada herkes anonim. Bize tek bir şey söyle, gerisini biz hallederiz.</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={T.label}>Cinsiyetin</Text>
        <View style={{ gap: 12 }}>
          {(['female', 'male'] as const).map((g) => (
            <Pressable
              key={g}
              testID={`gender-${g}`}
              accessibilityRole="button"
              onPress={() => pick(g)}
              style={({ pressed }) => ({
                height: 64,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed ? colors.line : colors.surface,
                justifyContent: 'center',
                paddingHorizontal: 20,
              })}
            >
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 18, color: colors.text }}>{g === 'female' ? 'Kadın' : 'Erkek'}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={T.small}>Radarda yalnızca karşı cinsi göreceksin. Bu bilgi kimseye gösterilmez.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, alignItems: 'center', gap: 20 }}>
      <View style={{ alignSelf: 'flex-start' }}>
        <Wordmark />
      </View>
      <Text style={[T.label, { marginTop: 24 }]}>Bundan sonra sen</Text>
      <Avatar identity={me.identity} size={180} />
      <Text testID="my-name" style={[T.h1, { fontSize: 42, textAlign: 'center' }]}>
        {me.identity.name}
      </Text>
      <Text style={[T.body, { textAlign: 'center', maxWidth: 300 }]}>
        {"Bu isim yalnızca sana ait. Radarda, Strike'ta ve BlitzRoom'da seni herkes böyle tanıyacak."}
      </Text>
      <View style={{ flex: 1 }} />
      <Btn testID="enter-radar" label="Radara gir" big onPress={() => dispatch({ type: 'ENTER_RADAR' })} style={{ alignSelf: 'stretch' }} />
      <Btn
        testID="reroll"
        label={me.rerolled ? 'Hayvanın belli oldu' : 'Bir kez yeniden çek'}
        variant="ghost"
        disabled={me.rerolled}
        onPress={() => dispatch({ type: 'REROLL', identity: services.registry.reroll(me.identity) })}
      />
    </View>
  );
}
