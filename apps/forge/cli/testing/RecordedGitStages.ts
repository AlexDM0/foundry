/**
 * The git calls each adopting command makes, in order, as the stages a spec plays on recorded git answers: the order is production's, so a
 * stage that no longer matches fails the case naming the call it did not expect. A stage of a program run under other product names checks
 * that program's folders, so each stage is also built for a set of names.
 */
import { realpathSync } from 'node:fs';

import { PRODUCT_NAMES, type ProductNames }                     from '../../src/shared/constants/ProductNames.ts';
import type { GitCallShape, RecordedGitStage, RecordedGitStep } from '../../src/testing/RecordedGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS }               from '../../src/testing/RecordedGit.ts';

const INSTALLED_SKILLS_FOLDER = '.claude/skills';

export const COMMON_FOLDER_AT_THE_ROOT: RecordedGitStep = { gitArguments: ['rev-parse', '--git-common-dir'], answeredAs: GIT_CALL_SHAPES.COMMON_FOLDER_AT_THE_ROOT };
export const COMMON_FOLDER_OUTSIDE: RecordedGitStep = { gitArguments: ['rev-parse', '--git-common-dir'], answeredAs: GIT_CALL_SHAPES.COMMON_FOLDER_OUTSIDE };
export const GIT_VERSION: RecordedGitStep = { gitArguments: ['version'], answeredAs: GIT_CALL_SHAPES.VERSION };

export function commonFolderInAWorktreeOf(repositoryDirectory: string): RecordedGitStep {
  return {
    gitArguments: ['rev-parse', '--git-common-dir'],
    answeredAs:   GIT_CALL_SHAPES.COMMON_FOLDER_IN_A_WORKTREE,
    filledIn:     { [RECORDED_PLACEHOLDERS.REPOSITORY]: repositoryDirectory },
  };
}

/** The root asked in a bare repository: the isolation check and `init` each ask it, and `init` refuses the bare repository. */
export const ROOT_OF_A_BARE: RecordedGitStage = [
  { gitArguments: ['rev-parse', '--git-common-dir'], answeredAs: GIT_CALL_SHAPES.COMMON_FOLDER_OF_A_BARE },
  { gitArguments: ['rev-parse', '--show-toplevel'], answeredAs: GIT_CALL_SHAPES.TOP_LEVEL_OF_A_BARE },
  { gitArguments: ['rev-parse', '--is-bare-repository'], answeredAs: GIT_CALL_SHAPES.BARE_ASKED_IN_A_BARE },
];

export function checkIgnoreOf(folder: string, answeredAs: GitCallShape): RecordedGitStep {
  return { gitArguments: ['check-ignore', '-q', `${folder}/`], answeredAs };
}

function skillFoldersChecked(productNames: Readonly<ProductNames>, answeredAs: GitCallShape): RecordedGitStep[] {
  return [productNames.PRODUCT_OWNER_SKILL, productNames.ORCHESTRATE_SKILL].map((skill) => checkIgnoreOf(`${INSTALLED_SKILLS_FOLDER}/${skill}`, answeredAs));
}

/** The git calls `init` makes in a repository with no `.gitignore`: the second worktrees check runs after `init` wrote the line. */
export function initInANewRepositoryOf(productNames: Readonly<ProductNames>): RecordedGitStage {
  return [
    COMMON_FOLDER_AT_THE_ROOT,
    COMMON_FOLDER_AT_THE_ROOT,
    GIT_VERSION,
    COMMON_FOLDER_AT_THE_ROOT,
    checkIgnoreOf(productNames.DATA_FOLDER, GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED),
    checkIgnoreOf(productNames.WORKTREES_FOLDER, GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED),
    ...skillFoldersChecked(productNames, GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED),
    checkIgnoreOf(productNames.WORKTREES_FOLDER, GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED),
  ];
}

/** The same `init` run by the binary: only an in-process captured context asks for the root first. */
export function binaryInitInANewRepositoryOf(productNames: Readonly<ProductNames>): RecordedGitStage {
  return initInANewRepositoryOf(productNames).slice(1);
}

/** The refresh `update` makes, and `init` after its own checks, in a repository whose `.gitignore` already names every folder. */
export function refreshOfAnIgnoringRepositoryOf(productNames: Readonly<ProductNames>): RecordedGitStage {
  return [
    ...skillFoldersChecked(productNames, GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED),
    checkIgnoreOf(productNames.WORKTREES_FOLDER, GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED),
  ];
}

/** `init` at the root of an existing tracker. */
export function initOnAnExistingTrackerOf(productNames: Readonly<ProductNames>): RecordedGitStage {
  return [COMMON_FOLDER_AT_THE_ROOT, GIT_VERSION, ...refreshOfAnIgnoringRepositoryOf(productNames)];
}

const IDLE_BRANCH = 'main';
const IDLE_COMMIT = '0123456789abcdef0123456789abcdef01234567';

/**
 * What an idle Overseer asks git about a repository with one checkout and one commit. Its polls decide how often, so it answers from a
 * set rather than a stage.
 */
export function idleOverseerAnswersIn(repositoryDirectory: string): RecordedGitStage {
  const onTheBranch = { [RECORDED_PLACEHOLDERS.BRANCH]: IDLE_BRANCH, [RECORDED_PLACEHOLDERS.COMMIT]: IDLE_COMMIT };
  return [
    GIT_VERSION,
    { gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'], answeredAs: GIT_CALL_SHAPES.CURRENT_BRANCH, filledIn: onTheBranch },
    {
      gitArguments: ['worktree', 'list', '--porcelain'],
      answeredAs:   GIT_CALL_SHAPES.WORKTREE_LIST_MAIN_ONLY,
      filledIn:     { ...onTheBranch, [RECORDED_PLACEHOLDERS.REPOSITORY]: realpathSync(repositoryDirectory) },
    },
    { gitArguments: ['rev-parse', '--verify', '--quiet', IDLE_BRANCH], answeredAs: GIT_CALL_SHAPES.BRANCH_VERIFIED, filledIn: onTheBranch },
    {
      gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${IDLE_BRANCH}^{commit}`],
      answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
      filledIn:     onTheBranch,
    },
  ];
}

/** The read of main's `CONSTITUTION.md` that a pipeline setup opens on, on a main line with one commit that holds none. */
export const MAIN_WITHOUT_A_CONSTITUTION: RecordedGitStage = [
  {
    gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    answeredAs:   GIT_CALL_SHAPES.CURRENT_BRANCH,
    filledIn:     { [RECORDED_PLACEHOLDERS.BRANCH]: IDLE_BRANCH },
  },
  {
    gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${IDLE_BRANCH}^{commit}`],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
    filledIn:     { [RECORDED_PLACEHOLDERS.BRANCH]: IDLE_BRANCH, [RECORDED_PLACEHOLDERS.COMMIT]: IDLE_COMMIT },
  },
  { gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${IDLE_COMMIT}:CONSTITUTION.md`], answeredAs: GIT_CALL_SHAPES.BLOB_OF_A_MISSING_PATH },
];

export const INIT_IN_A_NEW_REPOSITORY: RecordedGitStage = initInANewRepositoryOf(PRODUCT_NAMES);
export const BINARY_INIT_IN_A_NEW_REPOSITORY: RecordedGitStage = binaryInitInANewRepositoryOf(PRODUCT_NAMES);
export const REFRESH_OF_AN_IGNORING_REPOSITORY: RecordedGitStage = refreshOfAnIgnoringRepositoryOf(PRODUCT_NAMES);
export const INIT_ON_AN_EXISTING_TRACKER: RecordedGitStage = initOnAnExistingTrackerOf(PRODUCT_NAMES);
