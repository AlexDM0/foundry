/**
 * The git of a default spec: `useRecordedGit` mocks `GitProcess` for a spec file with the answers real git gave, which
 * `src/lib/git/RecordedGitAnswers.integration.spec.ts` records under `bun run record src/lib/git/GitProcess.ts`. A spec plays a stage, the
 * calls one flow makes in order, each answered by its recorded call shape. A call outside a stage, or out of the stage's order, fails the case.
 * A spawned binary plays a stage the same way through `playRecordedGitInThisProcess`, which `cli/testing/CliProcess.ts` preloads into it;
 * a long-running one answers from a set through `answerRecordedGitInThisProcess`.
 * A spec of a ticket's flow, whose passes ask git as often as they run, enters a flow stage of `src/testing/RecordedGitFlow.ts` instead: one
 * answer set, asked in any order; a call it does not hold fails the case too. A spec whose passes ask git as often as they run, outside a
 * ticket's flow, gives its own answer set through `answerFrom`, one for each state the repository is in.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync
} from 'node:fs';
import { join, sep } from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  spyOn
} from 'bun:test';

import { GitProcess, type GitRun }          from '../lib/git/GitProcess.ts';
import type { BoundaryRecording }           from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf } from './BoundaryRecordings.ts';
import {
  RECORDED_FLOW_PLACE_FOLDERS,
  RECORDED_FLOW_PLACEHOLDERS,
  RECORDED_FLOW_STAGES,
  recordedFlowCallShapeOf,
  REPLAYED_OBJECT_IDS,
  type RecordedFlowCall,
  type RecordedFlowPlace,
  type RecordedFlowStageName
} from './RecordedGitFlow.ts';
import {
  scenarioCallShapeOf,
  scenarioReplacementsOf,
  type ScenarioValues,
  withScenarioPlaceholders,
  withScenarioValues
} from './RecordedGitScenarios.ts';
import { removeScratchDirectory } from './ScratchWorkspace.ts';

const GIT_BOUNDARY = 'src/lib/git/GitProcess.ts';
const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const GIT_SUCCESS_EXIT_CODE = 0;

/** The call shapes the boundary spec records, each named for the git state it was asked in. */
export const GIT_CALL_SHAPES = {
  VERSION:                             'version',
  COMMON_FOLDER_AT_THE_ROOT:           'rev-parse --git-common-dir, at the root of a repository',
  COMMON_FOLDER_IN_A_WORKTREE:         'rev-parse --git-common-dir, in a linked worktree of <repository>',
  COMMON_FOLDER_OF_A_BARE:             'rev-parse --git-common-dir, in a bare repository',
  COMMON_FOLDER_OUTSIDE:               'rev-parse --git-common-dir, outside any repository',
  BARE_ASKED_IN_A_BARE:                'rev-parse --is-bare-repository, in a bare repository',
  TOP_LEVEL_OUTSIDE:                   'rev-parse --show-toplevel, outside any repository',
  TOP_LEVEL_OF_A_BARE:                 'rev-parse --show-toplevel, in a bare repository',
  ORIGIN_URL_UNSET:                    'remote get-url origin, no origin set',
  ORIGIN_URL_SET:                      'remote get-url origin, origin set to <origin>',
  CHECK_IGNORE_NOT_IGNORED:            'check-ignore -q <path>, the path not ignored',
  CHECK_IGNORE_ALREADY_IGNORED:        'check-ignore -q <path>, the path ignored',
  TREE_OF_AN_UNPORTABLE_COMMIT:        'ls-tree -r -z --full-tree HEAD, a commit with a reserved name, a symbolic link and a case collision',
  DIFF_OF_AN_UNCHANGED_TREE:           'diff --no-ext-diff HEAD --, the worktree unchanged',
  DIFF_OF_A_REFORMATTED_FILE:          'diff --no-ext-diff HEAD --, source.txt changed from unformatted to formatted',
  CHECKOUT_OF_A_REFORMATTED_FILE:      'checkout -q -- ., source.txt changed from unformatted to formatted',
  RESOLVED_MISSING_REVISION:           'rev-parse --verify --quiet --end-of-options <revision>^{commit}, no such revision',
  QUIET_WORKTREE_ADD_ON_A_NEW_BRANCH:  'worktree add --quiet -b <branch> <worktree> <start>, the branch new',
  WORKTREE_ADD_ON_A_NEW_BRANCH:        'worktree add -b <branch> <worktree> <start>, the branch new',
  WORKTREE_REMOVE_OF_A_LEFTOVER:       'worktree remove --force <path>, the path a repository of its own and no worktree',
  WORKTREE_PRUNE_WITH_NOTHING_STALE:   'worktree prune, no stale worktree record',
  STATUS_OF_A_CLEAN_WORKTREE:          'status --porcelain=v1 --untracked-files=all --no-renames, the worktree clean',
  CURRENT_BRANCH:                      'symbolic-ref --quiet --short HEAD, on <branch>',
  WORKTREE_LIST_MAIN_ONLY:             'worktree list --porcelain, only the main checkout <repository> on <branch> at <commit>',
  BRANCH_VERIFIED:                     'rev-parse --verify --quiet <branch>, the branch at <commit>',
  BRANCH_COMMIT_RESOLVED:              'rev-parse --verify --quiet --end-of-options <branch>^{commit}, the branch at <commit>',
  FILE_NOT_ON_BRANCH:                  'show <branch>:<path>, the path not on the branch',
  FILE_ON_BRANCH:                      'show <branch>:<path>, the path on the branch holding <text>',
  TIPS_ALL_RESOLVING:                  'rev-parse --end-of-options <branch> <revision> <revision>, all three resolving',
  TIPS_LAST_NOT_RESOLVING:             'rev-parse --end-of-options <branch> <revision> <revision>, the last one not resolving',
  TREE_OF_AN_EMPTY_COMMIT:             'rev-parse --verify --quiet <revision>^{tree}, a commit with no files',
  TREE_OF_A_COMMIT_WITH_A_FILE:        'rev-parse --verify --quiet <revision>^{tree}, a commit with one file',
  BINARY_DIFF_OF_A_CHANGED_FILE:       'diff --binary HEAD, basket.ts changed from a total of 1 to 2',
  BINARY_DIFF_OF_AN_UNCHANGED_TREE:    'diff --binary HEAD, the worktree unchanged',
  ONE_UNTRACKED_FILE:                  'ls-files --others --exclude-standard -z, coupon.ts untracked',
  NO_UNTRACKED_FILE:                   'ls-files --others --exclude-standard -z, nothing untracked',
  ADDITION_OF_A_READABLE_FILE:         'diff --binary --no-index -- /dev/null coupon.ts, coupon.ts readable',
  ADDITION_OF_AN_UNREADABLE_FILE:      'diff --binary --no-index -- /dev/null coupon.ts, coupon.ts unreadable',
  WORKTREE_REMOVE_OF_A_LINKED:         'worktree remove --force <path>, a linked worktree with changes',
  INDEX_LOCK_PATH_IN_A_WORKTREE:       'rev-parse --git-path index.lock, in the linked worktree <branch> of <repository>',
  WORKTREE_PRUNE_OF_A_GONE_WORKTREE:   'worktree prune, the folder of a linked worktree gone',
  NO_UNMERGED_PATH:                    'ls-files -u, a merge resolved and committed',
  MERGE_IN_RANGE:                      'rev-list --merges --reverse <first tip>..HEAD ^<second tip>, the merge <commit> in range',
  WHITESPACE_RULE_UNSET:               'config --get core.whitespace, not set',
  WHITESPACE_RULE_SET:                 'config --get core.whitespace, set to -blank-at-eol',
  CHECK_OF_A_CLEAN_CRLF_RESOLUTION:    'diff --check under cr-at-eol, a clean CRLF resolution',
  CHECK_OF_A_CRLF_TRAILING_SPACE:      'diff --check under cr-at-eol, a CRLF resolution with a trailing space',
  CHECK_OF_A_CRLF_CONFLICT_MARKER:     'diff --check under cr-at-eol, a CRLF resolution with a conflict marker left',
  CHECK_OF_AN_ALLOWED_TRAILING_SPACE:  'diff --check under -blank-at-eol,cr-at-eol, a CRLF resolution with a trailing space',
  CHECK_OF_CLEAN_LONG_PATHS:           'diff --check under cr-at-eol, a chunk of long conflicted paths resolved clean',
  CHECK_OF_A_LONG_PATH_TRAILING_SPACE: 'diff --check under cr-at-eol, the chunk of long conflicted paths holding a trailing space',
  PARENTS_OF_THE_MERGE:                'rev-list --parents -n 1 <commit>, the merge of <first tip> and <second tip>',
  LANDING_CHECKOUT_CLEAN:              'status --porcelain=v1 -z --untracked-files=all, a main checkout holding base.ts, clean',
  LANDING_CHECKOUT_WITH_FEATURE_FILE:  'status --porcelain=v1 -z --untracked-files=all, a main checkout holding base.ts, feature.ts untracked',
  NAMES_THE_FEATURE_CHANGES:           'diff --name-only --no-renames -z HEAD <commit> --, the feature commit adding feature.ts',
  NAMES_THE_HELD_COMMIT_CHANGES:       'diff --name-only --no-renames -z HEAD <second tip> --, the feature commit and a change to base.ts on top',
  TREE_OF_THE_HELD_COMMIT:             'ls-tree -r -z --full-tree <second tip>, base.ts changed and feature.ts',
  TREE_OF_THE_LANDING_BASE:            'ls-tree -r -z --full-tree HEAD, base.ts as main holds it',
  HASHES_OF_BASE_AND_FEATURE:          'hash-object --stdin-paths, base.ts as main holds it and feature.ts as the feature commit adds it',
  FAST_FORWARD_TO_THE_FEATURE:         'merge --ff-only --quiet <commit>, the checkout clean and behind it',
  FAST_FORWARD_BLOCKED_BY_FEATURE:     'merge --ff-only --quiet <commit>, an untracked feature.ts in the way',
  NOT_AN_ANCESTOR_OF_THE_TIP:          'merge-base --is-ancestor <commit> <first tip>, the commit not on the tip',
  ANCESTOR_OF_THE_TIP:                 'merge-base --is-ancestor <commit> <commit>, the commit the tip itself',
  TREE_OF_A_REVISION:                  'rev-parse --verify --quiet <revision>^{tree}, the revision on <tree>',
  BRANCH_OF_A_WORKTREE:                'symbolic-ref --quiet HEAD, on <branch>',
  MERGE_TREE_OF_A_CLEAN_MERGE:         'merge-tree --write-tree --name-only --no-messages -z --end-of-options <target> <branch>, a clean merge into <tree>',
  MERGE_TREE_OF_A_CONFLICT:            'merge-tree --write-tree --name-only --no-messages -z --end-of-options <target> <branch>, <path> conflicted',
  ANCESTOR_CONFIRMED:                  'merge-base --is-ancestor <target tip> <branch tip>, the target tip an ancestor',
  ANCESTOR_DENIED:                     'merge-base --is-ancestor <target tip> <branch tip>, the target tip no ancestor',
  MERGE_IN_CLEAN:                      'merge --no-ff --no-edit --quiet <commit>, a clean merge',
  MERGE_IN_CONFLICTED:                 'merge --no-ff --no-edit --quiet <commit>, <path> conflicted',
  UNMERGED_FILES_OF_A_CONFLICT:        'diff --name-only --diff-filter=U -z, <path> unmerged',
  MERGE_ABORT_OF_A_CONFLICT:           'merge --abort, a conflicted merge in progress',
  HARD_RESET_TO_A_COMMIT:              'reset --hard --quiet <commit>, the commit in the history',
  NUL_STATUS_OF_A_CLEAN_CHECKOUT:      'status --porcelain=v1 -z --untracked-files=all, the checkout clean',
  FILES_CHANGED_UP_TO_A_COMMIT:        'diff --name-only --no-renames -z HEAD <commit> --, <path> changed',
  FAST_FORWARD_TO_A_COMMIT:            'merge --ff-only --quiet <commit>, a fast-forward',
  COUNT_OF_AN_EMPTY_RANGE:             'rev-list --count <branch>..<target>, no commit in the range',
  WORKTREE_TOP_AND_COMMON_FOLDER:      'rev-parse --path-format=absolute --show-toplevel --git-common-dir, in a linked worktree <path> of <repository>',
  ABSOLUTE_COMMON_FOLDER_AT_THE_ROOT:  'rev-parse --path-format=absolute --git-common-dir, at the root of <repository>',
  WORKTREE_ADD_ON_AN_EXISTING_BRANCH:  'worktree add --quiet <path> <branch>, the branch existing',
  WORKTREE_ADD_DETACHED:               'worktree add --quiet --detach <path> <commit>',
  TOP_LEVEL_IN_A_WORKTREE:             'rev-parse --path-format=absolute --show-toplevel --git-common-dir, in a linked worktree <path> of <repository>',
  TOP_LEVEL_IN_NO_REPOSITORY:          'rev-parse --path-format=absolute --show-toplevel --git-common-dir, in a folder of no repository',
  STATUS_OF_TRACKED_FILES_CLEAN:       'status --porcelain=v1 --untracked-files=no, the worktree clean',
  STATUS_OF_TRACKED_FILES_MODIFIED:    'status --porcelain=v1 --untracked-files=no, base.ts modified',
  CHECKOUT_DETACHED:                   'checkout --quiet --detach <commit>',
  FULL_CURRENT_BRANCH:                 'symbolic-ref --quiet HEAD, on <branch>',
  WORKTREE_REMOVE_OF_A_CLEAN_WORKTREE: 'worktree remove <path>, a clean linked worktree',
  BRANCH_DELETE_OF_A_MERGED_BRANCH:    'branch -d <branch>, the branch merged',
  BRANCH_DELETE_OF_AN_UNMERGED_BRANCH: 'branch -d <branch>, the branch holding a commit no other branch has',
  IS_AN_ANCESTOR:                      'merge-base --is-ancestor <revision> <revision>, the first an ancestor of the second',
  IS_NO_ANCESTOR:                      'merge-base --is-ancestor <revision> <revision>, the first not an ancestor of the second',
  CONFLICTED_FILES_OF_A_MERGE:         'diff --name-only --diff-filter=U -z, a merge stopped with shared.txt conflicted',
} as const;

const LONG_CONFLICTED_PATH_COUNT = 300;

/** Several hundred conflicted paths too long for one argv, the same in the recording and in the spec that replays it. */
export function recordedLongConflictedPaths(): string[] {
  const folder = `example-${'folder'.repeat(16)}`;
  return Array.from({ length: LONG_CONFLICTED_PATH_COUNT }, (_unused, i) => `${folder}/example-conflicted-file-${String(i).padStart(4, '0')}.txt`);
}

export type GitCallShape = typeof GIT_CALL_SHAPES[keyof typeof GIT_CALL_SHAPES];

/** The places a recorded answer holds for a value of the state it was asked in, which the step that replays it fills in. */
export const RECORDED_PLACEHOLDERS = {
  REPOSITORY: '<repository>',
  ORIGIN:     '<origin>',
  BRANCH:     '<branch>',
  COMMIT:     '<commit>',
  PATH:       '<path>',
  TEXT:       '<text>',
  FIRST_TIP:  '<first tip>',
  SECOND_TIP: '<second tip>',
  TREE:       '<tree>',
} as const;

/**
 * One call a stage expects: the arguments production passes and what answers them, a recorded call shape with its placeholders filled in,
 * or a fixed answer for a state real git cannot be put in, such as an older version. `removesFolder` is the folder git removes for the
 * call, which the replay removes too.
 */
export type RecordedGitStep = ({
  readonly gitArguments: readonly string[];
  readonly answeredAs:   GitCallShape;
  readonly filledIn?:    Readonly<Partial<Record<typeof RECORDED_PLACEHOLDERS[keyof typeof RECORDED_PLACEHOLDERS], string>>>;
} | {
  readonly gitArguments: readonly string[];
  readonly fixedAnswer:  GitRun;
}) & {
  /** The folder git removes for the call, which the replay removes too. */
  readonly removesFolder?: string;
  /** The folder the call must be asked in, when the spec holds which one. */
  readonly directory?:     string;
};

export type RecordedGitStage = readonly RecordedGitStep[];

export interface RecordedGit {
  /** Runs `action` with `stage` as the only git calls allowed, in order, and fails when `action` leaves a step of it unasked. */
  playStage:           <Result>(stage: RecordedGitStage, action: () => Promise<Result>) => Promise<Result>;
  /**
   * Until the case ends, answers each call outside a played stage from the answer set of the flow stage `stage` of
   * `src/testing/RecordedGitFlow.ts`, for the repository in `repositoryDirectory`, in any order and as often as asked. A call whose answer
   * moves the repository on enters the next stage.
   */
  enterFlowStage:      (stage: RecordedFlowStageName, repositoryDirectory: string) => void;
  /**
   * Each call the flow stages answered in this case, its arguments as recorded: the repository and the object ids as placeholders; and each
   * call an answer set answered, its arguments as asked.
   */
  flowCalls:           () => readonly (readonly string[])[];
  /** The calls of this case that had no answer, taken, so a spec that shows such a failure can end its case green. */
  takeUnansweredCalls: () => string[];
  /**
   * Until the case ends or another scenario is entered, answers each call outside a played stage from the recording of `scenario` of
   * `src/testing/RecordedGitScenarios.ts`, its placeholders filled from `values`, in any order and as often as asked.
   */
  enterScenario:       (scenario: string, values: ScenarioValues) => void;
  /**
   * Until the case ends or the next call of it, answers each call outside a played stage by the step of `answerSet` with its arguments, in
   * any order and as often as asked, for a case whose passes decide how often git is asked. A call no step names fails the case.
   */
  answerFrom:          (answerSet: RecordedGitStage) => void;
}

interface ScenarioPosition {
  scenario:     string;
  replacements: (readonly [string, string])[];
}

function scenarioAnswerOf(position: ScenarioPosition, directory: string, gitArguments: readonly string[]): GitRun | null {
  const callShape = scenarioCallShapeOf(
    position.scenario,
    withScenarioPlaceholders(directory, position.replacements),
    gitArguments.map((argument) => withScenarioPlaceholders(argument, position.replacements)),
  );
  const answer = recordedAnswersOfThisOs().get(callShape);
  if (answer === undefined) return null;
  return {
    ...answer,
    standardOutput: withScenarioValues(answer.standardOutput, position.replacements),
    standardError:  withScenarioValues(answer.standardError, position.replacements),
  };
}

let recordedAnswers: ReadonlyMap<string, GitRun> | null = null;

function recordedAnswersOfThisOs(): ReadonlyMap<string, GitRun> {
  if (recordedAnswers !== null) return recordedAnswers;
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(GIT_BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) throw new Error(`no git answers are recorded for ${process.platform}: run \`${recordCommandOf(GIT_BOUNDARY)}\`.`);
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  recordedAnswers = new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer as GitRun]));
  return recordedAnswers;
}

function answerOfStep(step: RecordedGitStep): GitRun {
  if ('fixedAnswer' in step) return step.fixedAnswer;
  const answer = recordedAnswersOfThisOs().get(step.answeredAs);
  if (answer === undefined) throw new Error(`the git recording holds no answer for "${step.answeredAs}": run \`${recordCommandOf(GIT_BOUNDARY)}\`.`);
  const filledIn = Object.entries(step.filledIn ?? {});
  const filled = (text: string): string => filledIn.reduce((output, [placeholder, value]) => output.replaceAll(placeholder, value), text);
  return { ...answer, standardOutput: filled(answer.standardOutput), standardError: filled(answer.standardError) };
}

function describedCall(gitArguments: readonly string[]): string {
  return `git ${gitArguments.join(' ')}`;
}

/** `repositoryDirectory` as a spec named it, and resolved as git prints it: production asks in either. */
interface FlowPosition {
  stage:                       RecordedFlowStageName;
  repositoryDirectory:         string;
  resolvedRepositoryDirectory: string;
}

interface StagePlayer {
  answerOf:       (directory: string, gitArguments: readonly string[]) => GitRun;
  resolvedCommit: (directory: string, revision: string) => string | null;
  start:          (stage: RecordedGitStage) => void;
  /** The steps left unasked, described, and the stage emptied. */
  end:            () => string[];
  enterFlow:      (position: FlowPosition) => void;
  flowCalls:      () => readonly (readonly string[])[];
  answerFrom:     (answerSet: RecordedGitStage) => void;
  /** Leaves the flow, the scenario and the answer set, and forgets the flow's calls. */
  endFlow:        () => void;
  enterScenario:  (position: ScenarioPosition) => void;
}

type GitAnswerer = (directory: string, gitArguments: readonly string[]) => GitRun;

/** `GitProcess.resolvedCommitOf` asks this call, so a stage or an answer set names it like any other. */
function resolvedCommitThrough(answerOf: GitAnswerer): (directory: string, revision: string) => string | null {
  return (directory, revision) => {
    const answer = answerOf(directory, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`]);
    return answer.exitCode === GIT_SUCCESS_EXIT_CODE ? answer.standardOutput.trim() : null;
  };
}

const REPLAYED_ID_PLACEHOLDERS = Object.entries(REPLAYED_OBJECT_IDS);

function flowPlaceOf(recordedDirectory: string): RecordedFlowPlace | null {
  const placeFolder = RECORDED_FLOW_PLACE_FOLDERS.find(([, folder]) => recordedDirectory === folder || recordedDirectory.startsWith(`${folder}${sep}`));
  return placeFolder === undefined ? null : placeFolder[0];
}

/** The resolved folder first, since the folder a spec named, such as `/tmp/…`, can lie inside it as text. */
function asRecorded(text: string, position: FlowPosition): string {
  const withRepository = text.replaceAll(position.resolvedRepositoryDirectory, RECORDED_FLOW_PLACEHOLDERS.REPOSITORY)
    .replaceAll(position.repositoryDirectory, RECORDED_FLOW_PLACEHOLDERS.REPOSITORY);
  return REPLAYED_ID_PLACEHOLDERS.reduce((replaced, [placeholder, objectId]) => replaced.replaceAll(objectId, placeholder), withRepository);
}

function asReplayed(text: string, position: FlowPosition): string {
  const withRepository = text.replaceAll(RECORDED_FLOW_PLACEHOLDERS.REPOSITORY, position.resolvedRepositoryDirectory);
  return REPLAYED_ID_PLACEHOLDERS.reduce((filled, [placeholder, objectId]) => filled.replaceAll(placeholder, objectId), withRepository);
}

/** The recorded answer of the flow stage's call, or null when the stage has no such call. */
function flowAnswerOf(position: FlowPosition, place: RecordedFlowPlace, recordedArguments: readonly string[]): { answer: GitRun; call: RecordedFlowCall } | null {
  const call = RECORDED_FLOW_STAGES[position.stage].find((candidate) => candidate.place === place && JSON.stringify(candidate.gitArguments) === JSON.stringify(recordedArguments));
  if (call === undefined) return null;
  const callShape = recordedFlowCallShapeOf(position.stage, place, recordedArguments);
  const answer = recordedAnswersOfThisOs().get(callShape);
  if (answer === undefined) throw new Error(`the git recording holds no answer for "${callShape}": run \`${recordCommandOf(GIT_BOUNDARY)}\`.`);
  return {
    answer: { ...answer, standardOutput: asReplayed(answer.standardOutput, position), standardError: asReplayed(answer.standardError, position) },
    call,
  };
}

function createStagePlayer(reportUnanswered: (unanswered: string) => void): StagePlayer {
  let remainingSteps: RecordedGitStep[] = [];
  let flowPosition: FlowPosition | null = null;
  let answerSet: RecordedGitStage | null = null;
  let answeredFlowCalls: (readonly string[])[] = [];
  let scenarioPosition: ScenarioPosition | null = null;
  const unansweredError = (directory: string, gitArguments: readonly string[], expected: string): Error => {
    const unanswered = `${describedCall(gitArguments)} in ${directory} has no recorded answer: ${expected}`;
    reportUnanswered(unanswered);
    return new Error(unanswered);
  };
  const flowAnswer = (position: FlowPosition, directory: string, gitArguments: readonly string[]): GitRun => {
    const place = flowPlaceOf(asRecorded(directory, position));
    const recordedArguments = gitArguments.map((argument) => asRecorded(argument, position));
    const found = place === null ? null : flowAnswerOf(position, place, recordedArguments);
    const placeWording = place === null ? 'in any of its places' : `in the ${place}`;
    if (found === null) throw unansweredError(directory, gitArguments, `the flow stage "${position.stage}" has no such call ${placeWording}`);
    answeredFlowCalls.push(recordedArguments);
    if (found.call.leavesFolder !== undefined) mkdirSync(asReplayed(found.call.leavesFolder, position), { recursive: true });
    if (found.call.removesFolder !== undefined) removeScratchDirectory(asReplayed(found.call.removesFolder, position));
    if (found.call.nextStage !== undefined) flowPosition = { ...position, stage: found.call.nextStage };
    return found.answer;
  };
  const setAnswer = (set: RecordedGitStage, directory: string, gitArguments: readonly string[]): GitRun => {
    const step = set.find((candidate) => JSON.stringify(candidate.gitArguments) === JSON.stringify(gitArguments));
    if (step === undefined) throw unansweredError(directory, gitArguments, 'the answer set names no such call');
    answeredFlowCalls.push(gitArguments);
    return answerOfStep(step);
  };
  const answerOf = (directory: string, gitArguments: readonly string[]): GitRun => {
    const [nextStep] = remainingSteps;
    if (nextStep === undefined && answerSet !== null) return setAnswer(answerSet, directory, gitArguments);
    if (nextStep === undefined && flowPosition !== null) return flowAnswer(flowPosition, directory, gitArguments);
    if (nextStep === undefined && scenarioPosition !== null) {
      const answer = scenarioAnswerOf(scenarioPosition, directory, gitArguments);
      if (answer === null) throw unansweredError(directory, gitArguments, `the scenario "${scenarioPosition.scenario}" recorded no such call`);
      return answer;
    }
    const askedElsewhere = nextStep?.directory !== undefined && nextStep.directory !== directory;
    if (nextStep === undefined || askedElsewhere || JSON.stringify(nextStep.gitArguments) !== JSON.stringify(gitArguments)) {
      const expectedFolder = askedElsewhere ? ` in ${nextStep.directory}` : '';
      throw unansweredError(directory, gitArguments, `the stage expected ${nextStep === undefined ? 'no call' : `${describedCall(nextStep.gitArguments)}${expectedFolder}`}`);
    }
    remainingSteps = remainingSteps.slice(1);
    if (nextStep.removesFolder !== undefined) removeScratchDirectory(nextStep.removesFolder);
    return answerOfStep(nextStep);
  };
  return {
    answerOf,
    resolvedCommit: resolvedCommitThrough(answerOf),
    start:          (stage) => {
      remainingSteps = [...stage];
    },
    end: () => {
      const unasked = remainingSteps.map(({ gitArguments }) => describedCall(gitArguments));
      remainingSteps = [];
      return unasked;
    },
    enterFlow: (position) => {
      flowPosition = position;
    },
    flowCalls:  () => answeredFlowCalls,
    answerFrom: (set) => {
      answerSet = set;
    },
    endFlow: () => {
      flowPosition = null;
      scenarioPosition = null;
      answerSet = null;
      answeredFlowCalls = [];
    },
    enterScenario: (position) => {
      scenarioPosition = position;
    },
  };
}

/** Call at a spec file's top level: every case of the file runs on recorded answers, and the file's end restores `GitProcess`. */
export function useRecordedGit(): RecordedGit {
  const unansweredCalls: string[] = [];
  const player = createStagePlayer((unanswered) => unansweredCalls.push(unanswered));

  beforeAll(() => {
    spyOn(GitProcess, 'run').mockImplementation(player.answerOf);
    spyOn(GitProcess, 'resolvedCommitOf').mockImplementation(player.resolvedCommit);
  });
  afterEach(() => {
    player.endFlow();
    // Production code may catch the throw of an unanswered call, so the case fails here too.
    const unanswered = unansweredCalls.splice(0);
    if (unanswered.length > 0) throw new Error(unanswered.join('\n'));
  });
  afterAll(() => {
    spyOn(GitProcess, 'run').mockRestore();
    spyOn(GitProcess, 'resolvedCommitOf').mockRestore();
  });

  return {
    playStage: async (stage, action) => {
      player.start(stage);
      let finished = false;
      try {
        const result = await action();
        finished = true;
        return result;
      } finally {
        const unasked = player.end();
        if (finished && unasked.length > 0) throw new Error(`the stage expected ${unasked.join(', ')}, which never came`);
      }
    },
    enterFlowStage:      (stage, repositoryDirectory) => player.enterFlow({ stage, repositoryDirectory, resolvedRepositoryDirectory: realpathSync(repositoryDirectory) }),
    flowCalls:           player.flowCalls,
    takeUnansweredCalls: () => unansweredCalls.splice(0),
    enterScenario:       (scenario, values) => player.enterScenario({ scenario, replacements: scenarioReplacementsOf(values) }),
    answerFrom:          player.answerFrom,
  };
}

/**
 * Called by the preload a spawned binary gets: the whole process plays `stage`, and each call it could not answer, and each step it
 * left unasked by its exit, is a line of `reportPath`, which the spawning spec reads once the process ends.
 */
export function playRecordedGitInThisProcess(stage: RecordedGitStage, reportPath: string): void {
  const player = createStagePlayer((unanswered) => appendFileSync(reportPath, `${unanswered}\n`));
  player.start(stage);
  Object.assign(GitProcess, { run: player.answerOf, resolvedCommitOf: player.resolvedCommit });
  process.on('exit', () => {
    const unasked = player.end();
    if (unasked.length > 0) appendFileSync(reportPath, `the stage expected ${unasked.join(', ')}, which never came\n`);
  });
}

/**
 * Called by the preload a long-running binary gets, such as an Overseer, whose timing decides how often it asks git: each call is answered
 * by the step of `answerSet` with its arguments, in any order and any number of times. Each call no step names is a line of `reportPath`.
 */
export function answerRecordedGitInThisProcess(answerSet: RecordedGitStage, reportPath: string): void {
  const answerOf: GitAnswerer = (directory, gitArguments) => {
    const step = answerSet.find((candidate) => JSON.stringify(candidate.gitArguments) === JSON.stringify(gitArguments));
    if (step !== undefined) return answerOfStep(step);
    const unanswered = `${describedCall(gitArguments)} in ${directory} has no recorded answer: the answer set names no such call`;
    appendFileSync(reportPath, `${unanswered}\n`);
    throw new Error(unanswered);
  };
  Object.assign(GitProcess, { run: answerOf, resolvedCommitOf: resolvedCommitThrough(answerOf) });
}
