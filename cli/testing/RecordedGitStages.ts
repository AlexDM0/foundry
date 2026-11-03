/**
 * The git calls each adopting command makes, in order, as the stages a spec plays on recorded git answers: the order is production's, so a
 * stage that no longer matches fails the case naming the call it did not expect. A stage of a program run under other product names checks
 * that program's folders, so each stage is also built for a set of names.
 */
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

export const INIT_IN_A_NEW_REPOSITORY: RecordedGitStage = initInANewRepositoryOf(PRODUCT_NAMES);
export const BINARY_INIT_IN_A_NEW_REPOSITORY: RecordedGitStage = binaryInitInANewRepositoryOf(PRODUCT_NAMES);
export const REFRESH_OF_AN_IGNORING_REPOSITORY: RecordedGitStage = refreshOfAnIgnoringRepositoryOf(PRODUCT_NAMES);
export const INIT_ON_AN_EXISTING_TRACKER: RecordedGitStage = initOnAnExistingTrackerOf(PRODUCT_NAMES);
