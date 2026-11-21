/**
 * What wakes the DrivePass. What matters: a burst of events is debounced into one wake, in the data folder and the Hatch root alike; the sweep
 * wakes with no file event at all; a stopped data folder watch wakes nothing, a pending debounce included; a watch the platform refuses or fails later
 * throws nothing out and leaves the sweep waking; a job's Hatch folder gets its own watch once, and an unwatch closes it for good. Those run
 * on fake timers and fake watches, so the platform's event latency and stray events decide nothing. One case plays the recorded real watch
 * (`src/testing/RecordedFolderWatch.ts`): a request written into a Hatch folder created after the start reaches it.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test
} from 'bun:test';

import type { PlatformWatch }                             from '../../lib/quiet-watch/QuietWatch.ts';
import { HEPHAESTUS_WATCH_DEBOUNCE_MILLISECONDS }         from '../../shared/constants/HephaestusLimits.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { recordedFolderWatches }                          from '../../testing/RecordedFolderWatch.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenRecorded }                               from '../../testing/ToolGuard.ts';
import { DataFolderWatch }                                from './DataFolderWatch.ts';

const NO_SWEEP_MILLISECONDS = 600_000;
const QUICK_SWEEP_MILLISECONDS = 50;
const BURST_EVENTS = 5;

let repositoryRoot = '';
let trackerDirectory = '';

beforeEach(() => {
  repositoryRoot   = createScratchDirectory('board-watch');
  trackerDirectory = join(repositoryRoot, PRODUCT_NAMES.DATA_FOLDER);
  mkdirSync(trackerDirectory);
});

afterEach(() => {
  jest.useRealTimers();
  removeScratchDirectory(repositoryRoot);
});

function hatchRoot(): string {
  return join(repositoryRoot, PRODUCT_NAMES.WORKTREES_FOLDER, 'hatch');
}

/**
 * Stands in for the platform watch: `fireIn` is a file event in that folder, and `failIn` the `error` event a platform raises after the start,
 * thrown out of the emit as an emitter does when no listener takes it.
 */
function fakeFolderWatches(): {
  platformWatch: PlatformWatch;
  fireIn:        (folderPath: string) => void;
  failIn:        (folderPath: string) => void;
  watched:       string[];
  closed:        string[];
} {
  const onEventOfFolder = new Map<string, () => void>();
  const onErrorOfFolder = new Map<string, (error: Error) => void>();
  const watched: string[] = [];
  const closed: string[] = [];
  return {
    platformWatch: (folderPath, _options, onEvent) => {
      watched.push(folderPath);
      onEventOfFolder.set(folderPath, onEvent);
      const handle = {
        close: () => {
          closed.push(folderPath);
          onEventOfFolder.delete(folderPath);
        },
        on: (_event: 'error', listener: (error: Error) => void) => {
          onErrorOfFolder.set(folderPath, listener);
          return handle;
        },
      };
      return handle;
    },
    fireIn: (folderPath) => onEventOfFolder.get(folderPath)?.(),
    failIn: (folderPath) => {
      const onError = onErrorOfFolder.get(folderPath);
      const failure = new Error(`ENOSPC: System limit for number of file watches reached, watch '${folderPath}'`);
      if (onError === undefined) throw failure;
      onError(failure);
    },
    watched,
    closed,
  };
}

describe('DataFolderWatch', () => {
  test('a burst of events in the data folder wakes once, after the debounce, and one in the Hatch root wakes again', () => {
    jest.useFakeTimers();
    let wakes = 0;
    const { platformWatch, fireIn } = fakeFolderWatches();
    const dataFolderWatch = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => { wakes += 1; }, sweepMilliseconds: NO_SWEEP_MILLISECONDS, platformWatch
    });
    for (let i = 0; i < BURST_EVENTS; i += 1) fireIn(trackerDirectory);
    expect(wakes).toBe(0);
    jest.advanceTimersByTime(HEPHAESTUS_WATCH_DEBOUNCE_MILLISECONDS);
    expect(wakes).toBe(1);

    fireIn(hatchRoot());
    jest.advanceTimersByTime(HEPHAESTUS_WATCH_DEBOUNCE_MILLISECONDS);
    expect(wakes).toBe(2);
    dataFolderWatch.stop();
  });

  test('a stopped data folder watch closes both watches and wakes nothing, a debounce it left pending included', () => {
    jest.useFakeTimers();
    let wakes = 0;
    const { platformWatch, fireIn, closed } = fakeFolderWatches();
    const dataFolderWatch = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => { wakes += 1; }, sweepMilliseconds: QUICK_SWEEP_MILLISECONDS, platformWatch
    });
    fireIn(trackerDirectory);
    dataFolderWatch.stop();
    expect(closed).toEqual([trackerDirectory, hatchRoot()]);
    jest.advanceTimersByTime(NO_SWEEP_MILLISECONDS);
    expect(wakes).toBe(0);
  });

  test('the sweep wakes with no file event, and calls onSweep before each wake', () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const { platformWatch } = fakeFolderWatches();
    const dataFolderWatch = DataFolderWatch.startWatching({
      trackerDirectory,
      repositoryRoot,
      wake:              () => calls.push('wake'),
      onSweep:           () => calls.push('sweep'),
      sweepMilliseconds: QUICK_SWEEP_MILLISECONDS,
      platformWatch,
    });
    jest.advanceTimersByTime(QUICK_SWEEP_MILLISECONDS * 2);
    dataFolderWatch.stop();
    expect(calls).toEqual(['sweep', 'wake', 'sweep', 'wake']);
  });

  test('a watch the platform fails after the start is closed without a throw, and the sweep goes on waking', () => {
    jest.useFakeTimers();
    let sweeps = 0;
    const { platformWatch, failIn, closed } = fakeFolderWatches();
    const dataFolderWatch = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => undefined, onSweep: () => { sweeps += 1; }, sweepMilliseconds: QUICK_SWEEP_MILLISECONDS, platformWatch
    });
    expect(() => failIn(trackerDirectory)).not.toThrow();
    expect(() => failIn(hatchRoot())).not.toThrow();
    expect(closed).toEqual([trackerDirectory, hatchRoot()]);
    jest.advanceTimersByTime(QUICK_SWEEP_MILLISECONDS * 2);
    dataFolderWatch.stop();
    expect(sweeps).toBe(2);
  });

  test('a watch the platform refuses at its start leaves the sweep waking', () => {
    jest.useFakeTimers();
    let sweeps = 0;
    const refusingWatch: PlatformWatch = () => { throw new Error('EMFILE: too many open files, watch'); };
    const dataFolderWatch = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => undefined, onSweep: () => { sweeps += 1; }, sweepMilliseconds: QUICK_SWEEP_MILLISECONDS, platformWatch: refusingWatch
    });
    dataFolderWatch.watchHatchFolder(join(hatchRoot(), 'J1'));
    jest.advanceTimersByTime(QUICK_SWEEP_MILLISECONDS);
    dataFolderWatch.stop();
    expect(sweeps).toBe(1);
  });

  test('a Hatch folder watch is added once per folder, wakes like the others, and closes with the rest', () => {
    jest.useFakeTimers();
    let wakes = 0;
    const {
      platformWatch, fireIn, watched, closed
    } = fakeFolderWatches();
    const dataFolderWatch = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => { wakes += 1; }, sweepMilliseconds: NO_SWEEP_MILLISECONDS, platformWatch
    });
    const jobHatchFolder = join(hatchRoot(), 'J1');
    dataFolderWatch.watchHatchFolder(jobHatchFolder);
    dataFolderWatch.watchHatchFolder(jobHatchFolder);
    expect(watched).toEqual([trackerDirectory, hatchRoot(), jobHatchFolder]);
    fireIn(jobHatchFolder);
    jest.advanceTimersByTime(HEPHAESTUS_WATCH_DEBOUNCE_MILLISECONDS);
    expect(wakes).toBe(1);
    dataFolderWatch.stop();
    expect(closed).toEqual([trackerDirectory, hatchRoot(), jobHatchFolder]);
  });

  test('an unwatched Hatch folder closes its watch and is forgotten, so a second watch of it opens a new one', () => {
    const { platformWatch, watched, closed } = fakeFolderWatches();
    const dataFolderWatch = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => undefined, sweepMilliseconds: NO_SWEEP_MILLISECONDS, platformWatch
    });
    const jobHatchFolder = join(hatchRoot(), 'J1');
    dataFolderWatch.watchHatchFolder(jobHatchFolder);
    dataFolderWatch.unwatchHatchFolder(jobHatchFolder);
    expect(closed).toEqual([jobHatchFolder]);
    dataFolderWatch.unwatchHatchFolder(jobHatchFolder);
    expect(closed).toEqual([jobHatchFolder]);
    dataFolderWatch.watchHatchFolder(jobHatchFolder);
    expect(watched).toEqual([trackerDirectory, hatchRoot(), jobHatchFolder, jobHatchFolder]);
    dataFolderWatch.stop();
    expect(closed).toEqual([jobHatchFolder, trackerDirectory, hatchRoot(), jobHatchFolder]);
  });

  // The data folder is left unwatchable, so only the recursive Hatch watch can wake this.
  testWhenRecorded(['folder-watch-recording'], 'a request in a Hatch folder made after the start reaches the recorded recursive watch', () => {
    jest.useFakeTimers();
    let wakes = 0;
    const recordedWatches = recordedFolderWatches();
    const dataFolderWatch = DataFolderWatch.startWatching({
      trackerDirectory:  join(repositoryRoot, 'no-such-folder'),
      repositoryRoot,
      wake:              () => { wakes += 1; },
      sweepMilliseconds: NO_SWEEP_MILLISECONDS,
      platformWatch:     recordedWatches.platformWatch,
    });
    recordedWatches.writeFileInASubfolderMadeAfterStart(join(hatchRoot(), 'J7', 'requests'));
    jest.advanceTimersByTime(HEPHAESTUS_WATCH_DEBOUNCE_MILLISECONDS);
    dataFolderWatch.stop();
    expect(recordedWatches.unansweredCalls()).toEqual([]);
    expect(wakes).toBe(1);
  });
});
