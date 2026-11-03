/**
 * The git of a default spec: `useRecordedGit` mocks `GitProcess` for a spec file with the answers real git gave, which
 * `src/lib/git/RecordedGitAnswers.integration.spec.ts` records under `bun run record src/lib/git/GitProcess.ts`. A spec plays a stage, the
 * calls one flow makes in order, each answered by its recorded call shape. A call outside a stage, or out of the stage's order, fails the case.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

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
  VERSION:                      'version',
  COMMON_FOLDER_AT_THE_ROOT:    'rev-parse --git-common-dir, at the root of a repository',
  CHECK_IGNORE_NOT_IGNORED:     'check-ignore -q <path>, the path not ignored',
  CHECK_IGNORE_ALREADY_IGNORED: 'check-ignore -q <path>, the path ignored',
} as const;

export type GitCallShape = typeof GIT_CALL_SHAPES[keyof typeof GIT_CALL_SHAPES];

/** One call a stage expects: the arguments production passes and the recorded call shape that answers them. */
export interface RecordedGitStep {
  readonly gitArguments: readonly string[];
  readonly answeredAs:   GitCallShape;
}

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

function recordedAnswerOf(callShape: GitCallShape): GitRun {
  const answer = recordedAnswersOfThisOs().get(callShape);
  if (answer === undefined) throw new Error(`the git recording holds no answer for "${callShape}": run \`${recordCommandOf(GIT_BOUNDARY)}\`.`);
  return answer;
}

function describedCall(gitArguments: readonly string[]): string {
  return `git ${gitArguments.join(' ')}`;
}

/** Call at a spec file's top level: every case of the file runs on recorded answers, and the file's end restores `GitProcess`. */
export function useRecordedGit(): RecordedGit {
  let remainingSteps: RecordedGitStep[] = [];
  const unansweredCalls: string[] = [];

  const answerOf = (directory: string, gitArguments: readonly string[]): GitRun => {
    const [nextStep] = remainingSteps;
    const expectedArguments = nextStep === undefined ? null : JSON.stringify(nextStep.gitArguments);
    if (nextStep === undefined || expectedArguments !== JSON.stringify(gitArguments)) {
      const expected = nextStep === undefined ? 'no call' : describedCall(nextStep.gitArguments);
      const unanswered = `${describedCall(gitArguments)} in ${directory} has no recorded answer: the stage expected ${expected}`;
      unansweredCalls.push(unanswered);
      throw new Error(unanswered);
    }
    remainingSteps = remainingSteps.slice(1);
    return recordedAnswerOf(nextStep.answeredAs);
  };

  beforeAll(() => {
    spyOn(GitProcess, 'run').mockImplementation(answerOf);
    spyOn(GitProcess, 'resolvedCommitOf').mockImplementation((directory, revision) => {
      const answer = answerOf(directory, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`]);
      return answer.exitCode === GIT_SUCCESS_EXIT_CODE ? answer.standardOutput.trim() : null;
    });
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
      remainingSteps = [...stage];
      try {
        const result = await action();
        if (remainingSteps.length > 0) throw new Error(`the stage expected ${remainingSteps.map(({ gitArguments }) => describedCall(gitArguments)).join(', ')}, which never came`);
        return result;
      } finally {
        remainingSteps = [];
      }
    },
  };
}
