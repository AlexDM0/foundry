/**
 * The facts an Airlock agent launches with, kept in the merge job's folder when the merge-in conflicts: the Airlock's hold launches the
 * agent, and the agent's launch, after that hold, reads them back.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join }                                from 'node:path';

import { writeFileAtomically } from '../../lib/atomic-file/AtomicFile.ts';
import { unmergedPathsIn }     from '../../lib/git/BranchMerge.ts';
import type { AirlockPhase }   from '../../lib/tracker-model/@types/Job.ts';

/** The Airlock phases an agent works in: resolving a conflict, re-reviewing a large resolution, or fixing a red merged tree. */
export type AirlockAgentPhase = Extract<AirlockPhase, 'resolving' | 're-reviewing' | 'fixing'>;

export type AirlockConflictReading = { verdict: 'known'; conflictedFiles: string[] } | { verdict: 'unknown' };

type KeptConflictReading = { verdict: 'kept'; conflictedFiles: string[] } | { verdict: 'absent' } | { verdict: 'malformed' };

const AIRLOCK_FACTS_FILE = 'airlock-facts.json';

/**
 * The names of the kept facts: the files the next agent resolves; on a crossing ticket's conflict split by owner, whether it leaves the
 * merge open for the worker after it (E64) and the files the workers before it resolved, newline-separated.
 */
export const AIRLOCK_FACT_NAMES = Object.freeze({
  conflictedFiles:     'conflictedFiles',
  leavesTheMergeOpen:  'leavesTheMergeOpen',
  filesResolvedBefore: 'filesResolvedBefore',
});

/** The value a kept fact holds when it is true. */
export const KEPT_FACT_TRUE = 'true';

function keep(mergeJobFolder: string, facts: Readonly<Record<string, string>>): void {
  mkdirSync(mergeJobFolder, { recursive: true });
  writeFileAtomically(join(mergeJobFolder, AIRLOCK_FACTS_FILE), `${JSON.stringify(facts)}\n`);
}

/** One kept fact; `null` when it was not kept or the facts cannot be read. */
function keptFactOf(mergeJobFolder: string, name: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(mergeJobFolder, AIRLOCK_FACTS_FILE), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || !Object.hasOwn(parsed, name)) return null;
    const value: unknown = (parsed as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function keptConflictsOf(mergeJobFolder: string): KeptConflictReading {
  const factsPath = join(mergeJobFolder, AIRLOCK_FACTS_FILE);
  if (!existsSync(factsPath)) return { verdict: 'absent' };
  try {
    const parsed: unknown = JSON.parse(readFileSync(factsPath, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || !Object.hasOwn(parsed, 'conflictedFiles')) return { verdict: 'malformed' };
    const { conflictedFiles } = parsed as { conflictedFiles: unknown };
    if (typeof conflictedFiles !== 'string') return { verdict: 'malformed' };
    return { verdict: 'kept', conflictedFiles: conflictedFiles.split('\n').filter((path) => path !== '') };
  } catch {
    return { verdict: 'malformed' };
  }
}

/**
 * Facts that cannot be read are never taken as no conflict: git's unmerged paths in the Airlock worktree answer instead, and `unknown`
 * when git cannot tell either, so the agent is not told a wrong list.
 */
function conflictedFilesOf(
  mergeJobFolder: string,
  phase: AirlockAgentPhase,
  airlockWorktree: string,
  unmergedPathsOf: (worktreePath: string) => string[] | null = unmergedPathsIn,
): AirlockConflictReading {
  const kept = keptConflictsOf(mergeJobFolder);
  if (kept.verdict === 'kept') return { verdict: 'known', conflictedFiles: kept.conflictedFiles };
  // Facts are kept only for a merge-in that conflicted, so a fixer of a clean merge-in has none.
  if (kept.verdict === 'absent' && phase === 'fixing') return { verdict: 'known', conflictedFiles: [] };
  const unmergedPaths = unmergedPathsOf(airlockWorktree);
  return unmergedPaths === null ? { verdict: 'unknown' } : { verdict: 'known', conflictedFiles: unmergedPaths };
}

export const AirlockFactsFile = Object.freeze({
  conflictedFilesOf,
  keep,
  keptFactOf,
});
