/**
 * Google Play için sürüm imzası ve sürüm kodu.
 *
 * - FINK_UPLOAD_STORE_FILE ortam değişkeni varsa release derlemesi bu yükleme anahtarıyla imzalanır
 *   (şifreler FINK_UPLOAD_STORE_PASSWORD / FINK_UPLOAD_KEY_ALIAS / FINK_UPLOAD_KEY_PASSWORD).
 *   Yoksa eskisi gibi hata ayıklama anahtarıyla imzalanır (yalnızca test APK'sı için).
 * - FINK_VERSION_CODE varsa versionCode olarak kullanılır: Play her yüklemede daha büyük bir sayı ister.
 *
 * android/ klasörü her derlemede prebuild ile yeniden üretildiği için bu ayar eklenti olarak tutulur.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING = `
        release {
            if (System.getenv("FINK_UPLOAD_STORE_FILE")) {
                storeFile file(System.getenv("FINK_UPLOAD_STORE_FILE"))
                storePassword System.getenv("FINK_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("FINK_UPLOAD_KEY_ALIAS")
                keyPassword System.getenv("FINK_UPLOAD_KEY_PASSWORD")
            }
        }`;

function apply(gradle) {
  if (gradle.includes('FINK_UPLOAD_STORE_FILE')) return gradle;

  // 1) signingConfigs içine release ekle
  if (!/signingConfigs\s*\{/.test(gradle)) throw new Error('withReleaseSigning: signingConfigs bloğu bulunamadı');
  gradle = gradle.replace(/signingConfigs\s*\{/, (m) => m + RELEASE_SIGNING);

  // 2) release derleme türü: anahtar varsa release imzası
  const re = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
  if (!re.test(gradle)) throw new Error('withReleaseSigning: release derleme türünde signingConfig bulunamadı');
  gradle = gradle.replace(re, '$1signingConfig System.getenv("FINK_UPLOAD_STORE_FILE") ? signingConfigs.release : signingConfigs.debug');

  // 3) sürüm kodu
  gradle = gradle.replace(/versionCode\s+(\d+)/, 'versionCode((System.getenv("FINK_VERSION_CODE") ?: "$1") as Integer)');
  return gradle;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = apply(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.apply = apply;
