import type { Env as FinkEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends FinkEnv {}
  }
}
