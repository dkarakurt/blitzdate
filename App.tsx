import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { AppRoot } from './src/AppRoot';
import { colors } from './src/ui/theme';

export default function App() {
  const [loaded] = useFonts({
    // Fink logosunun fontu. Hazır pakette Türkçe harfler yok; assets/fonts altındaki sürüme eklendi (OFL 1.1).
    Fredoka_500Medium: require('./assets/fonts/Fredoka-Medium.ttf'),
    Fredoka_600SemiBold: require('./assets/fonts/Fredoka-SemiBold.ttf'),
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  return (
    <SafeAreaProvider>
      {loaded ? <AppRoot /> : <View style={{ flex: 1, backgroundColor: colors.night }} />}
    </SafeAreaProvider>
  );
}
