import type { MatchRoom } from './room';
import type { RadarHub } from './hub';

export interface Env {
  DB: D1Database;
  HUB: DurableObjectNamespace<RadarHub>;
  ROOM: DurableObjectNamespace<MatchRoom>;
  /** Test için: Overpass yerine sahte kafe verisi */
  OVERPASS_URL?: string;
  /** Canlıda "eu": Durable Object verileri yalnızca AB'de tutulur. Yerel testte boş (workerd desteklemiyor). */
  DO_JURISDICTION?: string;
}

function scoped<T extends Rpc.DurableObjectBranded | undefined>(env: Env, ns: DurableObjectNamespace<T>): DurableObjectNamespace<T> {
  return env.DO_JURISDICTION === 'eu' ? ns.jurisdiction('eu') : ns;
}

export function hubOf(env: Env) {
  return env.HUB.get(scoped(env, env.HUB).idFromName('global'));
}

export function roomOf(env: Env, matchId: string) {
  return env.ROOM.get(env.ROOM.idFromString(matchId));
}

export function newRoomId(env: Env): string {
  return scoped(env, env.ROOM).newUniqueId().toString();
}

/**
 * Kullanıcıya gösterilebilir hata. Durable Object RPC sınırını geçerken yalnızca mesaj korunduğu için
 * durum ve kod mesajın içine kodlanır: "[409:busy] Şu an başka bir odada".
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public text: string,
  ) {
    super(`[${status}:${code}] ${text}`);
  }

  static from(e: unknown): ApiError {
    if (e instanceof ApiError) return e;
    const msg = String((e as Error)?.message ?? '');
    const m = msg.match(/\[(\d{3}):([\w-]+)\] ([\s\S]*)$/);
    if (m) return new ApiError(Number(m[1]), m[2], m[3]);
    return new ApiError(500, 'internal', 'Sunucu hatası');
  }
}

export interface PublicProfile {
  name: string;
  kind: string;
  color: string;
}
