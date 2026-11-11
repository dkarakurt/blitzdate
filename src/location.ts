import { useEffect } from 'react';
import { AppState as RNAppState } from 'react-native';
import * as Location from 'expo-location';
import type { Backend } from './backend/types';
import type { Action } from './state/app';
import type { GeoPoint } from './logic/radar';

/**
 * Konum yalnızca uygulama ön plandayken alınır ve sunucuya yazılır.
 * Uygulama arka plana geçince konum kaydı silinir (radarda görünmezsin).
 */
export function usePresence(backend: Backend, active: boolean, dispatch: (a: Action) => void) {
  useEffect(() => {
    if (backend.mode !== 'live' || !active) return;
    let watch: Location.LocationSubscription | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let last: GeoPoint | null = null;
    let running = false;
    let disposed = false;

    const push = (p: GeoPoint | null) => backend.updatePresence(p).catch(() => {});

    const start = async () => {
      if (running || disposed) return;
      running = true;
      const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (!perm || perm.status !== 'granted') {
        dispatch({ type: 'LOCATION', status: 'denied' });
        running = false;
        return;
      }
      dispatch({ type: 'LOCATION', status: 'granted' });
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (first && !disposed) {
        last = { lat: first.coords.latitude, lng: first.coords.longitude };
        push(last);
      }
      watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 30_000 },
        (pos) => {
          last = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          push(last);
        },
      ).catch(() => null);
      // Sunucu 3 dakikadan eski konumu "çevrimdışı" sayar; dururken de tazele.
      heartbeat = setInterval(() => last && push(last), 60_000);
    };

    const stop = () => {
      watch?.remove();
      watch = null;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      running = false;
      push(null);
    };

    start();
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') start();
      else if (s === 'background') stop();
    });
    return () => {
      disposed = true;
      sub.remove();
      stop();
    };
  }, [backend, active, dispatch]);
}
