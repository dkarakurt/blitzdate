import * as SecureStore from 'expo-secure-store';
import { DemoBackend } from './demo';
import { LiveBackend, setLiveErrorSink, type TokenStore } from './live';
import type { Backend } from './types';
import { breadcrumb, reportError } from '../crash';

setLiveErrorSink((e, ctx) => reportError(e, false, ctx));

const KEY = 'fink.session';

/** Oturum anahtarı telefonun güvenli deposunda (Android Keystore / iOS Keychain) tutulur. */
const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (t) => SecureStore.setItemAsync(KEY, t),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

/** Sunucu adresi derlemeye eklenmişse canlı sunucu (Cloudflare), yoksa demo. */
export function createBackend(): Backend {
  const url = process.env.EXPO_PUBLIC_API_URL;
  return url ? new LiveBackend(url, secureTokenStore, breadcrumb) : new DemoBackend();
}

export type { Backend } from './types';
