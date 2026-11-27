/**
 * `target-merge-settlement.json` and `main-merge-settlement[-<round>].json`, how a merge of the target into a ticket's worktree settled once
 * its process ended, read into the settlement: read, validate, map.
 */
import { type ExpectationCheck, JobFileShapeUtil } from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil }                  from '../utils/StoredJsonDocumentUtil.ts';
import type { MergeFailure }                       from './@types/MergeFailure.ts';
import type { MergeSettlementProblem }             from './@types/MergeSettlementProblem.ts';

export const MERGE_SETTLEMENT_FORMAT_VERSION = 1;

/** The settlement as read back: a failed one carries the sentence its file stores under `reason`, which forge worded when it wrote it. */
export type TargetMergeSettlement =
  | { verdict: 'merged'; mergeCommit: string }
  | { verdict: 'conflicted'; conflictedFiles: string[] }
  | { verdict: 'failed'; storedReason: string };

/** The settlement as the merge's end settles it and the writer stores it, a failure as its code. */
export type SettledTargetMerge =
  | Exclude<TargetMergeSettlement, { verdict: 'failed' }>
  | { verdict: 'failed'; failure: MergeFailure };

export type MergeSettlementReading =
  | { verdict: 'readable'; settlement: TargetMergeSettlement }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: MergeSettlementProblem };

const SETTLEMENT_CHECKS: Readonly<Record<TargetMergeSettlement['verdict'], Readonly<Record<string, ExpectationCheck>>>> = {
  merged:     { mergeCommit: [JobFileShapeUtil.valueIsText, 'a-commit'] },
  conflicted: { conflictedFiles: [JobFileShapeUtil.valueIsATextList, 'a-list-of-paths'] },
  failed:     { reason: [JobFileShapeUtil.valueIsText, 'text'] },
};

function settlementOf(document: Readonly<Record<string, unknown>>, verdict: TargetMergeSettlement['verdict']): TargetMergeSettlement {
  if (verdict === 'merged') return { verdict, mergeCommit: document['mergeCommit'] as string };
  if (verdict === 'conflicted') return { verdict, conflictedFiles: [...document['conflictedFiles'] as string[]] };
  return { verdict, storedReason: document['reason'] as string };
}

export class MergeSettlementIngestion {
  constructor(private readonly settlementFilePath: string) {}

  /** Never throws: a settlement that cannot be read whole is `unreadable`, never a merge still to settle. */
  read(): MergeSettlementReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.settlementFilePath, MERGE_SETTLEMENT_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const { verdict } = document;
    if (verdict !== 'merged' && verdict !== 'conflicted' && verdict !== 'failed') return { verdict: 'unreadable', problem: { code: 'not-a-settlement', field: 'verdict' } };
    const problem = JobFileShapeUtil.firstMistypedFieldOf(document, SETTLEMENT_CHECKS[verdict]);
    if (problem !== null) return { verdict: 'unreadable', problem };
    return { verdict: 'readable', settlement: settlementOf(document, verdict) };
  }
}
