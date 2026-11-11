/** Sunucu hata mesajlarını kullanıcıya gösterilebilir Türkçe metne çevirir. */
export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? '';
  if (code.includes('unavailable') || code.includes('network')) return 'Bağlantı yok. İnternetini kontrol et.';
  if (code.includes('unauthenticated')) return 'Oturum süresi doldu. Uygulamayı yeniden aç.';
  const msg = err?.message?.replace(/^.*?: /, '');
  return msg && msg.length < 120 ? msg : 'Bir şeyler ters gitti. Tekrar dene.';
}

