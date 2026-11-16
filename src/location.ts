import { useEffect } from 'react';
import { AppState as RNAppState } from 'react-native';
import * as Location from 'expo-location';
import type { Backend } from './backend/types';
import type { Action } from './state/app';
import type { GeoPoint } from './logic/radar';
import { breadcrumb, reportError } from './crash';

/**
 * Konum yalnızca uygulama ön plandayken alınır ve sunucuya yazılır.
 * Uygulama arka plana geçince konum kaydı silinir (radarda görünmezsin).
 *
 * Not: Android'de izin istemek (izin zaten verilmiş olsa bile) görünmez bir pencere açar ve
 * uygulama bir anlığına "arka plana" geçer. Bu yüzden:
 *  - izin yalnızca BİR KEZ istenir; sonraki başlatmalarda sadece kontrol edilir,
 *  - kısa arka plan geçişleri yok sayılır; konum ancak 5 sn'den uzun arka planda kapatılır.
 * Her başlatma bir "tur" numarası alır; durdurulan turun geç gelen sonuçları yok sayılır.
 */
const BACKGROUND_GRACE_MS = 5000;
export function usePresence(backend: Backend, active: boolean, dispatch: (a: Action) => void) {
  useEffect(() => {
    if (backend.mode !== 'live' || !active) return;
    let watch: Location.LocationSubscription | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let last: GeoPoint | null = null;
    let round = 0;
    let running = false;
    let disposed = false;
    let asked = false;
    let pendingStop: ReturnType<typeof setTimeout> | null = null;

    const push = (p: GeoPoint | null) => backend.updatePresence(p).catch(() => {});

    const start = async () => {
      if (running || disposed) return;
      running = true;
      const my = ++round;
      const current = () => my === round && !disposed;
      try {
        let perm = await Location.getForegroundPermissionsAsync().catch(() => null);
        if (perm && perm.status !== 'granted' && perm.canAskAgain && !asked) {
          asked = true;
          breadcrumb('konum: izin soruluyor');
          perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
        }
        if (!current()) return;
        breadcrumb(`konum izni: ${perm?.status ?? 'hata'}${perm?.android?.accuracy ? ' / ' + perm.android.accuracy : ''}`);
        if (!perm || perm.status !== 'granted') {
          breadcrumb('konum: izin yok');
          dispatch({ type: 'LOCATION', status: 'denied' });
          running = false;
          return;
        }
        dispatch({ type: 'LOCATION', status: 'granted' });
        breadcrumb('konum: ilk konum alınıyor');
        const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (!current()) return;
        breadcrumb(first ? 'konum: ilk konum alındı' : 'konum: ilk konum alınamadı');
        if (first) {
          breadcrumb(`konum doğruluğu: ~${Math.round(first.coords.accuracy ?? -1)} m`);
          last = { lat: first.coords.latitude, lng: first.coords.longitude };
          push(last);
        }
        breadcrumb('konum: takip başlıyor');
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 30_000 },
          (pos) => {
            last = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            push(last);
          },
        ).catch((e) => {
          reportError(e, false, 'watchPositionAsync');
          return null;
        });
        if (!current()) {
          sub?.remove();
          return;
        }
        watch = sub;
        breadcrumb('konum: takip açık');
        // Sunucu 3 dakikadan eski konumu "çevrimdışı" sayar; dururken de tazele.
        heartbeat = setInterval(() => last && push(last), 60_000);
      } catch (e) {
        reportError(e, false, 'usePresence');
        running = false;
      }
    };

    const stop = () => {
      round++;
      watch?.remove();
      watch = null;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (running) push(null);
      running = false;
    };

    const cancelPendingStop = () => {
      if (pendingStop) clearTimeout(pendingStop);
      pendingStop = null;
    };

    start();
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') {
        cancelPendingStop();
        start();
      } else if (s === 'background' && !pendingStop) {
        pendingStop = setTimeout(() => {
          pendingStop = null;
          breadcrumb('konum: arka planda, kapatılıyor');
          stop();
        }, BACKGROUND_GRACE_MS);
      }
    });
    return () => {
      disposed = true;
      cancelPendingStop();
      sub.remove();
      stop();
    };
  }, [backend, active, dispatch]);
}
