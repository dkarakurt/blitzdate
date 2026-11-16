import React from 'react';
import { AppState } from 'react-native';
import { render, act } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { usePresence } from '../src/location';
import type { Backend } from '../src/backend/types';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

const L = Location as jest.Mocked<typeof Location>;

function Probe({ backend }: { backend: Backend }) {
  usePresence(backend, true, () => {});
  return null;
}

describe('konum (usePresence)', () => {
  let appStateHandler: (s: string) => void = () => {};
  let presence: (unknown | null)[] = [];
  const backend = { mode: 'live', updatePresence: jest.fn(async (p: unknown) => void presence.push(p)) } as unknown as Backend;

  beforeEach(() => {
    jest.useFakeTimers();
    presence = [];
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, h) => {
      appStateHandler = h as (s: string) => void;
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    L.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 41, longitude: 29, accuracy: 10 } } as never);
    L.watchPositionAsync.mockResolvedValue({ remove: jest.fn() } as never);
  });

  test('izin zaten verilmişse hiç sorulmaz; kısa arka plan geçişleri konumu kapatmaz', async () => {
    L.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true } as never);
    await render(<Probe backend={backend} />);
    await act(async () => {});
    expect(L.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(presence).toEqual([{ lat: 41, lng: 29 }]);

    // Android'in izin penceresi gibi: saniyede birkaç kez arka plan ↔ ön plan
    for (let i = 0; i < 10; i++) {
      await act(async () => appStateHandler('background'));
      await act(async () => jest.advanceTimersByTime(100));
      await act(async () => appStateHandler('active'));
    }
    await act(async () => jest.advanceTimersByTime(6000));
    expect(presence).not.toContain(null);
    expect(L.watchPositionAsync).toHaveBeenCalledTimes(1);
  });

  test('izin bir kez sorulur; gerçek arka planda (5 sn+) konum silinir, dönünce yeniden açılır', async () => {
    L.getForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true } as never);
    L.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true } as never);
    await render(<Probe backend={backend} />);
    await act(async () => {});
    expect(L.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);

    L.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true } as never);
    await act(async () => appStateHandler('background'));
    await act(async () => jest.advanceTimersByTime(5500));
    expect(presence[presence.length - 1]).toBeNull();

    await act(async () => appStateHandler('active'));
    await act(async () => {});
    expect(presence[presence.length - 1]).toEqual({ lat: 41, lng: 29 });
    expect(L.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});
