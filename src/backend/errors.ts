/** Sunucu ve ağ hatalarını kullanıcıya gösterilebilir Türkçe metne çevirir. */

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function friendlyError(e: unknown): string {
  if (e instanceof ApiClientError) {
    if (e.status === 401) return 'Oturum süresi doldu. Uygulamayı yeniden aç.';
    if (e.status >= 500 && !e.message) return 'Sunucuda bir sorun var. Biraz sonra tekrar dene.';
    return e.message || 'Bir şeyler ters gitti. Tekrar dene.';
  }
  const msg = (e as Error)?.message ?? '';
  if (/cancel|aborted|timeout|timed out/i.test(msg)) return 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.';
  if (/network|failed to fetch|fetch failed|unable to resolve|connect/i.test(msg)) return 'Bağlantı yok. İnternetini kontrol et.';
  return msg && msg.length < 120 ? msg : 'Bir şeyler ters gitti. Tekrar dene.';
}
