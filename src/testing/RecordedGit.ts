/**
 * The git of a default spec: `useRecordedGit` mocks `GitProcess` for a spec file with the answers real git gave, which
 * `src/lib/git/RecordedGitAnswers.integration.spec.ts` records under `bun run record src/lib/git/GitProcess.ts`. A spec plays a stage, the
 * calls one flow makes in order, each answered by its recorded call shape. A call outside a stage, or out of the stage's order, fails the case.
 * A spawned binary plays a stage the same way through `playRecordedGitInThisProcess`, which `cli/testing/CliProcess.ts` preloads into it;
 * a long-running one answers from a set through `answerRecordedGitInThisProcess`.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join }                                     from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  spyOn
} from 'bun:test';

import { GitProcess, type GitRun }          from '../lib/git/GitProcess.ts';
import type { BoundaryRecording }           from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf } from './BoundaryRecordings.ts';

const GIT_BOUNDARY = 'src/lib/git/GitProcess.ts';
const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const GIT_SUCCESS_EXIT_CODE = 0;

/** The call shapes the boundary spec records, each named for the git state it was asked in. */
export const GIT_CALL_SHAPES = {
  VERSION:                            'version',
  COMMON_FOLDER_AT_THE_ROOT:          'rev-parse --git-common-dir, at the root of a repository',
  COMMON_FOLDER_IN_A_WORKTREE:        'rev-parse --git-common-dir, in a linked worktree of <repository>',
  COMMON_FOLDER_OF_A_BARE:            'rev-parse --git-common-dir, in a bare repository',
  COMMON_FOLDER_OUTSIDE:              'rev-parse --git-common-dir, outside any repository',
  BARE_ASKED_IN_A_BARE:               'rev-parse --is-bare-repository, in a bare repository',
  TOP_LEVEL_OUTSIDE:                  'rev-parse --show-toplevel, outside any repository',
  TOP_LEVEL_OF_A_BARE:                'rev-parse --show-toplevel, in a bare repository',
  ORIGIN_URL_UNSET:                   'remote get-url origin, no origin set',
  ORIGIN_URL_SET:                     'remote get-url origin, origin set to <origin>',
  CHECK_IGNORE_NOT_IGNORED:           'check-ignore -q <path>, the path not ignored',
  CHECK_IGNORE_ALREADY_IGNORED:       'check-ignore -q <path>, the path ignored',
  TREE_OF_AN_UNPORTABLE_COMMIT:       'ls-tree -r -z --full-tree HEAD, a commit with a reserved name, a symbolic link and a case collision',
  DIFF_OF_AN_UNCHANGED_TREE:          'diff --no-ext-diff HEAD --, the worktree unchanged',
  RESOLVED_MISSING_REVISION:          'rev-parse --verify --quiet --end-of-options <revision>^{commit}, no such revision',
  QUIET_WORKTREE_ADD_ON_A_NEW_BRANCH: 'worktree add --quiet -b <branch> <worktree> <start>, the branch new',
  WORKTREE_ADD_ON_A_NEW_BRANCH:       'worktree add -b <branch> <worktree> <start>, the branch new',
  STATUS_OF_A_CLEAN_WORKTREE:         'status --porcelain=v1 --untracked-files=all --no-renames, the worktree clean',
  CURRENT_BRANCH:                     'symbolic-ref --quiet --short HEAD, on <branch>',
  WORKTREE_LIST_MAIN_ONLY:            'worktree list --porcelain, only the main checkout <repository> on <branch> at <commit>',
  BRANCH_VERIFIED:                    'rev-parse --verify --quiet <branch>, the branch at <commit>',
  BRANCH_COMMIT_RESOLVED:             'rev-parse --verify --quiet --end-of-options <branch>^{commit}, the branch at <commit>',
  FILE_NOT_ON_BRANCH:                 'show <branch>:<path>, the path not on the branch',
} as const;

export type GitCallShape = typeof GIT_CALL_SHAPES[keyof typeof GIT_CALL_SHAPES];

/** The places a recorded answer holds for a value of the state it was asked in, which the step that replays it fills in. */
export const RECORDED_PLACEHOLDERS = {
  REPOSITORY: '<repository>',
  ORIGIN:     '<origin>',
  BRANCH:     '<branch>',
  COMMIT:     '<commit>',
  PATH:       '<path>',
} as const;

/**
 * One call a stage expects: the arguments production passes and what answers them, a recorded call shape with its placeholders filled in,
 * or a fixed answer for a state real git cannot be put in, such as an older version.
 */
export type RecordedGitStep = {
  readonly gitArguments: readonly string[];
  readonly answeredAs:   GitCallShape;
  readonly filledIn?:    Readonly<Partial<Record<typeof RECORDED_PLACEHOLDERS[keyof typeof RECORDED_PLACEHOLDERS], string>>>;
} | {
  readonly gitArguments: readonly string[];
  readonly fixedAnswer:  GitRun;
};

export type RecordedGitStage = readonly RecordedGitStep[];

export interface RecordedGit {
  /** Runs `action` with `stage` as the only git calls allowed, in order, and fails when `action` leaves a step of it unasked. */
  playStage: <Result>(stage: RecordedGitStage, action: () => Promise<Result>) => Promise<Result>;
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

interface StagePlayer {
  answerOf:       (directory: string, gitArguments: readonly string[]) => GitRun;
  resolvedCommit: (directory: string, revision: string) => string | null;
  start:          (stage: RecordedGitStage) => void;
  /** The steps left unasked, described, and the stage emptied. */
  end:            () => string[];
}

type GitAnswerer = (directory: string, gitArguments: readonly string[]) => GitRun;

/** `GitProcess.resolvedCommitOf` asks this call, so a stage or an answer set names it like any other. */
function resolvedCommitThrough(answerOf: GitAnswerer): (directory: string, revision: string) => string | null {
  return (directory, revision) => {
    const answer = answerOf(directory, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`]);
    return answer.exitCode === GIT_SUCCESS_EXIT_CODE ? answer.standardOutput.trim() : null;
  };
}

function createStagePlayer(reportUnanswered: (unanswered: string) => void): StagePlayer {
  let remainingSteps: RecordedGitStep[] = [];
  const answerOf = (directory: string, gitArguments: readonly string[]): GitRun => {
    const [nextStep] = remainingSteps;
    if (nextStep === undefined || JSON.stringify(nextStep.gitArguments) !== JSON.stringify(gitArguments)) {
      const expected = nextStep === undefined ? 'no call' : describedCall(nextStep.gitArguments);
      const unanswered = `${describedCall(gitArguments)} in ${directory} has no recorded answer: the stage expected ${expected}`;
      reportUnanswered(unanswered);
      throw new Error(unanswered);
    }
    remainingSteps = remainingSteps.slice(1);
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
