import type {
  ConfinementPlan,
  ConfinementUnavailability,
  ConfinementVerdict,
  GateConfinement
} from '../lib/gate-confinement/GateConfinement.ts';
import type { LineRefusal } from '../shared/@types/LineRefusal.ts';

/** The wrapper a planted `confined` adapter puts before an argv: harmless and runnable, so a child still starts. */
export const FAKE_CONFINER_ARGV: readonly string[] = ['/usr/bin/env'];

export const FAKE_UNAVAILABILITY: ConfinementUnavailability = { cause: 'bubblewrap-not-on-search-path' };

/** The words of `FAKE_UNAVAILABILITY`, as a refusal, an incident or the start's refusal names it. */
export const FAKE_MISSING_TOOLS_REASON = 'bwrap (bubblewrap) is not on the search path';

/** A line refused for `FAKE_UNAVAILABILITY`, worded as `FAKE_MISSING_TOOLS_REASON`. */
export const FAKE_LINE_REFUSAL: LineRefusal = { code: 'confinement-refused', confinementRefusal: { cause: 'confinement-unavailable', unavailability: FAKE_UNAVAILABILITY } };

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
      return verdict === 'unavailable' ? { verdict, unavailability: FAKE_UNAVAILABILITY } : { verdict };
    },
    workerConfinement: () => workerVerdict,
    confinedArgvOf:    (plan, argv) => {
      plans.push(plan);
      return verdict === 'confined' ? [...FAKE_CONFINER_ARGV, ...argv] : [...argv];
    },
  };
}

/** For a spec of what a line does once it may run, not of its confinement. */
export function runsAsGiven(argv: readonly string[]): { readonly verdict: 'runs'; readonly argv: readonly string[] } {
  return { verdict: 'runs', argv };
}
