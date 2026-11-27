/**
 * The words of a `setup-failed` or `sandbox-unavailable` incident whose facts keep its step's problem as values, where the incident is served
 * or printed: its facts are served as `step` and `reason`, the sentence of that problem, as they were stored before the problem was a code.
 */
import type { ShellRunRefusal }                   from '../../lib/shell-line/ShellLine.ts';
import type { Incident }                          from '../../lib/tracker-model/@types/Incident.ts';
import type { ConfinementRefusal }                from '../../shared/@types/ConfinementRefusal.ts';
import { type StepProblem, StepProblemFactsUtil } from '../../shared/utils/StepProblemFactsUtil.ts';
import { LineRefusalWording }                     from '../LineRefusalWording.ts';
import { MergeStepProblemWording }                from '../MergeStepProblemWording.ts';

const STEP_INCIDENT_KINDS: ReadonlySet<Incident['kind']> = new Set(['setup-failed', 'sandbox-unavailable']);

function confinementRefusalOf(json: string): ConfinementRefusal | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null && 'cause' in parsed ? parsed as ConfinementRefusal : null;
  } catch {
    return null;
  }
}

/** `null` when a value the code names is missing, so the facts are served as they are stored. */
function stepProblemOf(code: string, values: Readonly<Record<string, string>>): StepProblem | null {
  const {
    branch, target, targetTip, mergeCommit, storedReason, refusal, directory, deniedRoot, confinementRefusal
  } = values;
  switch (code) {
    case 'tip-unreadable':        return branch === undefined ? null : { code, branch };
    case 'holding-unknown':
      return branch === undefined || target === undefined || targetTip === undefined ? null : {
        code, branch, target, targetTip
      };
    case 'merge-tree-unreadable': return mergeCommit === undefined ? null : { code, mergeCommit };
    case 'head-tree-unreadable':  return branch === undefined ? null : { code, branch };
    case 'merge-settled-failed':  return storedReason === undefined ? null : { code, storedReason };
    case 'shell-run-refused':
      return refusal === undefined || directory === undefined ? null : { code, refusal: refusal as ShellRunRefusal, directory };
    case 'denied-root-unmade':    return deniedRoot === undefined ? null : { code, deniedRoot };
    case 'confinement-refused': {
      const decoded = confinementRefusal === undefined ? null : confinementRefusalOf(confinementRefusal);
      return decoded === null ? null : { code, confinementRefusal: decoded };
    }
    default:                      return null;
  }
}

function reasonOf(problem: StepProblem): string {
  switch (problem.code) {
    case 'shell-run-refused':
    case 'denied-root-unmade':
    case 'confinement-refused':
      return LineRefusalWording.sentenceOf(problem);
    default:
      return MergeStepProblemWording.sentenceOf(problem);
  }
}

/** `null` for any other incident, and for facts that keep no problem, as one stored with its reason worded. */
function wordedFactsOf(incident: Pick<Incident, 'kind' | 'facts'>): Record<string, string> | null {
  if (!STEP_INCIDENT_KINDS.has(incident.kind)) return null;
  const stored = StepProblemFactsUtil.storedProblemOf(incident.facts);
  const problem = stored === null ? null : stepProblemOf(stored.code, stored.values);
  if (problem === null) return null;
  return { step: incident.facts['step'] ?? '', reason: reasonOf(problem) };
}

export const StepIncidentFactsWordingUtil = Object.freeze({ reasonOf, wordedFactsOf });
