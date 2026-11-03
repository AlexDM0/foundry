/**
 * The git calls each adopting command makes, in order, as the stages a spec plays on recorded git answers: the order is production's, so a
 * stage that no longer matches fails the case naming the call it did not expect.
 */
import { PRODUCT_NAMES }                                        from '../../src/shared/constants/ProductNames.ts';
import type { GitCallShape, RecordedGitStage, RecordedGitStep } from '../../src/testing/RecordedGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS }               from '../../src/testing/RecordedGit.ts';

const INSTALLED_SKILLS_FOLDER = '.claude/skills';
const SKILL_FOLDERS = [PRODUCT_NAMES.PRODUCT_OWNER_SKILL, PRODUCT_NAMES.ORCHESTRATE_SKILL].map((skill) => `${INSTALLED_SKILLS_FOLDER}/${skill}`);

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

function skillFoldersChecked(answeredAs: GitCallShape): RecordedGitStep[] {
  return SKILL_FOLDERS.map((folder) => checkIgnoreOf(folder, answeredAs));
}

/** The git calls `init` makes in a repository with no `.gitignore`: the second worktrees check runs after `init` wrote the line. */
export const INIT_IN_A_NEW_REPOSITORY: RecordedGitStage = [
  COMMON_FOLDER_AT_THE_ROOT,
  COMMON_FOLDER_AT_THE_ROOT,
  GIT_VERSION,
  COMMON_FOLDER_AT_THE_ROOT,
  checkIgnoreOf(PRODUCT_NAMES.DATA_FOLDER, GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED),
  checkIgnoreOf(PRODUCT_NAMES.WORKTREES_FOLDER, GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED),
  ...skillFoldersChecked(GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED),
  checkIgnoreOf(PRODUCT_NAMES.WORKTREES_FOLDER, GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED),
];

/** The refresh `update` makes, and `init` after its own checks, in a repository whose `.gitignore` already names every folder. */
export const REFRESH_OF_AN_IGNORING_REPOSITORY: RecordedGitStage = [
  ...skillFoldersChecked(GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED),
  checkIgnoreOf(PRODUCT_NAMES.WORKTREES_FOLDER, GIT_CALL_SHAPES.CHECK_IGNORE_ALREADY_IGNORED),
];

/** `init` at the root of an existing tracker. */
export const INIT_ON_AN_EXISTING_TRACKER: RecordedGitStage = [COMMON_FOLDER_AT_THE_ROOT, GIT_VERSION, ...REFRESH_OF_AN_IGNORING_REPOSITORY];
