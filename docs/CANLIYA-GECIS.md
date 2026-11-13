# Canlıya geçiş: Cloudflare

Fink'in sunucusu Cloudflare'de çalışır. Kart bilgisi gerekmez; ücretsiz plan sınırı aşılırsa fatura çıkmaz, o gün için istekler reddedilir.

| Parça | Ne yapar | Nerede |
|---|---|---|
| **Worker** (`fink-api`) | HTTPS API ve WebSocket girişi | `server/src/index.ts` |
| **D1** (`fink-db`, SQLite) | Hesaplar (anonim) ve şikayetler | `server/migrations/` |
| **RadarHub** (Durable Object) | Kim çevrimiçi, kim nerede, çarpmalar, engeller, eşleşme bildirimi | `server/src/hub.ts` |
| **MatchRoom** (Durable Object, eşleşme başına bir tane) | 90 sn oda, mesajlar, oylar, BlitzSnap | `server/src/room.ts` |

Veriler AB'de durur: D1 Batı Avrupa'da (`weur`) açılır, Durable Object'ler AB yargı alanına (`eu`) kilitlidir.

## Senin yapacakların (bir kez, ~10 dakika)

### 1. Cloudflare hesabı
1. https://dash.cloudflare.com/sign-up adresinden ücretsiz hesap aç (alan adı gerekmez).
2. Soldan **Workers & Pages**'e bir kez gir. Cloudflare sana `xxx.workers.dev` alt alan adı seçtirir; bunu onayla. Sunucunun adresi `https://fink-api.xxx.workers.dev` olacak.
3. Aynı sayfada sağ tarafta **Account ID** yazar; kopyala.

### 2. API anahtarı (token)
1. Sağ üstte profil → **My Profile → API Tokens → Create Token**.
2. **Edit Cloudflare Workers** şablonunu seç → **Use template**.
3. İzinlere bir satır ekle: **Account → D1 → Edit**.
4. **Account Resources:** kendi hesabın. **Zone Resources:** All zones (alan adın yoksa önemli değil).
5. **Continue to summary → Create Token**. Çıkan anahtarı kopyala (bir daha gösterilmez).

### 3. GitHub'a iki gizli değer ekle
Depo → **Settings → Secrets and variables → Actions → New repository secret**:

| Ad | Değer |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 2. adımdaki anahtar |
| `CLOUDFLARE_ACCOUNT_ID` | 1. adımdaki Account ID |

### 4. Yayınla ve APK al
1. **Actions → Sunucu (Cloudflare) → Run workflow**. Testleri çalıştırır, veritabanını oluşturur, sunucuyu yayınlar ve sonunda "Sunucu yayında: https://fink-api.….workers.dev" yazar.
2. Ardından **Actions → Android APK → Run workflow**. Sunucu adresini Cloudflare'den kendisi bulur ve APK'yı **canlı** modda derler (adım çıktısında "Canlı sürüm derleniyor" yazar).
3. APK'yı iki telefona kur, ikisinde de konum iznini ver, birbirine 1 km'den yakın olun: radarda birbirinizi görürsünüz.

Sonraki her push'ta sunucu ve APK kendiliğinden güncellenir.

> Kendi alan adını kullanmak istersen (örn. `api.fink.app`) Worker'a özel alan adı bağla ve depo ayarlarında **Variables** altında `FINK_API_URL` değişkenine bu adresi yaz. APK derlemesi önce bunu kullanır.

## Ücretsiz plan neye yeter?

| Kaynak | Günlük ücretsiz | Fink'te kabaca kullanım |
|---|---|---|
| Worker isteği | 100.000 | Radardaki kişi başına dakikada ~5 istek |
| Durable Object isteği | 100.000 | Her API çağrısı ve WebSocket mesajı |
| D1 okuma / yazma | 5 milyon / 100.000 | Her istekte 1 okuma (oturum kontrolü) |

Yaklaşık **günde birkaç yüz aktif kullanıcıya** kadar ücretsiz plan yeter. Sınıra yaklaşınca Workers Paid planına (aylık 5 $) geçmek yeterli; kod değişmez.

## Şikayetleri inceleme (moderasyon)

Cloudflare paneli → **Storage & Databases → D1 → fink-db → Console**:

```sql
-- açık şikayetler
SELECT r.id, r.reason, r.note, r.at, u.name AS sikayet_edilen
FROM reports r JOIN users u ON u.id = r.target
WHERE r.status = 'open' ORDER BY r.at DESC;

-- incelendi olarak işaretle
UPDATE reports SET status = 'closed' WHERE id = '…';

-- bir hesabı kapat (oturumu geçersiz olur, radardan düşer)
DELETE FROM users WHERE id = '…';
```

## Yerelde çalıştırma (geliştirici)

```bash
cd server
npm ci
npm test                                   # 24 test (gerçek Workers çalışma ortamında)
npx wrangler d1 migrations apply fink-db --local
npm run dev -- --var DO_JURISDICTION:      # http://127.0.0.1:8787
npm run e2e:build && node e2e/out.mjs http://127.0.0.1:8787   # uygulamanın istemci koduyla uçtan uca
```

Uygulamayı yerel sunucuya bağlamak için: `EXPO_PUBLIC_API_URL=http://<bilgisayarın-IP'si>:8787 npx expo run:android`.

## Henüz yapılmayanlar

- Uygulama kapalıyken eşleşme bildirimi (push) yok; radar zaten yalnızca uygulama açıkken çalışıyor.
- Cihaz doğrulaması (Play Integrity / App Attest) yok; BlitzSnap'in canlı çekim kontrolü uygulama içinde.
- Hız sınırlama Cloudflare'in varsayılan korumasına bırakıldı; kötüye kullanım görülürse Worker'a eklenir.
