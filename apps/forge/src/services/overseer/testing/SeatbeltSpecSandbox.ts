/** The profile text and wrapped argv apart, as the specs of a profile hold them, over the real adapter with its own file write left out. */
import { createDarwinSeatbelt, seatbeltProfileTextOf }       from '../../../lib/gate-confinement/DarwinSeatbelt.ts';
import type { ConfinementPlan }                              from '../../../lib/gate-confinement/GateConfinement.ts';
import { REAL_SEATBELT_PRIMITIVES }                          from '../../../lib/gate-confinement/GateConfinementFor.ts';
import { ProcessWatcherSandbox, type ProcessSandboxRequest } from '../ProcessWatcherSandbox.ts';

const NO_REACH: ConfinementPlan = {
  worktree:            '/',
  worktreeAdminFolder: null,
  temporaryDirectory:  null,
  writableCachePaths:  [],
  deniedWritableRoots: [],
  deniedReadableRoots: [],
  network:             false,
  confinementFilePath: '',
};

export function createProcessWatcherSandbox() {
  const seatbelt = createDarwinSeatbelt({ ...REAL_SEATBELT_PRIMITIVES, writeFile: () => undefined });
  return {
    isUsable:        () => seatbelt.availability().verdict === 'confined',
    profileTextOf:   (request: ProcessSandboxRequest) => seatbeltProfileTextOf(ProcessWatcherSandbox.planOf(request, '')),
    sandboxedArgvOf: (profilePath: string, argv: readonly string[]) => [...seatbelt.confinedArgvOf({ ...NO_REACH, confinementFilePath: profilePath }, argv)],
  };
}
