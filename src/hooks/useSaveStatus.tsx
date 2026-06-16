/* eslint-disable react-refresh/only-export-components -- provider + hook co-located by design */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusContextValue {
  state: SaveState;
  /**
   * Run a persistence task while reflecting its progress in the shared save
   * indicator. On failure the error is logged and surfaced (status + toast),
   * and `undefined` is returned so callers can react without a try/catch.
   */
  track: <T>(work: () => Promise<T>) => Promise<T | undefined>;
}

const SaveStatusContext = createContext<SaveStatusContextValue | null>(null);

export function SaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SaveState>('idle');
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(0);

  const scheduleIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (pending.current === 0) setState('idle');
    }, 1600);
  }, []);

  const track = useCallback<SaveStatusContextValue['track']>(
    async (work) => {
      pending.current += 1;
      setState('saving');
      if (idleTimer.current) clearTimeout(idleTimer.current);
      try {
        const result = await work();
        pending.current -= 1;
        if (pending.current === 0) {
          setState('saved');
          scheduleIdle();
        }
        return result;
      } catch (err) {
        pending.current -= 1;
        // Never swallow: log the real error and surface it two ways.
        console.error('保存に失敗しました', err);
        setState('error');
        toast.error('保存に失敗しました。もう一度お試しください。');
        return undefined;
      }
    },
    [scheduleIdle],
  );

  const value = useMemo<SaveStatusContextValue>(() => ({ state, track }), [state, track]);

  return <SaveStatusContext.Provider value={value}>{children}</SaveStatusContext.Provider>;
}

export function useSaveStatus(): SaveStatusContextValue {
  const ctx = useContext(SaveStatusContext);
  if (!ctx) throw new Error('useSaveStatus は SaveStatusProvider の内側で使用してください');
  return ctx;
}
