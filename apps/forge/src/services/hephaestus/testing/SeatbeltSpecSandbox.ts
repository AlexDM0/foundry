/** The profile text and wrapped argv apart, as the specs of a profile hold them, over the real adapter with its own file write left out. */
import { createDarwinSeatbelt, seatbeltProfileTextOf } from '../../../lib/gate-confinement/DarwinSeatbelt.ts';
import type { ConfinementPlan }                        from '../../../lib/gate-confinement/GateConfinement.ts';
import { REAL_SEATBELT_PRIMITIVES }                    from '../../../lib/gate-confinement/GateConfinementFor.ts';
import { LineSandbox, type ProcessSandboxRequest }     from '../LineSandbox.ts';

const NO_REACH: ConfinementPlan = {
  worktree:            '/',
  writableRoots:       [],
  worktreeAdminFolder: null,
  temporaryDirectory:  null,
  writableCachePaths:  [],
  deniedWritableRoots: [],
  deniedReadableRoots: [],
  network:             false,
  confinementFilePath: '',
};

export function createLineSandbox() {
  const seatbelt = createDarwinSeatbelt({ ...REAL_SEATBELT_PRIMITIVES, writeFile: () => undefined });
  return {
    isUsable:        () => seatbelt.availability().verdict === 'confined',
    profileTextOf:   (request: ProcessSandboxRequest) => seatbeltProfileTextOf(LineSandbox.planOf(request, '')),
    sandboxedArgvOf: (profilePath: string, argv: readonly string[]) => [...seatbelt.confinedArgvOf({ ...NO_REACH, confinementFilePath: profilePath }, argv)],
  };
}
