import React, { useEffect, useMemo, useReducer } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { demoRegistry, demoUsers } from './demo/world';
import { useDemoPartner } from './demo/usePartner';
import { initialState, reducer, type AppState } from './state/app';
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

export function AppRoot({ services: injected, initial = initialState }: { services?: Services; initial?: AppState }) {
  const services = useMemo<Services>(
    () => injected ?? { registry: demoRegistry(), users: demoUsers(), rng: Math.random },
    [injected],
  );
  const [state, dispatch] = useReducer(reducer, initial);
  useDemoPartner(state, dispatch);

  // Android geri tuşu: akışın mantıklı bir önceki adımına döner.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      switch (state.screen) {
        case 'snapCapture':
          dispatch({ type: 'CANCEL_SNAP' });
          return true;
        case 'meet':
        case 'farewell':
          dispatch({ type: 'BACK_TO_CHAT' });
          return true;
        case 'closed':
          dispatch({ type: 'ENTER_RADAR' });
          return true;
        case 'snapView':
          if (state.incomingSnap?.state === 'deleted') dispatch({ type: 'CLOSE_SNAP_VIEW' });
          return true;
        case 'strike':
        case 'room':
        case 'decision':
          return true; // süre işlerken geri tuşu odadan çıkarmaz
        default:
          return false;
      }
    });
    return () => sub.remove();
  }, [state.screen, state.incomingSnap?.state]);

  const props = { state, dispatch, services };
  let screen: React.ReactNode;
  switch (state.screen) {
    case 'onboarding': screen = <Onboarding {...props} />; break;
    case 'radar': screen = <Radar {...props} />; break;
    case 'strike': screen = <Strike {...props} />; break;
    case 'room': screen = <Room {...props} />; break;
    case 'decision': screen = <Decision {...props} />; break;
    case 'chat': screen = <Chat {...props} />; break;
    case 'meet': screen = <Meet {...props} />; break;
    case 'farewell': screen = <Farewell {...props} />; break;
    case 'closed': screen = <Closed state={state} dispatch={dispatch} />; break;
    case 'snapCapture': screen = <SnapCapture {...props} />; break;
    case 'snapView': screen = <SnapView {...props} />; break;
  }

  const bg = state.screen === 'strike' ? colors.volt : colors.night;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'bottom']}>
      <StatusBar style={state.screen === 'strike' ? 'dark' : 'light'} />
      <View style={{ flex: 1 }} testID={`screen-${state.screen}`}>
        {screen}
      </View>
    </SafeAreaView>
  );
}
