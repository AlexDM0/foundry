/**
 * The conflicted files an Airlock agent is told. What matters: kept facts answer as kept; a fixer of a clean merge-in has none and asks
 * git nothing; facts that are missing while resolving are never read as no conflict, git's unmerged paths answer instead, and when git
 * cannot tell either the answer is unknown; facts that cannot be read are the merge job's unreadable file, never a guess.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { AirlockFactsFile }                               from './AirlockFactsFile.ts';

const AIRLOCK_WORKTREE = '/example/worktrees/ticket-001';

const MERGE_JOB_ID = 'J7';

let mergeJobFolder = '';

beforeEach(() => {
  mergeJobFolder = createScratchDirectory('airlock-facts');
});

afterEach(() => {
  removeScratchDirectory(mergeJobFolder);
});

function gitAnswering(unmergedPaths: string[] | null): { unmergedPathsOf: (worktreePath: string) => string[] | null; askedWorktrees: string[] } {
  const askedWorktrees: string[] = [];
  return {
    askedWorktrees,
    unmergedPathsOf: (worktreePath) => {
      askedWorktrees.push(worktreePath);
      return unmergedPaths;
    },
  };
}

describe('the conflicted files an Airlock agent is told', () => {
  test('kept facts answer their files, and git is not asked', () => {
    const facts = { conflictedFiles: ['src/Example.ts', 'src/Other.ts'], leavesTheMergeOpen: false, filesResolvedBefore: [] };
    AirlockFactsFile.keep(mergeJobFolder, facts);
    const kept = AirlockFactsFile.keptFactsOf(mergeJobFolder, MERGE_JOB_ID);
    const git = gitAnswering(['src/Unrelated.ts']);
    expect(kept).toEqual({ verdict: 'kept', facts });
    expect(AirlockFactsFile.conflictedFilesOf(facts, 'resolving', AIRLOCK_WORKTREE, git.unmergedPathsOf))
      .toEqual({ verdict: 'known', conflictedFiles: ['src/Example.ts', 'src/Other.ts'] });
    expect(git.askedWorktrees).toEqual([]);
  });

  test('a fixer of a clean merge-in has no kept facts and no conflicted file, and git is not asked', () => {
    const git = gitAnswering(null);
    expect(AirlockFactsFile.keptFactsOf(mergeJobFolder, MERGE_JOB_ID)).toEqual({ verdict: 'absent' });
    expect(AirlockFactsFile.conflictedFilesOf(null, 'fixing', AIRLOCK_WORKTREE, git.unmergedPathsOf)).toEqual({ verdict: 'known', conflictedFiles: [] });
    expect(git.askedWorktrees).toEqual([]);
  });

  test('missing facts while resolving are never read as no conflict: git\'s unmerged paths in the Airlock worktree answer', () => {
    const git = gitAnswering(['src/Example.ts']);
    expect(AirlockFactsFile.conflictedFilesOf(null, 'resolving', AIRLOCK_WORKTREE, git.unmergedPathsOf))
      .toEqual({ verdict: 'known', conflictedFiles: ['src/Example.ts'] });
    expect(git.askedWorktrees).toEqual([AIRLOCK_WORKTREE]);
    expect(AirlockFactsFile.conflictedFilesOf(null, 'resolving', AIRLOCK_WORKTREE, gitAnswering(null).unmergedPathsOf)).toEqual({ verdict: 'unknown' });
  });

  test.each(['{"conflictedFiles": ', '{"conflictedFiles": 7}\n', '[]\n'])('facts %p that cannot be read are the merge job\'s unreadable file', (malformed) => {
    writeFileSync(join(mergeJobFolder, 'airlock-facts.json'), malformed);
    const unreadableFile = { jobId: MERGE_JOB_ID, file: `jobs/${MERGE_JOB_ID}/airlock-facts.json` };
    expect(AirlockFactsFile.keptFactsOf(mergeJobFolder, MERGE_JOB_ID)).toMatchObject({ verdict: 'unreadable', unreadableFile });
  });
});
