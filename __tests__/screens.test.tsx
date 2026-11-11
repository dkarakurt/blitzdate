import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppRoot } from '../src/AppRoot';
import { DemoBackend, DEMO_TIMING } from '../src/backend/demo';
import { demoUsers } from '../src/demo/world';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  addScreenshotListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: jest.fn(),
      renderAsync: () => Promise.resolve({ saveAsync: () => Promise.resolve({ uri: 'file://small.jpg', base64: '/9j/' + 'A'.repeat(200) }) }),
    }),
  },
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
  return { CameraView, useCameraPermissions: () => [{ granted: true, status: 'granted' }, jest.fn()] };
});

function seeded(seed = 11) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let backend: DemoBackend;

async function advance(ms: number) {
  // Kısa beklemelerde ince, uzun beklemelerde kaba adımlarla ilerle.
  const step = ms > 5000 ? 1000 : 250;
  for (let t = 0; t < ms; t += step) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(step, ms - t));
    });
  }
}

jest.setTimeout(60_000);

async function setup() {
  backend = new DemoBackend(seeded());
  await render(<AppRoot services={{ backend, rng: seeded(5) }} />);
  await advance(50);
}

async function register() {
  await setup();
  await fireEvent.press(screen.getByTestId('gender-male'));
  await fireEvent.press(screen.getByTestId('check-adult'));
  await fireEvent.press(screen.getByTestId('check-terms'));
  await fireEvent.press(screen.getByTestId('register'));
  await advance(50);
}

async function goToRadar() {
  await register();
  await fireEvent.press(screen.getByTestId('enter-radar'));
  await advance(50);
  expect(screen.getByTestId('screen-radar')).toBeTruthy();
}

async function goToRoom() {
  await goToRadar();
  await fireEvent.press(screen.getByTestId('strike-button'));
  await advance(DEMO_TIMING.strikeAcceptMs + 100);
  expect(screen.getByTestId('screen-strike')).toBeTruthy();
  await advance(DEMO_TIMING.strikeCountdownMs + 300);
  expect(screen.getByTestId('screen-room')).toBeTruthy();
}

async function goToChat() {
  await goToRoom();
  await advance(90_500);
  expect(screen.getByTestId('screen-decision')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('vote-continue'));
  await advance(DEMO_TIMING.voteAfterRoomMs + 200);
  expect(screen.getByTestId('screen-chat')).toBeTruthy();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  backend?.dispose();
  jest.useRealTimers();
});

describe('Ekranlar (uçtan uca, demo sunucuya karşı)', () => {
  test('kayıt: cinsiyet + 18 yaş + koşullar zorunlu; benzersiz hayvan atanır, bir kez yeniden çekilir', async () => {
    await setup();
    expect(screen.getByText(/Sadece sen\./)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('gender-male'));
    expect(screen.getByTestId('register').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('check-adult'));
    expect(screen.getByTestId('register').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('check-terms'));
    await fireEvent.press(screen.getByTestId('register'));
    await advance(50);
    const first = screen.getByTestId('my-name').props.children;
    expect(demoUsers().some((u) => u.identity.name === first)).toBe(false);
    await fireEvent.press(screen.getByTestId('reroll'));
    await advance(50);
    expect(screen.getByTestId('my-name').props.children).not.toBe(first);
    expect(screen.getByText('Hayvanın belli oldu')).toBeTruthy();
  });

  test('koşullar ve KVKK metni kayıt sırasında okunabilir, seçimler korunur', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('gender-female'));
    await fireEvent.press(screen.getByText('KVKK Aydınlatma Metni'));
    expect(screen.getByTestId('legal-text').props.children).toMatch(/KVKK/);
    await fireEvent.press(screen.getByTestId('legal-close'));
    expect(screen.queryByTestId('legal-text')).toBeNull();
    expect(screen.getByTestId('gender-female').props.accessibilityState.selected).toBe(true);
  });

  test('radar: yalnızca 1 km içindeki çevrimiçi karşı cins; bana çarpan önce', async () => {
    await goToRadar();
    expect(screen.getByText('5 kadın')).toBeTruthy();
    expect(screen.getByTestId('selected-name').props.children).toBe('Uykucu Tilki');
    expect(screen.getByText(/sana çarptı!/)).toBeTruthy();
    expect(screen.queryByTestId('radar-demo-5')).toBeNull(); // menzil dışı
    expect(screen.queryByTestId('radar-demo-6')).toBeNull(); // çevrimdışı
    expect(screen.queryByTestId('radar-demo-7')).toBeNull(); // aynı cins
  });

  test('BlitzRoom: mesaj, karşı tarafın cevabı, buzkıranı sohbete gönderme', async () => {
    await goToRoom();
    await fireEvent.changeText(screen.getByTestId('message-input'), 'Kenar yenir!');
    await fireEvent.press(screen.getByTestId('send-button'));
    await advance(50);
    expect(screen.getByText('Kenar yenir!')).toBeTruthy();
    await advance(DEMO_TIMING.replyMs + 50);
    expect(screen.getByText('Haha, kabul.')).toBeTruthy();
    const q = screen.getByTestId('icebreaker').props.children;
    await fireEvent.press(screen.getByTestId('send-icebreaker'));
    await advance(50);
    expect(screen.getAllByText(q).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('icebreaker').props.children).not.toBe(q);
  });

  test('karar: ikisi de Devam → süre duvarı yıkılır', async () => {
    await goToChat();
    expect(screen.getByText('İkiniz de Devam dediniz. Artık süre yok.')).toBeTruthy();
    expect(screen.getByText(/Süre duvarı yıkıldı/)).toBeTruthy();
  });

  test('karar: Veda et → oda kapanır, kişi radardan kaybolur', async () => {
    await goToRoom();
    await advance(90_500);
    await fireEvent.press(screen.getByTestId('vote-leave'));
    await advance(50);
    expect(screen.getByTestId('screen-closed')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back-to-radar'));
    await advance(50);
    expect(screen.getByText('4 kadın')).toBeTruthy();
    expect(screen.queryByTestId('radar-demo-0')).toBeNull();
  });

  test('karar: kimse oy vermezse süre dolar', async () => {
    await goToRoom();
    // demo karşı taraf oy vermesin
    (backend as unknown as { partnerVote: () => void }).partnerVote = () => {};
    await advance(90_000 + 10_000 + 4_000);
    expect(screen.getByTestId('screen-closed')).toBeTruthy();
    expect(screen.getByTestId('closed-text').props.children).toMatch(/Süre doldu/);
  });

  test('BlitzMeet: yalnızca yakın kafeler; seçim sohbete mesaj olarak düşer', async () => {
    await goToChat();
    await fireEvent.press(screen.getByTestId('meet-now'));
    await advance(50);
    expect(screen.getByTestId('screen-meet')).toBeTruthy();
    expect(screen.getByTestId('cafe-v1')).toBeTruthy();
    expect(screen.queryByTestId('cafe-v4')).toBeNull();
    await fireEvent.press(screen.getByTestId('cafe-v2'));
    await fireEvent.press(screen.getByTestId('meet-going'));
    await advance(50);
    expect(screen.getByText('Haber verildi! Görüşürsünüz')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('meet-back'));
    expect(screen.getByText(/Köşe Kafe \(demo\) — oraya geliyorum/)).toBeTruthy();
  });

  test('BlitzSnap (alıcı): açılınca sunucudan silinir, 5 sn görünür', async () => {
    await goToChat();
    await advance(DEMO_TIMING.snapAfterChatMs + 100);
    await fireEvent.press(screen.getByTestId('open-snap'));
    await advance(50);
    expect(screen.getByTestId('screen-snapView')).toBeTruthy();
    expect(screen.getByText(/Canlı çekim/)).toBeTruthy();
    await advance(5200);
    expect(screen.getByTestId('snap-gone')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('snap-close'));
    expect(screen.getByTestId('screen-chat')).toBeTruthy();
    expect(screen.queryByTestId('open-snap')).toBeNull();
  });

  test('BlitzSnap (gönderen): canlı kamera → küçült → gönder; hak biter', async () => {
    await goToRoom();
    await fireEvent.press(screen.getByTestId('snap-button'));
    expect(screen.getByTestId('screen-snapCapture')).toBeTruthy();
    expect(screen.getByText('Galeri yok')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shutter'));
    await advance(50);
    await fireEvent.press(screen.getByTestId('play-snap'));
    await advance(50);
    await fireEvent.press(screen.getByTestId('snap-done'));
    expect(screen.getByTestId('screen-room')).toBeTruthy();
    expect(screen.getByText(/kozunu oynadın/)).toBeTruthy();
    expect(screen.getByLabelText('BlitzSnap hakkın kullanıldı')).toBeTruthy();
  });

  test('İkinci Şans: kibar veda gönderilir, oda kapanır', async () => {
    await goToChat();
    await fireEvent.press(screen.getByTestId('open-farewell'));
    expect(screen.getByText(/Uykucu Tilki'ye şu mesaj gidecek/)).toBeTruthy();
    const t1 = screen.getByTestId('farewell-text').props.children;
    await fireEvent.press(screen.getByTestId('farewell-next'));
    expect(screen.getByTestId('farewell-text').props.children).not.toBe(t1);
    await fireEvent.press(screen.getByTestId('farewell-send'));
    await advance(50);
    expect(screen.getByTestId('screen-closed')).toBeTruthy();
    expect(screen.getByText(/Kibar vedan iletildi/)).toBeTruthy();
  });

  test('şikayet: neden seçilir, kişi engellenir, oda kapanır ve radarda görünmez', async () => {
    await goToRoom();
    await fireEvent.press(screen.getByTestId('open-report'));
    expect(screen.getByTestId('report-send').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('reason-harassment'));
    await fireEvent.press(screen.getByTestId('report-send'));
    await advance(50);
    expect(screen.getByTestId('screen-closed')).toBeTruthy();
    expect(screen.getByText(/Şikayetin alındı/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back-to-radar'));
    await advance(50);
    expect(screen.queryByTestId('radar-demo-0')).toBeNull();
  });

  test('profil: hesabı sil onayla → kayıt ekranına dönülür', async () => {
    await goToRadar();
    await fireEvent.press(screen.getByTestId('open-profile'));
    expect(screen.getByTestId('screen-profile')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('delete-account'));
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    await advance(50);
    expect(screen.getByTestId('screen-onboarding')).toBeTruthy();
    expect(screen.getByTestId('check-adult')).toBeTruthy();
  });
});
