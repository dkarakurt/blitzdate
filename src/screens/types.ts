import type React from 'react';
import type { NameRegistry } from '../logic/names';
import type { RadarUser } from '../logic/radar';
import type { Action, AppState } from '../state/app';

export interface Services {
  registry: NameRegistry;
  users: RadarUser[];
  rng: () => number;
}

export interface ScreenProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  services: Services;
}
