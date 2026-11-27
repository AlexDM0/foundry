/**
 * A step's refusal or failure as the facts of its incident, a stored string map beside `step`: `problem` is the code, and each value is one
 * key of its own, a value that is no text kept as its JSON text. No value is named `step` or `problem`, which the incident's facts keep.
 */
import type { LineRefusal }      from '../@types/LineRefusal.ts';
import type { MergeStepProblem } from '../@types/MergeStepProblem.ts';

const PROBLEM_FACT = 'problem';

const STEP_FACT = 'step';

export type StepProblem = LineRefusal | MergeStepProblem;

function factsOf(problem: StepProblem): Record<string, string> {
  const { code, ...values } = problem as StepProblem & Readonly<Record<string, unknown>>;
  return {
    [PROBLEM_FACT]: code,
    ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])),
  };
}

/** The code and the values the facts keep, `null` for facts that name no problem, as an incident stored before its problem was a code. */
function storedProblemOf(facts: Readonly<Record<string, string>>): { code: string; values: Readonly<Record<string, string>> } | null {
  const code = facts[PROBLEM_FACT];
  if (code === undefined) return null;
  return { code, values: Object.fromEntries(Object.entries(facts).filter(([key]) => key !== PROBLEM_FACT && key !== STEP_FACT)) };
}

export const StepProblemFactsUtil = Object.freeze({ factsOf, storedProblemOf });
