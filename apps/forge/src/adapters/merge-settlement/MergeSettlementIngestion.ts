/**
 * `target-merge-settlement.json` and `main-merge-settlement[-<round>].json`, how a merge of the target into a ticket's worktree settled once
 * its process ended, read into the settlement: read, validate, map.
 */
import { type FieldCheck, JobFileShapeUtil } from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil }            from '../utils/StoredJsonDocumentUtil.ts';

export const MERGE_SETTLEMENT_FORMAT_VERSION = 1;

export type TargetMergeSettlement =
  | { verdict: 'merged'; mergeCommit: string }
  | { verdict: 'conflicted'; conflictedFiles: string[] }
  | { verdict: 'failed'; reason: string };

export type MergeSettlementReading =
  | { verdict: 'readable'; settlement: TargetMergeSettlement }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

const SETTLEMENT_CHECKS: Readonly<Record<TargetMergeSettlement['verdict'], Readonly<Record<string, FieldCheck>>>> = {
  merged:     { mergeCommit: [JobFileShapeUtil.valueIsText, 'a commit'] },
  conflicted: { conflictedFiles: [JobFileShapeUtil.valueIsATextList, 'a list of paths'] },
  failed:     { reason: [JobFileShapeUtil.valueIsText, 'text'] },
};

function settlementOf(document: Readonly<Record<string, unknown>>, verdict: TargetMergeSettlement['verdict']): TargetMergeSettlement {
  if (verdict === 'merged') return { verdict, mergeCommit: document['mergeCommit'] as string };
  if (verdict === 'conflicted') return { verdict, conflictedFiles: [...document['conflictedFiles'] as string[]] };
  return { verdict, reason: document['reason'] as string };
}

export class MergeSettlementIngestion {
  constructor(private readonly settlementFilePath: string) {}

  /** Never throws: a settlement that cannot be read whole is `unreadable`, never a merge still to settle. */
  read(): MergeSettlementReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.settlementFilePath, MERGE_SETTLEMENT_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const { verdict } = document;
    if (verdict !== 'merged' && verdict !== 'conflicted' && verdict !== 'failed') return { verdict: 'unreadable', reason: 'its "verdict" is not a settlement' };
    const problem = JobFileShapeUtil.firstFieldProblemOf(document, SETTLEMENT_CHECKS[verdict]);
    if (problem !== null) return { verdict: 'unreadable', reason: problem };
    return { verdict: 'readable', settlement: settlementOf(document, verdict) };
  }
}
