/** Hayvan isimlerine Türkçe ek getirme (ünlü uyumu): "Tilki'ye", "Baykuş'un" gibi. */

const VOWELS = 'aeıioöuüAEIİOÖUÜ';

function lastVowel(word: string): string {
  for (let i = word.length - 1; i >= 0; i--) {
    if (VOWELS.includes(word[i])) return word[i].toLocaleLowerCase('tr');
  }
  return 'e';
}

function endsWithVowel(word: string): boolean {
  return VOWELS.includes(word[word.length - 1]);
}

/** Yönelme hâli (-e/-a): Tilki'ye, Vaşak'a */
export function dative(name: string): string {
  const v = lastVowel(name);
  const back = 'aıou'.includes(v);
  const suffix = back ? 'a' : 'e';
  return `${name}'${endsWithVowel(name) ? 'y' : ''}${suffix}`;
}

/** İlgi hâli (-in/-ın/-un/-ün): Tilki'nin, Baykuş'un */
export function genitive(name: string): string {
  const v = lastVowel(name);
  const map: Record<string, string> = { a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' };
  return `${name}'${endsWithVowel(name) ? 'n' : ''}${map[v] ?? 'in'}`;
}
