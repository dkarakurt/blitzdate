// @firebase/auth'un React Native derlemesi getReactNativePersistence'ı dışa aktarır, ancak paketin
// "types" koşulu önce eşleştiği için TypeScript bunu görmez. Çalışma anında Metro RN derlemesini kullanır.
import type { Persistence } from '@firebase/auth';

declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
