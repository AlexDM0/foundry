/** `airlock-facts.json`, the facts a merge job keeps for the Airlock agent it launches on a conflicting merge-in: read, validate, map. */
import { StoredJsonDocumentUtil }   from '../utils/StoredJsonDocumentUtil.ts';
import type { AirlockFactsProblem } from './@types/AirlockFactsProblem.ts';

/**
 * The files the next agent resolves; on a crossing ticket's conflict split by owner, whether it leaves the merge open for the worker after it
 * and the files the workers before it resolved.
 */
export interface KeptAirlockFacts {
  readonly conflictedFiles:     readonly string[];
  readonly leavesTheMergeOpen:  boolean;
  readonly filesResolvedBefore: readonly string[];
}

export type AirlockFactsReading =
  | { verdict: 'readable'; facts: KeptAirlockFacts }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: AirlockFactsProblem };

export const AIRLOCK_FACTS_FORMAT_VERSION = 1;

function isAFileList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((path) => typeof path === 'string' && path !== '');
}

export class AirlockFactsIngestion {
  constructor(private readonly factsFilePath: string) {}

  /** Never throws. */
  read(): AirlockFactsReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.factsFilePath, AIRLOCK_FACTS_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { conflictedFiles, leavesTheMergeOpen, filesResolvedBefore } = stored.document;
    if (!isAFileList(conflictedFiles)) return { verdict: 'unreadable', problem: { code: 'not-a-list-of-file-paths', field: 'conflictedFiles' } };
    if (typeof leavesTheMergeOpen !== 'boolean') return { verdict: 'unreadable', problem: { code: 'neither-true-nor-false', field: 'leavesTheMergeOpen' } };
    if (!isAFileList(filesResolvedBefore)) return { verdict: 'unreadable', problem: { code: 'not-a-list-of-file-paths', field: 'filesResolvedBefore' } };
    return { verdict: 'readable', facts: { conflictedFiles, leavesTheMergeOpen, filesResolvedBefore } };
  }
}
