# Fink — Canlıya geçiş rehberi

Uygulama, Firebase ayarları derlemeye eklenince **canlı sunucuya** bağlanır; eklenmezse **demo modunda** çalışır.
Aşağıdaki adımlar bir kez yapılır. Sonrasında `main` dalına gelen her değişiklikte GitHub sunucuyu ve APK'yı otomatik günceller.

## 1. Firebase projesi

1. https://console.firebase.google.com → **Proje oluştur** (ör. `fink-app`). Google Analytics gerekmez.
2. Sol altta **Spark → Yükselt → Blaze**. Faturalandırma hesabı bağla.
   - **Bütçe uyarısı kur:** Google Cloud → Faturalandırma → Bütçeler ve uyarılar → ör. aylık 5 $ ve %50/%90/%100 e-posta uyarısı. (Blaze'de kesin harcama sınırı yoktur; uyarı şarttır.)
3. **Authentication** → Başlayın → Oturum açma yöntemi → **Anonim** → Etkinleştir.
4. **Firestore Database** → Veritabanı oluştur → **Üretim modu** → konum: **eur3 (europe-west)**.
   (Cloud Functions `europe-west1` bölgesinde çalışır.)
5. **Proje ayarları → Genel → Uygulamalarınız → Web (</>)** → takma ad "Fink" → Kaydet.
   Gösterilen yapılandırmadan şu 4 değeri not al: `apiKey`, `projectId`, `appId`, `messagingSenderId`.

## 2. Dağıtım için hizmet hesabı

1. https://console.cloud.google.com → aynı projeyi seç → **IAM ve Yönetici → Hizmet hesapları → Hizmet hesabı oluştur**: `github-deploy`.
2. Rolleri ver:
   - **Düzenleyici** (Editor)
   - **Cloud Functions Yöneticisi** (Cloud Functions Admin)
   - **Cloud Run Yöneticisi** (Cloud Run Admin)
3. Hesaba tıkla → **Anahtarlar → Anahtar ekle → JSON**. İnen dosyayı kimseyle paylaşma.

## 3. GitHub gizli değişkenleri

https://github.com/dkarakurt/blitzdate → **Settings → Secrets and variables → Actions → New repository secret**:

| Ad | Değer |
|---|---|
| `FIREBASE_PROJECT_ID` | `projectId` |
| `FIREBASE_API_KEY` | `apiKey` |
| `FIREBASE_APP_ID` | `appId` |
| `FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `FIREBASE_SERVICE_ACCOUNT` | JSON anahtar dosyasının **tüm içeriği** |

## 4. Yayına al

1. **Actions → Sunucu (Firebase) → Run workflow**: testler + Firestore kuralları, indeksler ve Cloud Functions dağıtılır (ilk seferde ~10 dk).
2. **Actions → Android APK → Run workflow**: canlı sunucuya bağlı APK derlenir.
3. İki telefonla dene: biri "Kadın", biri "Erkek" seçsin, birbirine 1 km'den yakın olsun.

## Sunucu ne yapıyor

| Fonksiyon | Görev |
|---|---|
| `register`, `reroll` | 18+ ve koşul onayıyla kayıt; benzersiz "Sıfat + Hayvan" ismi |
| `nearby` | 1 km içindeki, son 3 dk'da görülen karşı cins; engellenenler ve meşguller hariç; mesafe yuvarlanır |
| `strike` | Karşılıklı çarpmada oda açar (3,5 sn sayaç + 90 sn oda + 10 sn karar) |
| `vote` | İkisi de "Devam" → sonsuz sohbet; biri ayrılırsa/süre biterse oda kapanır |
| `sendSnap`, `openSnap` | Eşleşme başına tek canlı fotoğraf; açıldığı an sunucudan silinir |
| `meetSuggestions` | İki kişiye de ≤700 m halka açık kafeler (OpenStreetMap) |
| `farewell`, `block`, `report` | Kibar veda; engelleme; şikayet (+ engelleme) |
| `deleteAccount` | Hesap, isim, konum ve ilgili kayıtları siler |
| `cleanup` (10 dk'da bir) | Süresi geçen odalar, eski konumlar, açılmamış snap'ler (24 sa), 30 günlük kapanmış sohbetler |

## Moderasyon

Şikayetler Firestore'da **`reports`** koleksiyonuna düşer (`reason`, `by`, `target`, `matchId`, `status: open`).
Şimdilik Firebase konsolundan takip edilir; ciddi vakalarda kullanıcının `users/{uid}` belgesi ve Authentication kaydı silinerek hesap kapatılır.
"18 yaşından küçük olabilir" şikayetleri öncelikli incelenmeli.

## Google Play'e yüklemeden önce

- **Gizlilik politikası URL'si** ve **hesap silme URL'si** (Play Console, Veri güvenliği formu). Uygulama içindeki KVKK metni bir web sayfasında da yayınlanmalı.
- Uygulama içi metinlerdeki `[ŞİRKET UNVANI]`, `[ADRES]`, `[İLETİŞİM E-POSTASI]` alanları doldurulmalı; metinler bir hukukçuya kontrol ettirilmeli (özellikle KVKK m.9 yurt dışı aktarım).
- İçerik derecelendirmesi: flört uygulaması, 18+.
- Kalıcı bir imza anahtarı (şu anki APK test anahtarıyla imzalı) ve `production` profilinde AAB.
