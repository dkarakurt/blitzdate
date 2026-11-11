import type React from 'react';
import type { Backend } from '../backend/types';
import type { Action, AppState } from '../state/app';

export interface Services {
  backend: Backend;
  rng: () => number;
}

export interface ScreenProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  services: Services;
  now: number;
}
