/**
 * The Windows answer of `spawnOptionsFor`. A detached console program runs with no console at all and can exit 0 having done nothing, so a
 * child of Talos is never detached, and a pipe for stderr keeps a descriptor from giving it a visible window. A Bun program needs no
 * console, so it stays detached and outlives its parent.
 */
import type { SupervisedChildKind, SupervisedSpawnOptions } from './ProcessSupervision.ts';

export const WINDOWS_SUPERVISED_CHILD_SPAWN: SupervisedSpawnOptions = Object.freeze({ detached: false, windowsHide: true, stderr: 'pipe' });

const WINDOWS_BUN_PROGRAM_SPAWN: SupervisedSpawnOptions = Object.freeze({ detached: true, windowsHide: true });

const WINDOWS_SPAWN_OF_CHILD_KIND: Readonly<Record<SupervisedChildKind, SupervisedSpawnOptions>> = Object.freeze({
  'supervised-child': WINDOWS_SUPERVISED_CHILD_SPAWN,
  'detached-program': WINDOWS_BUN_PROGRAM_SPAWN,
});

export function windowsSpawnOptionsFor(childKind: SupervisedChildKind): SupervisedSpawnOptions {
  return WINDOWS_SPAWN_OF_CHILD_KIND[childKind];
}
