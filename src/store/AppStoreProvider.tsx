// src/store/AppStoreProvider.tsx

import React, { createContext, useContext, useMemo, useReducer, useRef } from 'react';
import type { Dispatch } from 'react';
import {
  appStoreReducer,
  initialAppStoreState,
  type AppStoreAction,
  type AppStoreState,
} from './appStore';

type AppStoreContextValue = {
  state: AppStoreState;
  dispatch: Dispatch<AppStoreAction>;
  getState: () => AppStoreState;
};

const AppStoreContext = createContext<AppStoreContextValue | undefined>(undefined);

export const AppStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appStoreReducer, initialAppStoreState);

  const stateRef = useRef<AppStoreState>(state);
  stateRef.current = state;

  const getState = useMemo(() => {
    return () => stateRef.current;
  }, []);

  const value = useMemo<AppStoreContextValue>(() => {
    return { state, dispatch, getState };
  }, [state, dispatch, getState]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
};

export function useAppStore(): AppStoreContextValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) {
    throw new Error('useAppStore must be used within AppStoreProvider');
  }
  return ctx;
}
