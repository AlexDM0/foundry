/**
 * The real-system spec of the path chooser, run only by `bun run record path-chooser` on a Mac with a person at the screen to answer the
 * dialogs: the folder chooser is answered with any folder and the file chooser cancelled. Both answers are recorded, the folder under an
 * example path, since only their shape matters and the person's own folders do not belong in the repository.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { realProcessRun, type ProcessRun, type ProgramRunAnswer } from '../../lib/process-run/ProcessRun.ts';
import { environmentCopy }                                        from '../../services/Environment.ts';
import { recordAnswer }                                           from '../../testing/BoundaryRecordings.ts';
import { runCallShapeOf }                                         from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }              from '../../testing/ScratchRoot.ts';

import { createPathChooser, OSASCRIPT_PROGRAM_PATH, type PathChooser } from './PathChooser.ts';
import { RECORDING_NAME_OF_PATH_CHOOSER }                              from './testing/RecordedPathChooser.ts';

const EXAMPLE_CHOSEN_FOLDER_OUTPUT = '/Users/example/Development/example-storefront/\n';
const CHOSEN_FOLDER_OUTPUT = /^\/.+\/\n$/;
/** The note waits for the person as long as the chooser does. */
const NOTE_TIMEOUT_MILLISECONDS = 600_000;

let workingDirectory = '';

beforeAll(() => {
  workingDirectory = createScratchDirectory('path-chooser');
});

afterAll(() => {
  removeScratchPath(workingDirectory);
});

/** A note to the person at the screen, which the recording does not keep. */
async function showNote(sentence: string): Promise<void> {
  const answer = await realProcessRun(environmentCopy).run({
    program:             OSASCRIPT_PROGRAM_PATH,
    programArguments:    ['-e', `display dialog "${sentence}" buttons {"OK"} default button "OK" with title "Gaia records the path chooser"`],
    workingDirectory,
    timeoutMilliseconds: NOTE_TIMEOUT_MILLISECONDS,
  });
  expect(answer).toMatchObject({ verdict: 'finished', exitCode: 0 });
}

/** A chosen folder is recorded under the example path; any other answer as it came. */
function exampleAnswerOf(answer: ProgramRunAnswer): ProgramRunAnswer {
  if (answer.verdict !== 'finished' || answer.exitCode !== 0 || !CHOSEN_FOLDER_OUTPUT.test(answer.standardOutput)) return answer;
  return { ...answer, standardOutput: EXAMPLE_CHOSEN_FOLDER_OUTPUT };
}

/** Runs the real `osascript` and records each answer under the call shape PathChooser made. */
function recordingChooser(): PathChooser {
  const processRun = realProcessRun(environmentCopy);
  const recordingProcessRun: ProcessRun = {
    run: async (request) => {
      const answer = await processRun.run(request);
      recordAnswer(RECORDING_NAME_OF_PATH_CHOOSER, runCallShapeOf(request.program, request.programArguments), exampleAnswerOf(answer));
      return answer;
    },
    startOwned: (request) => {
      throw new Error(`The path-chooser recording starts nothing owned, and was asked to start ${request.program}.`);
    },
    startDetached: (request) => {
      throw new Error(`The path-chooser recording starts nothing detached, and was asked to start ${request.program}.`);
    },
  };
  return createPathChooser({ processRun: recordingProcessRun, workingDirectory: () => workingDirectory, cancellation: new AbortController().signal });
}

describe('the system\'s chooser, answered by a person', () => {
  test('answers chosen with the folder picked, without its last separator', async () => {
    await showNote('Choose any folder in the next dialog.');
    const verdict = await recordingChooser().choose('folder');
    expect(verdict).toEqual({ verdict: 'chosen', path: expect.stringMatching(/^\/.*[^/]$/) });
  });

  test('answers cancelled when the file chooser is cancelled', async () => {
    await showNote('Cancel the next dialog, which opens in your home folder with hidden files shown.');
    expect(await recordingChooser().choose('file')).toEqual({ verdict: 'cancelled' });
  });
});
