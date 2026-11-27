/**
 * The Windows `GateConfinement`: native Windows has no confinement, by the owner's decision, so every line runs as it is in its worktree.
 */
import type { GateConfinement } from './GateConfinement.ts';

export function createWindowsNoConfinement(): GateConfinement {
  return Object.freeze<GateConfinement>({
    availability:      () => ({ verdict: 'unconfined-by-design' }),
    workerConfinement: () => 'unconfined-by-design',
    confinedArgvOf:    (_plan, argv) => [...argv],
  });
}
