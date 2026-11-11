import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { secondsLeft } from '../logic/room';
import { friendlyError } from '../backend/errors';
import { Avatar, Btn, T } from '../ui/components';
import { Bolt } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { ErrorLine } from './ChatParts';
import type { ScreenProps } from './types';

export function Decision({ state, services, now }: ScreenProps) {
  const m = state.match!;
  const me = state.profile!;
  const left = secondsLeft(m.decisionEndsAt, now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voted = m.votes.me === 'continue';

  const vote = async (v: 'continue' | 'leave') => {
    setBusy(true);
    setError(null);
    try {
      await services.backend.vote(m.id, v);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const statusText = (v: typeof m.votes.me, mine: boolean) =>
    v === 'continue' ? (mine ? 'Devam dedin' : 'Devam dedi') : mine ? 'Bekleniyor' : 'Düşünüyor…';

  return (
    <View style={{ flex: 1, padding: 24, alignItems: 'center', gap: 22 }}>
      <View style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 8, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 24 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 44, color: colors.muted }}>0</Text>
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={[T.h1, { fontSize: 40 }]}>Kıvılcım var mı?</Text>
        <Text style={[T.body, { textAlign: 'center', maxWidth: 300 }]}>
          İkiniz de “Devam” derse BlitzRoom açık kalır. Biri bile demezse bu oda sonsuza dek kapanır.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch' }}>
        {[
          { id: me.identity, v: m.votes.me, mine: true },
          { id: m.partner.identity, v: m.votes.them, mine: false },
        ].map((x) => (
          <View key={x.mine ? 'me' : 'them'} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 20, padding: 16, alignItems: 'center', gap: 8 }}>
            <Avatar identity={x.id} size={56} />
            <Text numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text }}>{x.id.name}</Text>
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: x.v === 'continue' ? colors.volt : colors.muted }}>
              {statusText(x.v, x.mine)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={T.small}>
        Karar için <Text style={{ color: colors.text, fontFamily: fonts.bodySemi }}>{left} sn</Text>
      </Text>
      <View style={{ flex: 1 }} />
      <ErrorLine text={error} />
      <Btn
        testID="vote-continue"
        label={voted ? 'Cevabı bekleniyor…' : 'Devam'}
        big
        disabled={voted || busy}
        icon={<Bolt size={22} />}
        onPress={() => vote('continue')}
        style={{ alignSelf: 'stretch', height: 72, borderRadius: 36 }}
      />
      <Btn testID="vote-leave" label="Veda et, radara dön" variant="ghost" disabled={busy} onPress={() => vote('leave')} />
    </View>
  );
}
