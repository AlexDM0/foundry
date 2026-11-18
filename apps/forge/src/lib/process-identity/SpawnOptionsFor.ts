/**
 * The Windows answer of `spawnOptionsFor`. A detached console program runs with no console at all and can exit 0 having done nothing, so a
 * gate or a Watcher's child is never detached, and a pipe for stderr keeps a descriptor from giving it a visible window. A Bun program needs no
 * console, so it stays detached and outlives its parent.
 */
import type { SupervisedChildKind, SupervisedSpawnOptions } from './ProcessSupervision.ts';

export const WINDOWS_SUPERVISED_CHILD_SPAWN: SupervisedSpawnOptions = Object.freeze({ detached: false, windowsHide: true, stderr: 'pipe' });

const WINDOWS_BUN_PROGRAM_SPAWN: SupervisedSpawnOptions = Object.freeze({ detached: true, windowsHide: true });

const WINDOWS_SPAWN_OF_CHILD_KIND: Readonly<Record<SupervisedChildKind, SupervisedSpawnOptions>> = Object.freeze({
  'gate':             WINDOWS_SUPERVISED_CHILD_SPAWN,
  'supervised-child': WINDOWS_SUPERVISED_CHILD_SPAWN,
  'watcher':          WINDOWS_BUN_PROGRAM_SPAWN,
  'talos':            WINDOWS_BUN_PROGRAM_SPAWN,
  'overseer':         WINDOWS_BUN_PROGRAM_SPAWN,
  'successor':        WINDOWS_BUN_PROGRAM_SPAWN,
});

export function windowsSpawnOptionsFor(childKind: SupervisedChildKind): SupervisedSpawnOptions {
  return WINDOWS_SPAWN_OF_CHILD_KIND[childKind];
}
