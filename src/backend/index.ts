import { DemoBackend } from './demo';
import { firebaseConfigFromEnv, LiveBackend } from './live';
import type { Backend } from './types';

/** Firebase ayarları derlemeye eklenmişse canlı sunucu, yoksa demo. */
export function createBackend(): Backend {
  const config = firebaseConfigFromEnv();
  return config ? new LiveBackend(config) : new DemoBackend();
}

export type { Backend } from './types';
