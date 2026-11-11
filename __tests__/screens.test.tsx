import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppRoot } from '../src/AppRoot';
import { demoRegistry, demoUsers } from '../src/demo/world';
import { DEMO_TIMING } from '../src/demo/usePartner';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  addScreenshotListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props: { onCameraReady?: () => void }, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: jest.fn(() => Promise.resolve({ uri: 'file://snap.jpg', width: 10, height: 10 })),
    }));
    React.useEffect(() => {
      props.onCameraReady?.();
    }, []);
    return <View testID="camera" />;
  });
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true, status: 'granted' }, jest.fn()],
  };
});

function seeded(seed = 11) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function setup() {
  const services = { registry: demoRegistry(seeded()), users: demoUsers(), rng: seeded(5) };
  return await render(<AppRoot services={services} />);
}

async function advance(ms: number) {
  // Küçük adımlarla ilerlet: efektlerin kurduğu yeni zamanlayıcılar da çalışsın.
  for (let t = 0; t < ms; t += 250) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(250, ms - t));
    });
  }
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function goToRoom() {
  await setup();
  await fireEvent.press(screen.getByTestId('gender-male'));
  await fireEvent.press(screen.getByTestId('enter-radar'));
  await fireEvent.press(screen.getByTestId('strike-button'));
  await advance(1000);
  expect(screen.getByTestId('screen-strike')).toBeTruthy();
  await advance(3100);
  expect(screen.getByTestId('screen-room')).toBeTruthy();
}

async function goToChat() {
  await goToRoom();
  await advance(90_500);
  expect(screen.getByTestId('screen-decision')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('vote-continue'));
  await advance(DEMO_TIMING.voteMs + 100);
  expect(screen.getByTestId('screen-chat')).toBeTruthy();
}

describe('Ekranlar (uçtan uca, demo modu)', () => {
  test('giriş: cinsiyet seçilir, benzersiz hayvan atanır, bir kez yeniden çekilir', async () => {
    await setup();
    expect(screen.getByText(/Sadece sen\./)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('gender-male'));
    const first = screen.getByTestId('my-name').props.children;
    expect(demoUsers().some((u) => u.identity.name === first)).toBe(false);
    await fireEvent.press(screen.getByTestId('reroll'));
    const second = screen.getByTestId('my-name').props.children;
    expect(second).not.toBe(first);
    expect(screen.getByText('Hayvanın belli oldu')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('enter-radar'));
    expect(screen.getByTestId('screen-radar')).toBeTruthy();
  });

  test('radar: erkek kullanıcı yalnızca 1 km içindeki 5 çevrimiçi kadını görür', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('gender-male'));
    await fireEvent.press(screen.getByTestId('enter-radar'));
    expect(screen.getByText('5 kadın')).toBeTruthy();
    expect(screen.getByTestId('selected-name').props.children).toBe('Uykucu Tilki');
    expect(screen.queryByTestId('radar-demo-5')).toBeNull(); // menzil dışı
    expect(screen.queryByTestId('radar-demo-6')).toBeNull(); // çevrimdışı
    expect(screen.queryByTestId('radar-demo-7')).toBeNull(); // aynı cins
    await fireEvent.press(screen.getByTestId('radar-demo-1'));
    expect(screen.getByTestId('selected-name').props.children).toBe('Gizemli Baykuş');
  });

  test('BlitzRoom: mesajlaşma, karşı taraf cevabı ve buzkıran', async () => {
    await goToRoom();
    expect(screen.getByText('90')).toBeTruthy();
    const q1 = screen.getByTestId('icebreaker').props.children;
    await fireEvent.press(screen.getByTestId('next-icebreaker'));
    const q2 = screen.getByTestId('icebreaker').props.children;
    expect(q2).not.toBe(q1);
    // "Sohbete gönder": soru doğrudan sohbete düşer, yerine yeni soru gelir
    await fireEvent.press(screen.getByTestId('send-icebreaker'));
    expect(screen.getAllByText(q2).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('icebreaker').props.children).not.toBe(q2);
    await advance(DEMO_TIMING.replyMs + 50);
    await fireEvent.changeText(screen.getByTestId('message-input'), 'Kenar yenir!');
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(screen.getByText('Kenar yenir!')).toBeTruthy();
    await advance(DEMO_TIMING.replyMs + 50);
    expect(screen.getByText('Bunu tartışmamız lazım ama süre yetmez.')).toBeTruthy();
    await advance(30_000);
    const label: string = screen.getByLabelText(/Kalan süre/).props.accessibilityLabel;
    const left = Number(label.match(/\d+/)![0]);
    expect(left).toBeGreaterThanOrEqual(57);
    expect(left).toBeLessThanOrEqual(60);
  });

  test('karar: iki taraf Devam der → süre duvarı yıkılır', async () => {
    await goToChat();
    expect(screen.getByText('İkiniz de Devam dediniz. Artık süre yok.')).toBeTruthy();
    expect(screen.getByText(/Süre duvarı yıkıldı/)).toBeTruthy();
  });

  test('karar: Veda et → oda kapanır, kişi radardan kaybolur', async () => {
    await goToRoom();
    await advance(90_500);
    await fireEvent.press(screen.getByTestId('vote-leave'));
    expect(screen.getByTestId('screen-closed')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back-to-radar'));
    expect(screen.getByText('4 kadın')).toBeTruthy();
    expect(screen.queryByTestId('radar-demo-0')).toBeNull();
  });

  test('BlitzMeet: yalnızca yakın kafeler, kod/indirim yok', async () => {
    await goToChat();
    await fireEvent.press(screen.getByTestId('meet-now'));
    expect(screen.getByTestId('screen-meet')).toBeTruthy();
    expect(screen.getByTestId('cafe-v1')).toBeTruthy();
    expect(screen.getByTestId('cafe-v2')).toBeTruthy();
    expect(screen.queryByTestId('cafe-v4')).toBeNull();
    expect(screen.queryByText(/kod/i)).toBeNull();
    expect(screen.queryByText(/indirim/i)).toBeNull();
    await fireEvent.press(screen.getByTestId('cafe-v2'));
    expect(screen.getByTestId('cafe-v2').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId('meet-going'));
    expect(screen.getByText('Yoldasın! Görüşürsünüz')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('meet-back'));
    expect(screen.getByTestId('screen-chat')).toBeTruthy();
  });

  test('BlitzSnap (alıcı): 5 saniye görünür, sonra silinir ve tekrar açılamaz', async () => {
    await goToChat();
    await advance(DEMO_TIMING.snapAfterChatMs + 100);
    await fireEvent.press(screen.getByTestId('open-snap'));
    expect(screen.getByTestId('screen-snapView')).toBeTruthy();
    expect(screen.getByText(/Canlı çekim/)).toBeTruthy();
    await advance(5200);
    expect(screen.getByTestId('snap-gone')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('snap-close'));
    expect(screen.getByTestId('screen-chat')).toBeTruthy();
    expect(screen.queryByTestId('open-snap')).toBeNull();
  });

  test('BlitzSnap (gönderen): canlı kameradan çek, kozu oyna, hak biter', async () => {
    await goToRoom();
    await fireEvent.press(screen.getByTestId('snap-button'));
    expect(screen.getByTestId('screen-snapCapture')).toBeTruthy();
    expect(screen.getByText('Galeri yok')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shutter'));
    await fireEvent.press(screen.getByTestId('play-snap'));
    await fireEvent.press(screen.getByTestId('snap-done'));
    expect(screen.getByTestId('screen-room')).toBeTruthy();
    expect(screen.getByText(/kozunu oynadın/)).toBeTruthy();
    expect(screen.getByLabelText('BlitzSnap hakkın kullanıldı')).toBeTruthy();
  });

  test('İkinci Şans: kibar veda seçilir, gönderilir, oda kapanır', async () => {
    await goToChat();
    await fireEvent.press(screen.getByTestId('open-farewell'));
    expect(screen.getByText(/Uykucu Tilki'ye şu mesaj gidecek/)).toBeTruthy();
    const t1 = screen.getByTestId('farewell-text').props.children;
    await fireEvent.press(screen.getByTestId('farewell-next'));
    expect(screen.getByTestId('farewell-text').props.children).not.toBe(t1);
    await fireEvent.press(screen.getByTestId('farewell-send'));
    expect(screen.getByTestId('screen-closed')).toBeTruthy();
    expect(screen.getByText(/Kibar vedan iletildi/)).toBeTruthy();
  });
});
