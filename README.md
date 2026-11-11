# fink. (v0.1 — demo)

Anonim, anlık, 90 saniyelik çöpçatan uygulaması. Expo (React Native + TypeScript).

**Marka:** tavşan logosu, sarı `#FFFF00` + gece laciverti `#14122B`, başlık fontu Fredoka (Türkçe harfler eklenmiş sürüm `assets/fonts/`, OFL 1.1), metin fontu Inter.

## Bu sürümde ne var

| Ekran | Durum |
|---|---|
| Giriş: cinsiyet + benzersiz "Sıfat + Hayvan" kimliği, bir kez yeniden çekme | ✅ |
| Radar: yalnızca karşı cins, çevrimiçi, 1 km içi; yaklaşık mesafe | ✅ (demo kişiler) |
| Strike → 90 sn BlitzRoom (yazılı) + AI buzkıran soruları, "Sohbete gönder" butonu | ✅ (sorular yerel listeden) |
| Devam kararı (ikisi de "Devam" → sonsuz sohbet, yoksa oda kapanır) | ✅ |
| BlitzMeet: ikinize de yürüme mesafesindeki (≤700 m) halka açık kafeler | ✅ (demo kafeler) — indirim/masa kodu bir sonraki sürümde |
| İkinci Şans: kibar veda şablonları | ✅ |
| BlitzSnap: yalnızca canlı kamera, 5 sn görüntüleme, eşleşme başına 1 hak | ✅ gerçek kamera; Android'de ekran görüntüsü engeli |

**Canlı / demo:** Firebase ayarları derlemeye eklendiyse uygulama gerçek konum ve gerçek kişilerle çalışır (`src/backend/live.ts`, sunucu `functions/`). Ayar yoksa cihaz içi demo sunucu kullanılır (`src/backend/demo.ts`). Kurulum: [docs/CANLIYA-GECIS.md](docs/CANLIYA-GECIS.md).

## APK alma

Bu projeyi APK'ya çevirmenin üç yolu var:

**1. Expo bulut derlemesi (en kolay, Android Studio gerekmez)**
```bash
npm install
npx eas-cli@latest login          # ücretsiz Expo hesabı
npx eas-cli@latest build -p android --profile preview
```
Derleme bitince terminal bir indirme linki/QR kodu verir; telefondan açıp APK'yı kur.

**2. GitHub Actions**
Projeyi bir GitHub deposuna gönder. `.github/workflows/android-apk.yml` her push'ta testleri çalıştırır, APK'yı derler ve "Actions → blitzdate-apk (Fink APK)" altında indirilebilir bırakır.

**3. Kendi bilgisayarında (Android Studio + JDK 17 kurulu)**
```bash
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# çıktı: android/app/build/outputs/apk/release/app-release.apk
```

> Not: 2. ve 3. yoldaki APK, test için hata ayıklama anahtarıyla imzalanır. Play Store için `production` profili (AAB) ve kalıcı bir imza anahtarı gerekir.

## Geliştirme

```bash
npm install
npm test            # 41 test: kurallar, akış, ekranlar
npm run typecheck
npx expo run:android   # cihaz/emülatörde geliştirme sürümü
```

## Yapı

```
src/backend/    Sunucu arayüzü: live (Firebase) ve demo
functions/      Cloud Functions (europe-west1) + birim testleri
firestore.rules Güvenlik kuralları (testleri: rules-tests/, emülatörle)
src/logic/      Saf kurallar (isimler, radar, oda/karar, snap, meet, veda, Türkçe ekler)
src/state/      Uygulama durum makinesi (reducer)
src/demo/       Demo dünyası ve simüle karşı taraf
src/screens/    10 ekran
src/ui/         Tema, ikonlar (logo + 8 hayvan), ortak bileşenler
__tests__/      Birim, akış ve uçtan uca ekran testleri
```

## Bilinen sınırlar

- **iOS'ta ekran görüntüsü engellenemez**, yalnızca algılanır (uygulama kullanıcıyı uyarır). Android'de engellenir. Başka bir telefonla ekranı fotoğraflamak hiçbir platformda engellenemez.
- Canlı çekim garantisi şu an uygulama içinde (galeri seçici yok + 60 sn yaş kontrolü). Sunucu tarafında cihaz doğrulaması (Play Integrity / App Attest) backend ile gelecek.
- Kafeler örnek veridir; gerçek kafe verisi (harita servisi) backend ile bağlanacak.
- Klavye: `react-native-keyboard-controller` ile yazı alanı klavyenin üstünde kalır.
