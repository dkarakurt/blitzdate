import React, { useEffect, useReducer } from 'react';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { initialState, isExpired, reducer, screenOf, type AppState } from './state/app';
import { usePresence } from './location';
import { useNow } from './ui/components';
import { colors } from './ui/theme';
import type { Services } from './screens/types';
import { Onboarding } from './screens/Onboarding';
import { Radar } from './screens/Radar';
import { Strike } from './screens/Strike';
import { Room } from './screens/Room';
import { Decision } from './screens/Decision';
import { Chat } from './screens/Chat';
import { Meet } from './screens/Meet';
import { Closed, Farewell } from './screens/Farewell';
import { SnapCapture } from './screens/SnapCapture';
import { SnapView } from './screens/SnapView';
import { Legal, ProfileSheet, Report } from './screens/Safety';

export function AppRoot({ services, initial = initialState }: { services: Services; initial?: AppState }) {
  const { backend } = services;
  const [state, dispatch] = useReducer(reducer, initial);
  const now = useNow(250);
  const screen = screenOf(state, now);
  const signedIn = !!state.profile && state.enteredRadar;
  const matchId = state.match?.id ?? null;

  // Oturumu geri yükle
  useEffect(() => {
    let alive = true;
    backend
      .restore()
      .then((p) => alive && dispatch({ type: 'BOOTED', profile: p }))
      .catch(() => alive && dispatch({ type: 'BOOTED', profile: null }));
    return () => {
      alive = false;
    };
  }, [backend]);

  // Konum (yalnızca canlı modda ve uygulama açıkken)
  usePresence(backend, signedIn, dispatch);

  // Aktif eşleşme
  useEffect(() => {
    if (!signedIn) return;
    return backend.onActiveMatch((m) => dispatch({ type: 'MATCH', match: m }));
  }, [backend, signedIn]);

  // Odanın mesajları ve gelen snap
  useEffect(() => {
    if (!matchId) return;
    const a = backend.onMessages(matchId, (messages) => dispatch({ type: 'MESSAGES', messages }));
    const b = backend.onIncomingSnap(matchId, (snap) => dispatch({ type: 'INCOMING_SNAP', snap }));
    return () => {
      a();
      b();
    };
  }, [backend, matchId]);

  // Karar penceresi sunucu kapatmadan geçtiyse odayı kapalı say
  const expired = isExpired(state.match, now);
  useEffect(() => {
    if (expired) dispatch({ type: 'MATCH_EXPIRED' });
  }, [expired]);

  // Android geri tuşu
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (state.overlay === 'legal' || state.overlay === 'profile' || state.overlay === 'meet' || state.overlay === 'farewell' || state.overlay === 'report' || state.overlay === 'snapCapture') {
        dispatch({ type: 'CLOSE_OVERLAY' });
        return true;
      }
      if (screen === 'closed') {
        dispatch({ type: 'DISMISS_CLOSED' });
        return true;
      }
      // Oda sürerken ve snap açıkken geri tuşu çıkarmaz
      return screen === 'strike' || screen === 'room' || screen === 'decision' || screen === 'snapView' || screen === 'chat';
    });
    return () => sub.remove();
  }, [state.overlay, screen]);

  const props = { state, dispatch, services, now };
  let body: React.ReactNode;
  switch (screen) {
    case 'loading':
      body = (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.volt} />
        </View>
      );
      break;
    case 'onboarding': body = <Onboarding {...props} />; break;
    case 'radar': body = <Radar {...props} />; break;
    case 'strike': body = <Strike {...props} />; break;
    case 'room': body = <Room {...props} />; break;
    case 'decision': body = <Decision {...props} />; break;
    case 'chat': body = <Chat {...props} />; break;
    case 'meet': body = <Meet {...props} />; break;
    case 'farewell': body = <Farewell {...props} />; break;
    case 'report': body = <Report {...props} />; break;
    case 'profile': body = <ProfileSheet {...props} />; break;
    case 'closed': body = <Closed state={state} dispatch={dispatch} />; break;
    case 'snapCapture': body = <SnapCapture {...props} />; break;
    case 'snapView': body = <SnapView {...props} />; break;
    default: body = null;
  }

  const bg = screen === 'strike' ? colors.volt : colors.night;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'bottom']}>
      <StatusBar style={screen === 'strike' ? 'dark' : 'light'} />
      <View style={{ flex: 1 }} testID={`screen-${screen}`}>
        {body}
      </View>
      {state.overlay === 'legal' ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} testID="screen-legal">
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.night }} edges={['top', 'bottom']}>
            <Legal state={state} dispatch={dispatch} />
          </SafeAreaView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
