// src/lib/subtractionHistoryCache.ts

import type { Dispatch } from 'react';
import type { AppStoreAction, AppStoreState } from '../store/appStore';
import { getSubtractionCount } from './userCounterService';
import { listSubtractionSessions } from './subtractionHistoryStorage';

function parseSessionDate(session: any): number {
  const dateStr: unknown = session?.submittedAt ?? session?.createdAt;
  if (typeof dateStr === 'string') {
    const t = Date.parse(dateStr);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function compareSessionNewestFirst(a: any, b: any): number {
  const ta = parseSessionDate(a);
  const tb = parseSessionDate(b);
  if (ta !== tb) return tb - ta;

  const ida = String(a?.sessionId ?? '');
  const idb = String(b?.sessionId ?? '');
  if (ida === idb) return 0;
  return idb.localeCompare(ida);
}

export async function ensureSubtractionHistoryUpToDate(params: {
  uid: string;
  getState: () => AppStoreState;
  dispatch: Dispatch<AppStoreAction>;
}): Promise<void> {
  const { uid, getState, dispatch } = params;

  dispatch({ type: 'SUB_HISTORY_LOADING', payload: true });
  dispatch({ type: 'SUB_HISTORY_ERROR', payload: null });

  let remoteCount = 0;
  try {
    remoteCount = await getSubtractionCount(uid);
  } catch (e) {
    console.error('Failed to load subtraction counter:', e);
    dispatch({ type: 'SUB_HISTORY_ERROR', payload: 'Failed to load history counter' });
    dispatch({ type: 'SUB_HISTORY_LOADING', payload: false });
    return;
  }

  const state = getState();
  const local = state.history.subtraction;
  const localUid = local.uid;
  const localCount = local.counter;
  const localLoadedOnce = local.loadedOnce;
  const localHasData = local.sessions.length > 0;

  if (localLoadedOnce && localHasData && localUid === uid && localCount === remoteCount) {
    dispatch({ type: 'SUB_HISTORY_SET_COUNTER', payload: remoteCount });
    dispatch({ type: 'SUB_HISTORY_LOADING', payload: false });
    return;
  }

  try {
    dispatch({ type: 'SUB_HISTORY_SET_UID', payload: uid });
    const sessions = await listSubtractionSessions(uid);
    const sorted = sessions.slice().sort(compareSessionNewestFirst);

    dispatch({ type: 'SUB_HISTORY_SET_SESSIONS', payload: sorted });
    dispatch({ type: 'SUB_HISTORY_SET_COUNTER', payload: remoteCount });
    dispatch({ type: 'SUB_HISTORY_SET_LOADED_ONCE', payload: true });
  } catch (e) {
    console.error('Failed to load subtraction history from storage:', e);
    dispatch({ type: 'SUB_HISTORY_ERROR', payload: 'Failed to load session history' });
  } finally {
    dispatch({ type: 'SUB_HISTORY_LOADING', payload: false });
  }
}
