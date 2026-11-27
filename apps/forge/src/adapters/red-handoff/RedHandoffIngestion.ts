/**
 * `red-handoff.json`, the facts of a red handoff a job's resume message is worded from, in its own folder, a merge job's, or the
 * `stale-green` folder of an ended job, read into the facts: read, validate, map.
 */
import { JobFileShapeUtil }       from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }        from '../utils/StoredValueUtil.ts';

export const RED_HANDOFF_FORMAT_VERSION = 1;

/** What went red, and which resume of how many fixes it: the resume message and a fresh session's first message are worded from it. */
export interface RedHandoffFacts {
  /**
   * `gate` for a red gate, `customs` for a refused Customs check (a dirty worktree, no commit, missing or stale gate claims),
   * `merge-conflict` for a merge of the target into the worktree that conflicted before User's Merge.
   */
  kind:                'gate' | 'customs' | 'merge-conflict';
  /** The gate's name, the Customs check's id, or the target the merge took its tip from. */
  name:                string;
  /** The gate's shell line; `null` for a Customs check. */
  command:             string | null;
  fixCommand:          string | null;
  commit:              string;
  exitCode:            number | null;
  gateFailureNotePath: string;
  /** The gate's whole output; `null` for a Customs check. */
  fullLogPath:         string | null;
  resume:              number;
  resumesAllowed:      number;
  /** The child instance that went red: the resume's calls are counted from the next one. A fresh session taking over stores 0. */
  interruptedInstance: number;
  callBudget:          number;
  /** On a `merge-conflict` only: the target tip the session merges in again. */
  mergedTip?:          string;
  /**
   * Once a job of an entity was sent back by the reach check (`changesStayInHomeAndReach`), kept on every later red handoff of the job:
   * that check resumes it only once.
   */
  scopeResumed?:       true;
}

export type RedHandoffReading =
  | { verdict: 'readable'; facts: RedHandoffFacts }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

const RED_HANDOFF_KINDS: readonly RedHandoffFacts['kind'][] = ['gate', 'customs', 'merge-conflict'];

function valueIsACount(value: unknown): boolean {
  return StoredValueUtil.wholeNumberIsAtLeast(value, 0);
}

function factsOf(document: Readonly<Record<string, unknown>>): RedHandoffFacts {
  const mergedTip = document['mergedTip'] as string | undefined;
  return {
    kind:                document['kind'] as RedHandoffFacts['kind'],
    name:                document['name'] as string,
    command:             document['command'] as string | null,
    fixCommand:          document['fixCommand'] as string | null,
    commit:              document['commit'] as string,
    exitCode:            document['exitCode'] as number | null,
    gateFailureNotePath: document['gateFailureNotePath'] as string,
    fullLogPath:         document['fullLogPath'] as string | null,
    resume:              document['resume'] as number,
    resumesAllowed:      document['resumesAllowed'] as number,
    interruptedInstance: document['interruptedInstance'] as number,
    callBudget:          document['callBudget'] as number,
    ...(mergedTip === undefined ? {} : { mergedTip }),
    ...(document['scopeResumed'] === true ? { scopeResumed: true as const } : {}),
  };
}

export class RedHandoffIngestion {
  constructor(private readonly factsFilePath: string) {}

  /** Never throws: facts that cannot be read whole are `unreadable`, never a job that did not go red. */
  read(): RedHandoffReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.factsFilePath, RED_HANDOFF_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstFieldProblemOf(document, {
      kind:                [JobFileShapeUtil.oneOf(RED_HANDOFF_KINDS), 'a red handoff kind'],
      name:                [JobFileShapeUtil.valueIsText, 'text'],
      command:             [JobFileShapeUtil.valueIsTextOrNull, 'text or null'],
      fixCommand:          [JobFileShapeUtil.valueIsTextOrNull, 'text or null'],
      commit:              [JobFileShapeUtil.valueIsText, 'a commit'],
      exitCode:            [JobFileShapeUtil.valueIsANumberOrNull, 'an exit code or null'],
      gateFailureNotePath: [JobFileShapeUtil.valueIsText, 'a path'],
      fullLogPath:         [JobFileShapeUtil.valueIsTextOrNull, 'a path or null'],
      resume:              [valueIsACount, 'a count'],
      resumesAllowed:      [valueIsACount, 'a count'],
      interruptedInstance: [valueIsACount, 'a child instance'],
      callBudget:          [valueIsACount, 'a count'],
      mergedTip:           [JobFileShapeUtil.optional(JobFileShapeUtil.valueIsText), 'a commit'],
      scopeResumed:        [JobFileShapeUtil.optional((value) => value === true), 'true'],
    });
    if (problem !== null) return { verdict: 'unreadable', reason: problem };
    return { verdict: 'readable', facts: factsOf(document) };
  }
}
