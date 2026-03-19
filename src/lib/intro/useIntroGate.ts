import { useCallback, useMemo, useState } from 'react';

type IntroGate = {
  showIntro: boolean;
  markDone: () => void;
};

const SEEN_KEY = 'introSeen';

function safeGetSessionItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetSessionItem(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function useIntroGate(): IntroGate {
  const initiallySeen = useMemo(() => safeGetSessionItem(SEEN_KEY) === '1', []);
  const [showIntro, setShowIntro] = useState<boolean>(() => !initiallySeen);

  const markDone = useCallback(() => {
    safeSetSessionItem(SEEN_KEY, '1');
    setShowIntro(false);
  }, []);

  return { showIntro, markDone };
}
