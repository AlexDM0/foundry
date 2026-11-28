/**
 * A stored-file problem as the facts of an incident, which are a stored string map: `problem` is the code, and each value is one key of its
 * own. A carried problem holds only text and numbers, and no value is named `file` or `problem`, which the incident's facts keep.
 */
import type { StoredFileProblem } from '../@types/StoredFileProblem.ts';

const PROBLEM_FACT = 'problem';

function factsOf(problem: StoredFileProblem): Record<string, string> {
  const { code, ...values } = problem as StoredFileProblem & Readonly<Record<string, unknown>>;
  return { [PROBLEM_FACT]: code, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])) };
}

/** `null` for facts that name no problem, as an incident stored before its problem was carried as a code. */
function problemOf(facts: Readonly<Record<string, string>>, otherFactKeys: readonly string[]): StoredFileProblem | null {
  const code = facts[PROBLEM_FACT];
  if (code === undefined) return null;
  const values = Object.entries(facts).filter(([key]) => key !== PROBLEM_FACT && !otherFactKeys.includes(key));
  return { code, ...Object.fromEntries(values) };
}

export const StoredFileProblemFactsUtil = Object.freeze({ factsOf, problemOf });
