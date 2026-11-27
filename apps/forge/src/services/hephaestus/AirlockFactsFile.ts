/**
 * The facts an Airlock agent launches with, kept in the merge job's folder when the merge-in conflicts: the Airlock's hold launches the
 * agent, and the agent's launch, after that hold, reads them back. Facts that cannot be read belong to the merge job, which waits on them.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import { AirlockFactsIngestion, type KeptAirlockFacts } from '../../adapters/airlock-facts/AirlockFactsIngestion.ts';
import { createAirlockFactsWriter }                     from '../../adapters/airlock-facts/AirlockFactsWriter.ts';
import type { AirlockPhase }                            from '../../domain/tracker-model/@types/Job.ts';
import { unmergedPathsIn }                              from '../../lib/git/BranchMerge.ts';
import { jobFileInDataFolderOf }                        from './HephaestusFiles.ts';
import type { UnreadableJobFile }                       from './UnreadableJobFileIncident.ts';

/** The Airlock phases an agent works in: resolving a conflict, re-reviewing a large resolution, or fixing a red merged tree. */
export type AirlockAgentPhase = Extract<AirlockPhase, 'resolving' | 're-reviewing' | 'fixing'>;

export type AirlockConflictReading = { verdict: 'known'; conflictedFiles: string[] } | { verdict: 'unknown' };

export type KeptAirlockFactsAnswer =
  | { verdict: 'kept'; facts: KeptAirlockFacts }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; unreadableFile: UnreadableJobFile };

const AIRLOCK_FACTS_FILE = 'airlock-facts.json';

function keep(mergeJobFolder: string, facts: KeptAirlockFacts): void {
  mkdirSync(mergeJobFolder, { recursive: true });
  createAirlockFactsWriter(join(mergeJobFolder, AIRLOCK_FACTS_FILE)).write(facts);
}

/** The one reading of the merge job's kept facts that both the agent's launch and the settling of its resolution take. */
function keptFactsOf(mergeJobFolder: string, mergeJobId: string): KeptAirlockFactsAnswer {
  const reading = new AirlockFactsIngestion(join(mergeJobFolder, AIRLOCK_FACTS_FILE)).read();
  if (reading.verdict === 'readable') return { verdict: 'kept', facts: reading.facts };
  if (reading.verdict === 'absent') return reading;
  const file = jobFileInDataFolderOf(mergeJobId, AIRLOCK_FACTS_FILE);
  return { verdict: 'unreadable', unreadableFile: { jobId: mergeJobId, file, problem: reading.problem } };
}

/**
 * No kept facts are never taken as no conflict while resolving: git's unmerged paths in the Airlock worktree answer instead, and `unknown`
 * when git cannot tell either, so the agent is not told a wrong list.
 */
function conflictedFilesOf(
  keptFacts: KeptAirlockFacts | null,
  phase: AirlockAgentPhase,
  airlockWorktree: string,
  unmergedPathsOf: (worktreePath: string) => string[] | null = unmergedPathsIn,
): AirlockConflictReading {
  if (keptFacts !== null) return { verdict: 'known', conflictedFiles: [...keptFacts.conflictedFiles] };
  // Facts are kept only for a merge-in that conflicted, so a fixer of a clean merge-in has none.
  if (phase === 'fixing') return { verdict: 'known', conflictedFiles: [] };
  const unmergedPaths = unmergedPathsOf(airlockWorktree);
  return unmergedPaths === null ? { verdict: 'unknown' } : { verdict: 'known', conflictedFiles: unmergedPaths };
}

export const AirlockFactsFile = Object.freeze({
  conflictedFilesOf,
  keep,
  keptFactsOf,
});
