/** İkinci Şans: ghosting yerine sistemin hazırladığı kibar bir veda. */

export const FAREWELL_TEMPLATES: ReadonlyArray<string> = [
  'Harika bir sohbetti ama kimyamızın tam uyuşmadığını düşünüyorum, bol şans!',
  'Seninle yazışmak keyifliydi ama burada ayrılmak en doğrusu gibi. Kendine iyi bak!',
  'Güzel bir sohbetti, teşekkürler. Yollarımız burada ayrılsın, bol şans!',
];

export function farewellMessage(index: number): string {
  const n = FAREWELL_TEMPLATES.length;
  return FAREWELL_TEMPLATES[((index % n) + n) % n];
}
