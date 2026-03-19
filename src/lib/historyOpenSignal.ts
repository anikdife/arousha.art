export type HistoryOpenCompleteListener = (sessionId: string) => void;

const listeners = new Set<HistoryOpenCompleteListener>();

export function subscribeHistoryOpenComplete(listener: HistoryOpenCompleteListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function signalHistoryOpenComplete(sessionId: string): void {
  if (!sessionId) return;
  // Copy to avoid issues if a listener unsubscribes while iterating.
  for (const listener of Array.from(listeners)) {
    try {
      listener(sessionId);
    } catch {
      // ignore listener errors
    }
  }
}
