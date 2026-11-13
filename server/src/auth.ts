/** Anonim cihaz oturumu: rastgele gizli anahtar; veritabanında yalnızca SHA-256 özeti tutulur. */

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function newUserId(): string {
  return 'u_' + b64url(crypto.getRandomValues(new Uint8Array(12)));
}

export async function hashToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7).trim() || null;
  // WebSocket bağlantılarında başlık gönderilemeyebilir; TLS üzerinden sorgu parametresi.
  const q = new URL(req.url).searchParams.get('token');
  return q || null;
}
