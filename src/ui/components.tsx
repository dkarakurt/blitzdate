import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { AnimalIdentity } from '../logic/names';
import type { Message } from '../state/app';
import { AnimalIcon, Bolt, CameraIcon, LogoMark } from './icons';
import { colors, fonts } from './theme';

/** Belirli aralıklarla yenilenen "şimdi" değeri (sayaçlar için). */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Avatar({
  identity,
  size = 48,
  bg,
  iconColor = colors.ink,
  ring,
}: {
  identity: AnimalIdentity;
  size?: number;
  bg?: string;
  iconColor?: string;
  ring?: string;
}) {
  return (
    <View
      accessibilityLabel={identity.name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg ?? identity.color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 3 : 0,
        borderColor: ring,
      }}
    >
      <AnimalIcon kind={identity.kind} size={size * 0.62} color={iconColor} />
    </View>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel="Fink">
      <LogoMark size={size + 8} />
      <Text style={{ fontFamily: fonts.display, fontSize: size + 4, color: colors.text, letterSpacing: -0.5 }}>
        fink<Text style={{ color: colors.volt }}>.</Text>
      </Text>
    </View>
  );
}

type BtnVariant = 'volt' | 'spark' | 'outline' | 'ghost' | 'dark';

export function Btn({
  label,
  onPress,
  variant = 'volt',
  big = false,
  icon,
  style,
  disabled,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  big?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const bg =
    variant === 'volt' ? colors.volt : variant === 'spark' ? colors.spark : variant === 'dark' ? colors.ink : 'transparent';
  const fg = variant === 'volt' || variant === 'spark' ? colors.ink : variant === 'dark' ? colors.text : colors.textSoft;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          height: big ? 64 : 48,
          borderRadius: big ? 32 : 24,
          paddingHorizontal: 20,
          backgroundColor: bg,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: colors.line,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon}
      <Text
        style={{
          color: fg,
          fontFamily: big ? fonts.display : fonts.bodySemi,
          fontSize: big ? 21 : 15,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TimerRing({
  progress,
  label,
  size = 72,
  color,
  caption,
}: {
  progress: number;
  label: string;
  size?: number;
  color: string;
  caption?: string;
}) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`Kalan süre ${label} saniye`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} viewBox="0 0 120 120" style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={60} cy={60} r={r} fill={colors.night} stroke={colors.line} strokeWidth={10} />
        <Circle
          cx={60}
          cy={60}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${c}`}
          strokeDashoffset={c * (1 - progress)}
        />
      </Svg>
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.33, color }}>{label}</Text>
      {caption ? <Text style={{ fontFamily: fonts.body, fontSize: 10, color: colors.muted }}>{caption}</Text> : null}
    </View>
  );
}

export function Thread({ messages }: { messages: Message[] }) {
  const data = [...messages].reverse();
  return (
    <FlatList
      testID="thread"
      inverted
      data={data}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
      style={{ flex: 1 }}
      renderItem={({ item }) =>
        item.from === 'system' ? (
          <Text style={styles.system}>{item.text}</Text>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: item.from === 'me' ? 'flex-end' : 'flex-start' }}>
            <View
              style={[
                styles.bubble,
                { backgroundColor: item.from === 'me' ? colors.volt : colors.surface },
              ]}
            >
              <Text style={{ color: item.from === 'me' ? colors.ink : colors.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 20 }}>
                {item.text}
              </Text>
            </View>
          </View>
        )
      }
    />
  );
}

export function Composer({
  onSend,
  onSnap,
  snapsLeft,
  placeholder,
  disabled,
}: {
  onSend: (text: string) => void;
  onSnap: () => void;
  snapsLeft: number;
  placeholder: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const send = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable
        testID="snap-button"
        accessibilityRole="button"
        accessibilityLabel={snapsLeft > 0 ? 'BlitzSnap: şu anki fotoğrafını gönder, 1 hakkın var' : 'BlitzSnap hakkın kullanıldı'}
        onPress={onSnap}
        disabled={snapsLeft === 0 || disabled}
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: snapsLeft > 0 ? colors.spark : colors.line,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CameraIcon color={snapsLeft > 0 ? colors.ink : colors.muted} />
        {snapsLeft > 0 && (
          <View style={styles.badge}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: colors.ink }}>{snapsLeft}</Text>
          </View>
        )}
      </Pressable>
      <TextInput
        testID="message-input"
        accessibilityLabel="Mesaj yaz"
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={send}
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="send"
        maxLength={280}
        style={styles.input}
      />
      <Pressable
        testID="send-button"
        accessibilityRole="button"
        accessibilityLabel="Gönder"
        onPress={send}
        disabled={disabled}
        style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' }}
      >
        <Bolt size={20} />
      </Pressable>
    </View>
  );
}

export function Chip({ label, color = colors.textSoft, style }: { label: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.night, justifyContent: 'center' }, style]}>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color }}>{label}</Text>
    </View>
  );
}

export const T = {
  h1: { fontFamily: fonts.display, fontSize: 34, color: colors.text, letterSpacing: -1 } as TextStyle,
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, lineHeight: 21 } as TextStyle,
  label: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.muted } as TextStyle,
  strong: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text } as TextStyle,
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted } as TextStyle,
};

const styles = StyleSheet.create({
  system: { textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginVertical: 6, paddingHorizontal: 16 },
  bubble: { maxWidth: '78%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.volt,
    borderWidth: 2,
    borderColor: colors.night,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: 18,
  },
});
