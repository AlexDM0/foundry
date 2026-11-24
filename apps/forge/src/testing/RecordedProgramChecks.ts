/**
 * The mock of `src/lib/program-check/`: a program check answered by the answer `ProgramCheck.integration.spec.ts` recorded for a planted
 * program in the same situation, and a failure for a path the spec gave no situation.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';

import type { ProgramCheckAnswer, ProgramCheckRun } from '../lib/program-check/ProgramCheck.ts';
import type { BoundaryRecording }                   from './BoundaryRecordings.ts';
import { recordCommandOf, recordingPathOf }         from './BoundaryRecordings.ts';

export const PROGRAM_CHECK_RECORDING = {
  BOUNDARY:         'src/lib/program-check/',
  ANSWERS:          'answers its version',
  FAILS:            'ends with a failing exit',
  HANGS:            'outlives the bound',
  MISSING:          'is not there',
  NOT_A_PROGRAM:    'is a plain file',
  EXPECTED_KIND_OF: {
    'answers its version':      'answered',
    'ends with a failing exit': 'answered',
    'outlives the bound':       'timed-out',
    'is not there':             'did-not-start',
    'is a plain file':          'did-not-start',
  },
} as const;

export type ProgramCheckSituation = keyof typeof PROGRAM_CHECK_RECORDING.EXPECTED_KIND_OF;

/** The runtime stands for a program that answers its version, as the fake agent's program is the runtime. */
export const RUNTIME_ANSWERS_ITS_VERSION: Readonly<Record<string, ProgramCheckSituation>> = { [process.execPath]: PROGRAM_CHECK_RECORDING.ANSWERS };

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

function recordedAnswers(): ReadonlyMap<string, ProgramCheckAnswer> {
  const recordingPath = join(REPOSITORY_ROOT, recordingPathOf(PROGRAM_CHECK_RECORDING.BOUNDARY, process.platform));
  if (!existsSync(recordingPath)) {
    throw new Error(`no answers of ${PROGRAM_CHECK_RECORDING.BOUNDARY} are recorded for ${process.platform}: run \`${recordCommandOf(PROGRAM_CHECK_RECORDING.BOUNDARY)}\`.`);
  }
  const recording = JSON.parse(readFileSync(recordingPath, 'utf8')) as BoundaryRecording;
  return new Map(recording.answers.map(({ callShape, answer }) => [callShape, answer as ProgramCheckAnswer]));
}

/** Each program path the spec names runs in its situation; a path it does not name has no recorded answer and fails. Read at the first run. */
export function recordedProgramCheckRun(situationOfProgram: Readonly<Record<string, ProgramCheckSituation>>): ProgramCheckRun {
  return (request) => {
    const situation = Object.hasOwn(situationOfProgram, request.programPath) ? situationOfProgram[request.programPath] : undefined;
    const answer = situation === undefined ? undefined : recordedAnswers().get(situation);
    if (answer === undefined) return Promise.reject(new Error(`a check of ${request.programPath} has no recorded answer of ${PROGRAM_CHECK_RECORDING.BOUNDARY}`));
    return Promise.resolve(answer);
  };
}
