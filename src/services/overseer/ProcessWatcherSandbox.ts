/**
 * What a process Watcher's child may reach, as the neutral plan the `GateConfinement` port confines it by: gates and install lines run
 * worker-written code. The board's stored cache paths are judged here, so only the allowed ones cross into the port.
 */
import type { ConfinementPlan, GateConfinement as PortGateConfinement } from '../../lib/gate-confinement/GateConfinement.ts';
import { type CacheFolderStyle, GateCachePaths }                        from './GateCachePaths.ts';

export interface ProcessSandboxRequest {
  worktree:             string;
  /** The worktree's own `<common>/worktrees/<name>/`, whose index git refreshes; `null` for a main checkout. */
  worktreeAdminFolder:  string | null;
  homeDirectory:        string;
  temporaryDirectory:   string | null;
  /** The board's stored cache paths, absolute or `~/`; one refused by `GateCachePaths` is left out. */
  cachePaths:           readonly string[];
  /** The Overseer's `PATH` folders, none of which a cache path may be, sit in or hold. */
  executableSearchPath: readonly string[];
  cacheFolderStyle:     CacheFolderStyle;
  deniedWritableRoots:  readonly string[];
  /** A `*` in a path matches within one path segment. */
  deniedReadableRoots:  readonly string[];
  network:              boolean;
}

function planOf(request: ProcessSandboxRequest, confinementFilePath: string): ConfinementPlan {
  return {
    worktree:            request.worktree,
    worktreeAdminFolder: request.worktreeAdminFolder,
    temporaryDirectory:  request.temporaryDirectory,
    writableCachePaths:  GateCachePaths.writableCachePathsOf(request.cachePaths, request.homeDirectory, request.executableSearchPath, request.cacheFolderStyle),
    deniedWritableRoots: request.deniedWritableRoots,
    deniedReadableRoots: request.deniedReadableRoots,
    network:             request.network,
    confinementFilePath,
  };
}

/** The per-job ref denies are confinement's: a job only cannot have moved a target when both its session and its gate children ran confined. */
function refDeniesHoldUnder(confinement: PortGateConfinement): boolean {
  return confinement.availability().verdict === 'confined' && confinement.workerConfinement() === 'confined';
}

export const ProcessWatcherSandbox = Object.freeze({ planOf, refDeniesHoldUnder });
