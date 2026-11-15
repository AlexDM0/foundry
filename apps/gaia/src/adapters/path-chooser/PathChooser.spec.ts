/**
 * The path chooser over its recording. What matters: each target runs `osascript` by its absolute path with that target's script, in the
 * folder it is given, a chosen folder and a cancelled file chooser reach the caller as a path and a cancel, and every run carries the
 * chooser's cancellation, so the server's stop ends a dialog still open.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { ProgramRunRequest }                    from '../../lib/process-run/ProcessRun.ts';
import { runCallShapeOf }                            from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';

import { createPathChooser, OSASCRIPT_PROGRAM_PATH, pathChooserArgumentsOf } from './PathChooser.ts';
import { RECORDED_CHOSEN_FOLDER, recordedPathChooserRun }                    from './testing/RecordedPathChooser.ts';

let workingDirectory = '';

beforeEach(() => {
  workingDirectory = createScratchDirectory('path-chooser');
});

afterEach(() => {
  removeScratchPath(workingDirectory);
});

describe('choosing', () => {
  test('answers the folder chosen in the folder chooser', async () => {
    const processRun = recordedPathChooserRun();
    const chooser = createPathChooser({ processRun, workingDirectory: () => workingDirectory, cancellation: new AbortController().signal });
    expect(await chooser.choose('folder')).toEqual({ verdict: 'chosen', path: RECORDED_CHOSEN_FOLDER });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(OSASCRIPT_PROGRAM_PATH, pathChooserArgumentsOf('folder'))]);
  });

  test('answers cancelled when the file chooser was cancelled', async () => {
    const processRun = recordedPathChooserRun();
    const chooser = createPathChooser({ processRun, workingDirectory: () => workingDirectory, cancellation: new AbortController().signal });
    expect(await chooser.choose('file')).toEqual({ verdict: 'cancelled' });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(OSASCRIPT_PROGRAM_PATH, pathChooserArgumentsOf('file'))]);
  });

  test('hands process-run its cancellation with every run, so the server\'s stop ends a dialog still open', async () => {
    const recordedRun  = recordedPathChooserRun();
    const requests: ProgramRunRequest[] = [];
    const processRun   = {
      ...recordedRun,
      run: (request: ProgramRunRequest) => {
        requests.push(request);
        return recordedRun.run(request);
      },
    };
    const cancellation = new AbortController().signal;
    const chooser      = createPathChooser({ processRun, workingDirectory: () => workingDirectory, cancellation });
    await chooser.choose('folder');
    await chooser.choose('file');
    expect(requests.map((request) => request.cancellation === cancellation)).toEqual([true, true]);
  });

  test('asks the folder chooser and the file chooser each for its own kind of path', () => {
    expect(pathChooserArgumentsOf('folder').join(' ')).toContain('choose folder');
    expect(pathChooserArgumentsOf('file').join(' ')).toContain('choose file');
  });
});
