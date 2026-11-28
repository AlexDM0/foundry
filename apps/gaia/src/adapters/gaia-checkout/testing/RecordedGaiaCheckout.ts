/**
 * The gaia-checkout recordings: git and forge's setup as they answered Gaia's checkout in scratch clones of this repository, one answer set
 * per situation of the clone. Test-only.
 */
import { recordedProcessRun, recordedSituationRunsOf, type RecordedProcessRun } from '../../../testing/RecordedRuns.ts';

export const GAIA_CHECKOUT_RECORDING_NAME = 'gaia-checkout';

/** The Bun program the recording names in place of the one it ran with, which differs per machine. */
export const EXAMPLE_BUN_PROGRAM = '/Users/example/.bun/bin/bun';

/**
 * `up-to-date`: the clone is at origin's main. `behind`: it lacks origin's two newest commits, fast-forwards and is set up. `setup-fails`:
 * it fast-forwards, and setup cannot compile the forge command. `local-changes`: a tracked file is changed. `diverged`: it holds a
 * commit origin lacks. `origin-unreachable`: its origin names no repository. `not-a-clone`: it has no origin.
 */
export const GAIA_CHECKOUT_SITUATIONS = ['up-to-date', 'behind', 'setup-fails', 'local-changes', 'diverged', 'origin-unreachable', 'not-a-clone'] as const;

export type GaiaCheckoutSituation = typeof GAIA_CHECKOUT_SITUATIONS[number];

export function recordedGaiaCheckoutRunOf(situation: GaiaCheckoutSituation): RecordedProcessRun {
  return recordedProcessRun(recordedSituationRunsOf(GAIA_CHECKOUT_RECORDING_NAME, situation));
}
