import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { reportError } from '../crash';
import { colors, fonts } from './theme';

interface State {
  error: Error | null;
}

/** Ekran çizimi sırasında hata olursa uygulamayı kapatmak yerine hatayı gösterir ve sunucuya bildirir. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, true, `render${info.componentStack ? ': ' + info.componentStack.trim().split('\n').slice(0, 4).join(' | ') : ''}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: colors.night, padding: 24, paddingTop: 64 }}>
        <Text style={{ color: colors.volt, fontFamily: fonts.display, fontSize: 24, marginBottom: 12 }}>Bir şeyler ters gitti</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 15, marginBottom: 16 }}>
          Hata kaydı ekibe gönderildi. Uygulamayı kapatıp yeniden açabilirsin.
        </Text>
        <ScrollView style={{ flex: 1 }}>
          <Text selectable style={{ color: colors.muted, fontSize: 12 }}>
            {String(this.state.error?.stack ?? this.state.error)}
          </Text>
        </ScrollView>
      </View>
    );
  }
}
