/** A merged-tree gate run's `outcome.json`, the gate it kept for the pass that settles its Airlock: read, validate, map. */
import { StoredJsonDocumentUtil }       from '../utils/StoredJsonDocumentUtil.ts';
import type { MergedTreeGate }          from './@types/MergedTreeGate.ts';
import { MergedTreeGateValidationUtil } from './utils/MergedTreeGateValidationUtil.ts';

export type MergedTreeGateOutcomeReading =
  | { verdict: 'readable'; gate: MergedTreeGate }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export const MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION = 1;

export const MERGED_TREE_GATE_OUTCOME_VERSION_KEY = 'formatVersion';

export class MergedTreeGateOutcomeIngestion {
  constructor(private readonly outcomeFilePath: string) {}

  /** Never throws. Keys the format does not name are tolerated. */
  read(): MergedTreeGateOutcomeReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.outcomeFilePath, MERGED_TREE_GATE_OUTCOME_FORMAT_VERSION, MERGED_TREE_GATE_OUTCOME_VERSION_KEY);
    if (stored.verdict !== 'readable') return stored;
    const { gate } = stored.document;
    const problem = MergedTreeGateValidationUtil.gateProblemOf(gate);
    if (problem !== null) return { verdict: 'unreadable', reason: problem };
    return { verdict: 'readable', gate: gate as MergedTreeGate };
  }
}
