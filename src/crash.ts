/**
 * Hata raporlama (teşhis için).
 * Yakalanmamış JS hataları sunucuya gönderilir: mesaj, yığın izi ve son birkaç adım.
 * Konum, mesaj içeriği ya da kimlik bilgisi gönderilmez.
 */
import { AppState, Platform } from 'react-native';
import appConfig from '../app.json';

const crumbs: string[] = [];
let installed = false;

/**
 * TEŞHİS MODU: adımlar birkaç saniyede bir sunucuya da yazılır.
 * Böylece uygulama yerel kodda çökse bile son adım görülebilir. Sorun çözülünce kapatılacak.
 */
const TRACE_UPLOAD = true;
const session = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
let outbox: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushTrace() {
  flushTimer = null;
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url || !outbox.length) return;
  const lines = outbox.slice(0, 50);
  outbox = outbox.slice(50);
  fetch(url.replace(/\/+$/, '') + '/v1/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, lines, appVersion: appConfig.expo.version, platform: `${Platform.OS} ${Platform.Version}` }),
  }).catch(() => {});
  if (outbox.length) flushTimer = setTimeout(flushTrace, 500);
}

/** Son adımları hafızada tutar (en fazla 20) */
export function breadcrumb(step: string) {
  const line = `${new Date().toISOString().slice(11, 23)} ${step}`;
  crumbs.push(line);
  if (crumbs.length > 20) crumbs.shift();
  if (TRACE_UPLOAD && process.env.EXPO_PUBLIC_API_URL) {
    outbox.push(line);
    if (outbox.length > 200) outbox = outbox.slice(-200);
    if (!flushTimer) flushTimer = setTimeout(flushTrace, 1500);
  }
}

export function reportError(e: unknown, fatal: boolean, context?: string): Promise<void> {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) return Promise.resolve();
  const err = e instanceof Error ? e : new Error(String(e));
  const body = {
    message: `${err.name}: ${err.message}`.slice(0, 1000),
    stack: [err.stack ?? '', '--- son adımlar ---', ...crumbs].join('\n').slice(0, 6000),
    context: context?.slice(0, 500),
    fatal,
    appVersion: appConfig.expo.version,
    platform: `${Platform.OS} ${Platform.Version}`,
  };
  return fetch(url.replace(/\/+$/, '') + '/v1/crash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(() => undefined)
    .catch(() => undefined);
}

/** Yakalanmamış hataları sunucuya gönderir; ölümcül hatada kapanmadan önce gönderimi bekler. */
export function installCrashReporter() {
  if (installed) return;
  installed = true;
  breadcrumb(`uygulama açıldı (v${appConfig.expo.version}, ${Platform.OS} ${Platform.Version})`);
  AppState.addEventListener('change', (st) => {
    breadcrumb('uygulama durumu: ' + st);
    if (st !== 'active') flushTrace();
  });
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void };
  };
  const eu = g.ErrorUtils;
  if (!eu) return;
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    const done = reportError(e, !!fatal, 'global');
    if (!fatal) return previous(e, fatal);
    // Raporun gitmesi için en fazla 2,5 sn bekle, sonra varsayılan davranış
    let called = false;
    const finish = () => {
      if (called) return;
      called = true;
      previous(e, fatal);
    };
    done.then(finish);
    setTimeout(finish, 2500);
  });
}
