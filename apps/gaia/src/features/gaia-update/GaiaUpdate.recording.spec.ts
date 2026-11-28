/**
 * The real-system spec of Gaia's relaunch, run only by `bun run record gaia-relaunch`: the relaunch starts detached, ends a stand-in for
 * the launcher with the stop a quit sends, and opens a bundle path that names no app, so no window opens. The recording names the example
 * target in place of the stand-in's process id and path. The Darwin release stamps the recording.
 */
import { join } from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { realProcessRun }                                        from '../../lib/process-run/ProcessRun.ts';
import { environmentCopy }                                       from '../../services/Environment.ts';
import { recordAnswer }                                          from '../../testing/BoundaryRecordings.ts';
import { detachedStartCallShapeOf }                              from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }             from '../../testing/ScratchRoot.ts';
import { relaunchRequestOf }                                     from './GaiaUpdate.ts';
import { EXAMPLE_RELAUNCH_TARGET, GAIA_RELAUNCH_RECORDING_NAME } from './testing/RecordedGaiaRelaunch.ts';

const STAND_IN_LIFETIME_SECONDS = '60';
const STAND_IN_END_WAIT_MILLISECONDS = 10_000;
const SIGTERM_EXIT_CODE = 143;

const RELAUNCH_END_POLLS = 100;
const RELAUNCH_END_POLL_MILLISECONDS = 100;

let scratchFolder = '';

function processIsRunning(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

/** The relaunch ends once its open has answered, here that the bundle names no app. */
async function processHasEnded(processId: number): Promise<boolean> {
  for (let i = 0; i < RELAUNCH_END_POLLS && processIsRunning(processId); i++) await Bun.sleep(RELAUNCH_END_POLL_MILLISECONDS);
  return !processIsRunning(processId);
}

afterEach(() => {
  removeScratchPath(scratchFolder);
});

describe('a relaunch on a real Mac', () => {
  test('starts detached and ends the launcher it names with a stop', async () => {
    scratchFolder = createScratchDirectory('gaia-relaunch');
    const processRun = realProcessRun(environmentCopy);
    const standInStart = processRun.startOwned({ program: '/bin/sleep', programArguments: [STAND_IN_LIFETIME_SECONDS], workingDirectory: scratchFolder });
    if (standInStart.verdict !== 'started') throw new Error(`The stand-in for the launcher did not start: ${JSON.stringify(standInStart)}`);
    const standIn = standInStart.child;

    const target = { appBundlePath: join(scratchFolder, 'No Such Example.app'), launcherProcessId: standIn.processId };
    const relaunchAnswer = processRun.startDetached(relaunchRequestOf(target, scratchFolder));
    const exampleRequest = relaunchRequestOf(EXAMPLE_RELAUNCH_TARGET, scratchFolder);
    recordAnswer(GAIA_RELAUNCH_RECORDING_NAME, detachedStartCallShapeOf(exampleRequest.program, exampleRequest.programArguments), relaunchAnswer);
    expect(relaunchAnswer.verdict).toBe('started');

    let waitTimer: ReturnType<typeof setTimeout> | undefined;
    const waitRanOut = new Promise<'ran-out'>((resolve) => {
      waitTimer = setTimeout(() => resolve('ran-out'), STAND_IN_END_WAIT_MILLISECONDS);
    });
    const ending = await Promise.race([standIn.exited, waitRanOut]);
    clearTimeout(waitTimer);
    if (ending === 'ran-out') standIn.stop();
    expect(ending).toBe(SIGTERM_EXIT_CODE);
    if (relaunchAnswer.verdict === 'started') expect(await processHasEnded(relaunchAnswer.processId)).toBe(true);
  });
});
