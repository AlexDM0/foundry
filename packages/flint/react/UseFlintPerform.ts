/**
 * The React entry for a component below `<Flint>` that starts an intent itself, as a view starts `chase-bug` or `lay-bar-along` with one
 * of its own elements: the function it gives carries out `perform` on the Flint there is now. Without a `<Flint>` above, or while Flint is
 * not made, it answers `no-flint`.
 */
import { useCallback, useContext } from 'react';

import type { ConnectedPerformVerdict } from './FlintConnection.ts';
import { FlintContext }                 from './FlintContext.ts';

/** The function stays the same while the Flint above stays, so an effect may depend on it. */
export function useFlintPerform(): (intent: string, toward?: Element) => ConnectedPerformVerdict {
  const connection = useContext(FlintContext);
  return useCallback((intent: string, toward?: Element) => connection?.perform(intent, toward) ?? 'no-flint', [connection]);
}
