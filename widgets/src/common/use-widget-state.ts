import { useCallback, useState, type SetStateAction } from 'react';
import { useOpenAiGlobal } from './use-openai-global';
import type { UnknownObject } from './types';

/**
 * React hook for bidirectional state sync with ChatGPT host.
 * State changes are persisted to window.openai.setWidgetState.
 *
 * @param defaultState - Initial state value or factory function
 * @returns Tuple of [state, setState] similar to useState
 */
export function useWidgetState<T extends UnknownObject>(
  defaultState: T | (() => T)
): readonly [T, (state: SetStateAction<T>) => void];
export function useWidgetState<T extends UnknownObject>(
  defaultState?: T | (() => T | null) | null
): readonly [T | null, (state: SetStateAction<T | null>) => void];
export function useWidgetState<T extends UnknownObject>(
  defaultState?: T | (() => T | null) | null
): readonly [T | null, (state: SetStateAction<T | null>) => void] {
  const widgetStateFromWindow = useOpenAiGlobal('widgetState') as T;

  const [widgetState, _setWidgetState] = useState<T | null>(() => {
    if (widgetStateFromWindow != null) {
      return widgetStateFromWindow;
    }

    return typeof defaultState === 'function'
      ? defaultState()
      : (defaultState ?? null);
  });

  const setWidgetState = useCallback((state: SetStateAction<T | null>) => {
    _setWidgetState((prevState) => {
      const newState = typeof state === 'function' ? state(prevState) : state;

      if (newState != null && window.openai?.setWidgetState) {
        window.openai.setWidgetState(newState);
      }

      return newState;
    });
  }, []);

  return [widgetState, setWidgetState] as const;
}
