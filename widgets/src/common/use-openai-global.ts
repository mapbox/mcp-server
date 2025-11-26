import { useSyncExternalStore } from 'react';
import type { SetGlobalsEvent } from './types';
import { SET_GLOBALS_EVENT_TYPE, type OpenAiGlobals } from './types';

/**
 * React hook to subscribe to OpenAI globals in the ChatGPT widget environment.
 * Uses useSyncExternalStore for safe concurrent rendering.
 *
 * @param key - The key of the OpenAI global to subscribe to
 * @returns The current value of the global, or null if not available
 */
export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(
  key: K
): OpenAiGlobals[K] | null {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') {
        return () => {};
      }

      const handleSetGlobal = (event: SetGlobalsEvent) => {
        const value = event.detail.globals[key];
        if (value === undefined) {
          return;
        }

        onChange();
      };

      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, {
        passive: true
      });

      return () => {
        window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
      };
    },
    () => window.openai?.[key] ?? null,
    () => window.openai?.[key] ?? null
  );
}
