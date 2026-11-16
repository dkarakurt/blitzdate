/**
 * Hata raporlama (teşhis için).
 * Yakalanmamış JS hataları sunucuya gönderilir: mesaj, yığın izi ve son birkaç adım.
 * Konum, mesaj içeriği ya da kimlik bilgisi gönderilmez.
 */
import { Platform } from 'react-native';
import appConfig from '../app.json';

const crumbs: string[] = [];
let installed = false;

/** Son adımları hafızada tutar (en fazla 20) */
export function breadcrumb(step: string) {
  crumbs.push(`${new Date().toISOString().slice(11, 19)} ${step}`);
  if (crumbs.length > 20) crumbs.shift();
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
