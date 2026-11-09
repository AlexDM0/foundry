/**
 * The conflicted files an Airlock agent is told. What matters: kept facts answer as kept; a fixer of a clean merge-in has none and asks
 * git nothing; facts that are missing while resolving or malformed are never read as no conflict, git's unmerged paths answer instead,
 * and when git cannot tell either the answer is unknown.
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
    AirlockFactsFile.keep(mergeJobFolder, { conflictedFiles: 'src/Example.ts\nsrc/Other.ts' });
    const git = gitAnswering(['src/Unrelated.ts']);
    expect(AirlockFactsFile.conflictedFilesOf(mergeJobFolder, 'resolving', AIRLOCK_WORKTREE, git.unmergedPathsOf))
      .toEqual({ verdict: 'known', conflictedFiles: ['src/Example.ts', 'src/Other.ts'] });
    expect(git.askedWorktrees).toEqual([]);
  });

  test('a fixer of a clean merge-in has no kept facts and no conflicted file, and git is not asked', () => {
    const git = gitAnswering(null);
    expect(AirlockFactsFile.conflictedFilesOf(mergeJobFolder, 'fixing', AIRLOCK_WORKTREE, git.unmergedPathsOf)).toEqual({ verdict: 'known', conflictedFiles: [] });
    expect(git.askedWorktrees).toEqual([]);
  });

  test('missing facts while resolving are never read as no conflict: git\'s unmerged paths in the Airlock worktree answer', () => {
    const git = gitAnswering(['src/Example.ts']);
    expect(AirlockFactsFile.conflictedFilesOf(mergeJobFolder, 'resolving', AIRLOCK_WORKTREE, git.unmergedPathsOf))
      .toEqual({ verdict: 'known', conflictedFiles: ['src/Example.ts'] });
    expect(git.askedWorktrees).toEqual([AIRLOCK_WORKTREE]);
  });

  test.each(['{"conflictedFiles": ', '{"conflictedFiles": 7}\n', '[]\n'])('malformed facts %p are never read as no conflict, in either phase', (malformed) => {
    writeFileSync(join(mergeJobFolder, 'airlock-facts.json'), malformed);
    expect(AirlockFactsFile.conflictedFilesOf(mergeJobFolder, 'fixing', AIRLOCK_WORKTREE, gitAnswering(['src/Example.ts']).unmergedPathsOf))
      .toEqual({ verdict: 'known', conflictedFiles: ['src/Example.ts'] });
    expect(AirlockFactsFile.conflictedFilesOf(mergeJobFolder, 'resolving', AIRLOCK_WORKTREE, gitAnswering(null).unmergedPathsOf)).toEqual({ verdict: 'unknown' });
  });
});
