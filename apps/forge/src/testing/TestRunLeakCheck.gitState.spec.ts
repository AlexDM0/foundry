/**
 * The git side of the leak check of `src/testing/TestRunLeakCheck.ts`: the repository under test read at the baseline and again after the
 * run. What matters: an unchanged repository fails nothing; a worktree added in a temp folder, a branch named as the scratch helpers name
 * one and a new file in the repository each fail the run and are named, the worktree with the branch it holds; a branch another
 * process makes with no worktree fails nothing; and git status is asked only of the run's program folder, so in a workspace a file
 * another member's run adds is not this run's. The folders are real; git answers from recorded answer sets, one
 * for the repository before the run and one for it after. `TestRunLeakCheck.integration.spec.ts` holds the rest of the check, on a real run.
 */
import { mkdirSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  useRecordedGit,
  type GitCallShape,
  type RecordedGitStage,
  type RecordedGitStep
} from './RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }                            from './ScratchWorkspace.ts';
import { gitProcessLinesReaderIn, leaksAfterTheRunFoldersWent, takeTestRunBaseline } from './TestRunLeakCheck.ts';

const recordedGit = useRecordedGit();

const MAIN_COMMIT = '1'.repeat(40);
const NO_RUN_FOLDERS = { scratchFolder: null, temporaryFolder: null };

let repository = '';
let plantedWorktree = '';

beforeEach(() => {
  repository      = createScratchDirectory('leak-check');
  plantedWorktree = `${repository}-worktrees/planted`;
  mkdirSync(plantedWorktree, { recursive: true });
});

afterEach(() => {
  removeScratchDirectory(`${repository}-worktrees`);
  removeScratchDirectory(repository);
});

function answered(gitArguments: readonly string[], answeredAs: GitCallShape): RecordedGitStep {
  return {
    gitArguments,
    answeredAs,
    filledIn: {
      [RECORDED_PLACEHOLDERS.REPOSITORY]: repository,
      [RECORDED_PLACEHOLDERS.BRANCH]:     'main',
      [RECORDED_PLACEHOLDERS.COMMIT]:     MAIN_COMMIT,
      [RECORDED_PLACEHOLDERS.PATH]:       plantedWorktree,
    },
  };
}

interface RepositoryAnswers {
  worktrees?: GitCallShape;
  branches?:  GitCallShape;
  status?:    GitCallShape;
}

function repositoryAnswers(answers: RepositoryAnswers = {}, statusPathspec = '.'): RecordedGitStage {
  const { worktrees = GIT_CALL_SHAPES.WORKTREE_LIST_MAIN_ONLY, branches = GIT_CALL_SHAPES.BRANCH_NAMES_OF_ONE, status = GIT_CALL_SHAPES.SHORT_STATUS_CLEAN, } = answers;
  return [
    answered(['rev-parse', '--show-toplevel'], GIT_CALL_SHAPES.TOP_LEVEL_AT_THE_ROOT),
    answered(['worktree', 'list', '--porcelain'], worktrees),
    answered(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], branches),
    answered(['status', '--porcelain', '--untracked-files=all', '--', statusPathspec], status),
  ];
}

/** The git leaks of a run that found the repository as `repositoryAnswers()` says, and left it as `after` says. */
function gitLeaksOf(after: RepositoryAnswers, programFolder = ''): string[] {
  const statusPathspec = programFolder === '' ? '.' : programFolder;
  recordedGit.answerFrom(repositoryAnswers({}, statusPathspec));
  const recordedGitLinesIn = gitProcessLinesReaderIn(repository);
  const baseline = takeTestRunBaseline(repository, `${repository}/${programFolder}`, recordedGitLinesIn);
  recordedGit.answerFrom(repositoryAnswers(after, statusPathspec));
  return leaksAfterTheRunFoldersWent(baseline, NO_RUN_FOLDERS, recordedGitLinesIn).filter((leak) => leak.startsWith('git '));
}

test('a run that leaves the repository as it found it fails nothing', () => {
  expect(gitLeaksOf({})).toEqual([]);
});

test('a worktree added in a temp folder fails the run, named with the branch it holds', () => {
  expect(gitLeaksOf({ worktrees: GIT_CALL_SHAPES.WORKTREE_LIST_WITH_A_LINKED, branches: GIT_CALL_SHAPES.BRANCH_NAMES_WITH_A_WORKTREE_BRANCH })).toEqual([
    `git worktree ${plantedWorktree} was added to ${repository}`,
    `git branch worktree/planted was added to ${repository}`,
  ]);
});

test('a branch named as the scratch helpers name one, left with no worktree, fails the run, named', () => {
  expect(gitLeaksOf({ branches: GIT_CALL_SHAPES.BRANCH_NAMES_WITH_A_WORKTREE_BRANCH })).toEqual([`git branch worktree/planted was added to ${repository}`]);
});

test('a branch that another process makes in the repository, with no worktree, does not fail the run', () => {
  expect(gitLeaksOf({ branches: GIT_CALL_SHAPES.BRANCH_NAMES_WITH_A_NEW_BRANCH })).toEqual([]);
});

test('a new file in the repository fails the run, named', () => {
  expect(gitLeaksOf({ status: GIT_CALL_SHAPES.SHORT_STATUS_OF_A_NEW_FILE })).toEqual([`git status of ${repository} gained "?? planted-file.txt"`]);
});

test('a run of a program in a workspace member folder asks git status of that folder alone', () => {
  mkdirSync(`${repository}/apps/example-app`, { recursive: true });
  expect(gitLeaksOf({ status: GIT_CALL_SHAPES.SHORT_STATUS_OF_A_NEW_FILE }, 'apps/example-app')).toEqual([`git status of ${repository} gained "?? planted-file.txt"`]);
});
