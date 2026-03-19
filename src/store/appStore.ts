// src/store/appStore.ts

export type SubtractionHistoryState = {
  sessions: any[];
  uid: string | null;
  counter: number | null;
  loadedOnce: boolean;
  loading: boolean;
  error: string | null;
  lastLoadedAt?: string;
};

export type AppStoreState = {
  history: {
    subtraction: SubtractionHistoryState;
  };
};

export type AppStoreAction =
  | { type: 'SUB_HISTORY_LOADING'; payload: boolean }
  | { type: 'SUB_HISTORY_ERROR'; payload: string | null }
  | { type: 'SUB_HISTORY_SET_UID'; payload: string | null }
  | { type: 'SUB_HISTORY_SET_SESSIONS'; payload: any[] }
  | { type: 'SUB_HISTORY_SET_COUNTER'; payload: number | null }
  | { type: 'SUB_HISTORY_SET_LOADED_ONCE'; payload: boolean };

export const initialAppStoreState: AppStoreState = {
  history: {
    subtraction: {
      sessions: [],
      uid: null,
      counter: null,
      loadedOnce: false,
      loading: false,
      error: null,
      lastLoadedAt: undefined,
    },
  },
};

export function appStoreReducer(state: AppStoreState, action: AppStoreAction): AppStoreState {
  switch (action.type) {
    case 'SUB_HISTORY_LOADING':
      return {
        ...state,
        history: {
          ...state.history,
          subtraction: {
            ...state.history.subtraction,
            loading: action.payload,
          },
        },
      };
    case 'SUB_HISTORY_ERROR':
      return {
        ...state,
        history: {
          ...state.history,
          subtraction: {
            ...state.history.subtraction,
            error: action.payload,
          },
        },
      };
    case 'SUB_HISTORY_SET_UID':
      return {
        ...state,
        history: {
          ...state.history,
          subtraction: {
            ...state.history.subtraction,
            uid: action.payload,
          },
        },
      };
    case 'SUB_HISTORY_SET_SESSIONS':
      return {
        ...state,
        history: {
          ...state.history,
          subtraction: {
            ...state.history.subtraction,
            sessions: action.payload,
            lastLoadedAt: new Date().toISOString(),
          },
        },
      };
    case 'SUB_HISTORY_SET_COUNTER':
      return {
        ...state,
        history: {
          ...state.history,
          subtraction: {
            ...state.history.subtraction,
            counter: action.payload,
          },
        },
      };
    case 'SUB_HISTORY_SET_LOADED_ONCE':
      return {
        ...state,
        history: {
          ...state.history,
          subtraction: {
            ...state.history.subtraction,
            loadedOnce: action.payload,
          },
        },
      };
    default:
      return state;
  }
}

export function selectSubHistory(state: AppStoreState): SubtractionHistoryState {
  return state.history.subtraction;
}

export function selectSubHistorySessions(state: AppStoreState): any[] {
  return state.history.subtraction.sessions;
}

export function selectSubHistoryCounter(state: AppStoreState): number | null {
  return state.history.subtraction.counter;
}

export function selectSubHistoryLoadedOnce(state: AppStoreState): boolean {
  return state.history.subtraction.loadedOnce;
}
