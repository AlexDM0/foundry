/**
 * The leftover worktrees a starting Overseer names to User. What matters here: a constitution commit's worktree, one level down under
 * its own folder, belongs to its live constitution commit job and is no leftover; one whose job is gone is; and the folder that holds them is
 * never named itself. The rest of the regrouping is held by `Regrouping.integration.spec.ts` and `CrashMatrix.integration.spec.ts`. The
 * folders are real; git answers from a recorded answer set.
 */
import { mkdirSync, realpathSync } from 'node:fs';
import { join }                    from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import type { Job }                                               from '../../lib/tracker-model/@types/Job.ts';
import { WorktreesFolder }                                        from '../../shared/WorktreesFolder.ts';
import { createPlantedRepository }                                from '../../testing/RecordedAirlockGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit } from '../../testing/RecordedGit.ts';
import { removeScratchDirectory }                                 from '../../testing/ScratchWorkspace.ts';
import { workspacePathsFor }                                      from '../tracker/Workspace.ts';
import { CONSTITUTION_COMMITS_FOLDER }                            from './ConstitutionCommits.ts';
import { Regrouping }                                             from './Regrouping.ts';

const recordedGit = useRecordedGit();

let repository: string | null = null;

afterEach(() => {
  if (repository !== null) removeScratchDirectory(repository);
  repository = null;
});

function constitutionCommitJob(id: string): Job {
  return {
    id,
    kind:               'constitution-commit',
    role:               null,
    ticketIds:          [],
    parentJobId:        null,
    attempt:            1,
    target:             'main',
    state:              'merging',
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    airlock:            {
      target: 'main', targetTip: '1'.repeat(40), branchTip: '1'.repeat(40), phase: 'committing'
    },
  };
}

test('a constitution commit worktree is its live job\'s; one whose job is gone is a leftover, and their folder is never named', () => {
  repository = realpathSync(createPlantedRepository('regrouping'));
  const commitFolder = join(WorktreesFolder.worktreesRootOf(repository), CONSTITUTION_COMMITS_FOLDER);
  mkdirSync(join(commitFolder, 'J4'), { recursive: true });
  mkdirSync(join(commitFolder, 'J7'), { recursive: true });
  recordedGit.answerFrom([{
    gitArguments: ['worktree', 'list', '--porcelain'],
    answeredAs:   GIT_CALL_SHAPES.WORKTREE_LIST_MAIN_ONLY,
    filledIn:     { [RECORDED_PLACEHOLDERS.REPOSITORY]: repository, [RECORDED_PLACEHOLDERS.COMMIT]: '1'.repeat(40), [RECORDED_PLACEHOLDERS.BRANCH]: 'main' },
  }]);

  expect(Regrouping.leftoverWorktreesOf(workspacePathsFor(repository), [constitutionCommitJob('J7')])).toEqual([join(commitFolder, 'J4')]);
  expect(Regrouping.leftoverWorktreesOf(workspacePathsFor(repository), [constitutionCommitJob('J4'), constitutionCommitJob('J7')])).toEqual([]);
});
