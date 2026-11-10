import React, { useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { validateSnap, type CapturedPhoto } from '../logic/snap';
import { Btn, Chip, T } from '../ui/components';
import { Bolt, CameraIcon, Glyph } from '../ui/icons';
import { dative } from '../logic/turkish';
import { colors, fonts } from '../ui/theme';
import type { ScreenProps } from './types';

const ERRORS = {
  'not-live-camera': 'Sadece şu an çekilen fotoğraf gönderilebilir.',
  'too-old': 'Bu kare artık "şu an" değil. Yeniden çek.',
  'no-snaps-left': 'Bu sohbetteki kozunu zaten oynadın.',
} as const;

/**
 * BlitzSnap çekimi: galeri seçicisi bilinçli olarak yok. Fotoğraf yalnızca bu ekrandaki
 * canlı kameradan gelir; gönderim anında yaşı kontrol edilir.
 */
export function SnapCapture({ state, dispatch }: ScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const cam = useRef<CameraView>(null);
  const partnerName = state.partner?.identity.name ?? '';

  const shoot = async () => {
    if (!cam.current || !ready) return;
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.6, shutterSound: false });
      setPhoto({ uri: pic.uri, source: 'camera', capturedAt: Date.now() });
      setError(null);
    } catch {
      setError('Kamera fotoğraf çekemedi, tekrar dene.');
    }
  };

  const send = () => {
    if (!photo) return;
    const err = validateSnap(photo, state.snapsSent, Date.now());
    if (err) {
      setError(ERRORS[err]);
      if (err === 'too-old') setPhoto(null);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <View style={{ flex: 1, padding: 28, alignItems: 'center', gap: 16 }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.spark, alignItems: 'center', justifyContent: 'center', marginTop: 100 }}>
          <CameraIcon size={60} check />
        </View>
        <Text style={[T.h1, { textAlign: 'center' }]}>Koz oynandı.</Text>
        <Text style={[T.body, { textAlign: 'center', maxWidth: 290 }]}>
          BlitzSnap'in {dative(partnerName)} ulaştı. Açtığı an 5 saniye görecek, sonra sonsuza dek silinecek.
        </Text>
        <View style={{ flex: 1 }} />
        <Btn testID="snap-done" label="Sohbete dön" big onPress={() => dispatch({ type: 'SNAP_SENT', now: Date.now() })} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, padding: 28, justifyContent: 'center', gap: 16 }}>
        <Text style={T.h1}>Kamera izni gerekli</Text>
        <Text style={T.body}>BlitzSnap yalnızca o an çekilen fotoğrafla çalışır. Galeriye erişmiyoruz.</Text>
        <Btn label="Kameraya izin ver" big onPress={requestPermission} />
        <Btn label="Vazgeç" variant="ghost" onPress={() => dispatch({ type: 'CANCEL_SNAP' })} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.surface2 }}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={{ flex: 1 }} resizeMode="cover" accessibilityLabel="Az önce çekilen kare" />
        ) : (
          <CameraView ref={cam} style={{ flex: 1 }} facing={facing} onCameraReady={() => setReady(true)} />
        )}
        <View style={{ position: 'absolute', left: 16, right: 16, top: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kapat, sohbete dön"
            onPress={() => dispatch({ type: 'CANCEL_SNAP' })}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center' }}
          >
            <Glyph name="close" size={20} strokeWidth={2.4} />
          </Pressable>
          <View style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.night, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.spark }} />
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, color: colors.text }}>BLITZSNAP · CANLI</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kamerayı çevir"
            disabled={!!photo}
            onPress={() => {
              setReady(false);
              setFacing((f) => (f === 'front' ? 'back' : 'front'));
            }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center', opacity: photo ? 0.4 : 1 }}
          >
            <Glyph name="flip" size={20} />
          </Pressable>
        </View>
        <View style={{ position: 'absolute', top: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Chip label="Galeri yok" />
          <Chip label="Filtre yok" />
          <Chip label="Sadece şu an" color={colors.volt} />
        </View>
      </View>

      <View style={{ backgroundColor: colors.night, padding: 20, paddingBottom: 28, alignItems: 'center', gap: 14 }}>
        {error ? <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.spark, textAlign: 'center' }}>{error}</Text> : null}
        {!photo ? (
          <>
            <Text style={[T.body, { textAlign: 'center' }]}>
              {partnerName} bunu yalnızca <Text style={{ color: colors.text, fontFamily: fonts.bodySemi }}>5 saniye</Text> görecek. Bu sohbetteki tek kozun.
            </Text>
            <Pressable
              testID="shutter"
              accessibilityRole="button"
              accessibilityLabel="Fotoğraf çek"
              onPress={shoot}
              disabled={!ready}
              style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: colors.paper, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center', opacity: ready ? 1 : 0.5 }}
            >
              <Bolt size={30} />
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[T.body, { textAlign: 'center' }]}>Bu kare şimdi çekildi. Gönderince 5 saniye görünür, sonra silinir.</Text>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
              <Btn label="Yeniden çek" variant="outline" onPress={() => setPhoto(null)} style={{ flex: 1, height: 60, borderRadius: 30 }} />
              <Btn testID="play-snap" label="Kozu oyna" variant="spark" big onPress={send} style={{ flex: 1.4, height: 60 }} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}
