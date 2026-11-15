import type { ConfinedLine }                                         from '../lib/gate-confinement/ConfinedLine.ts';
import type { ConfinementPlan, ConfinementVerdict, GateConfinement } from '../lib/gate-confinement/GateConfinement.ts';

/** The wrapper a planted `confined` adapter puts before an argv: harmless and runnable, so a child still starts. */
export const FAKE_CONFINER_ARGV: readonly string[] = ['/usr/bin/env'];

export const FAKE_MISSING_TOOLS_REASON = 'bubblewrap, socat and ripgrep are missing';

export interface FakeGateConfinement extends GateConfinement {
  /** Each plan the adapter was asked to confine a line under. */
  readonly plans: ConfinementPlan[];
}

/** A planted port answer, since a process already under a sandbox fails the real probe. */
export function fakeGateConfinement(verdict: ConfinementVerdict, workerVerdict: ConfinementVerdict = verdict): FakeGateConfinement {
  const plans: ConfinementPlan[] = [];
  return {
    plans,
    availability: () => {
      if (verdict === 'confined') return { verdict, mechanism: 'fake-confiner' };
      return verdict === 'unavailable' ? { verdict, reason: FAKE_MISSING_TOOLS_REASON } : { verdict };
    },
    workerConfinement: () => workerVerdict,
    confinedArgvOf:    (plan, argv) => {
      plans.push(plan);
      return verdict === 'confined' ? [...FAKE_CONFINER_ARGV, ...argv] : [...argv];
    },
  };
}

/** For a spec of what a line does once it may run, not of its confinement. */
export function runsAsGiven(argv: readonly string[]): ConfinedLine {
  return { verdict: 'runs', argv };
}
