/**
 * Which way a shown number last changed, for a part that animates the change: `changeCount` grows with each change, so a part keyed by it
 * plays its animation again, and `direction` is `undefined` until the first change, so the first showing plays nothing.
 */
import { useState } from 'react';

export type ValueChangeDirection = 'up' | 'down';

export interface ValueChange {
  readonly changeCount: number;
  readonly direction:   ValueChangeDirection | undefined;
}

interface SeenValue extends ValueChange {
  readonly value: number;
}

export function useValueChange(value: number): ValueChange {
  const [seen, setSeen] = useState<SeenValue>({ value, changeCount: 0, direction: undefined });
  if (seen.value !== value) {
    setSeen({ value, changeCount: seen.changeCount + 1, direction: value > seen.value ? 'up' : 'down' });
  }
  return { changeCount: seen.changeCount, direction: seen.direction };
}
