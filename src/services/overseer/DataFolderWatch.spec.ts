/**
 * What wakes the DrivePass. What matters: a burst of events is debounced into one wake, in the data folder and the Hatch root alike; the sweep
 * wakes with no file event at all; a stopped watcher wakes nothing, a pending debounce included; a watch the platform refuses or fails later
 * throws nothing out and leaves the sweep waking; a job's Hatch folder gets its own watch once, and an unwatch closes it for good. Those run
 * on fake timers and fake watches, so the platform's event latency and stray events decide nothing. One case keeps the real watch, the
 * subject there: a request written into a Hatch folder created after the start reaches it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test
} from 'bun:test';

import type { PlatformWatch }                             from '../../lib/quiet-watch/QuietWatch.ts';
import { OVERSEER_WATCH_DEBOUNCE_MILLISECONDS }           from '../../shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { DataFolderWatch }                                from './DataFolderWatch.ts';

const NO_SWEEP_MILLISECONDS = 600_000;
const QUICK_SWEEP_MILLISECONDS = 50;
const BURST_EVENTS = 5;

let repositoryRoot = '';
let trackerDirectory = '';

beforeEach(() => {
  repositoryRoot   = createScratchDirectory('board-watcher');
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
      const failure = new Error(`ENOSPC: System limit for number of file watchers reached, watch '${folderPath}'`);
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
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => { wakes += 1; }, sweepMilliseconds: NO_SWEEP_MILLISECONDS, platformWatch
    });
    for (let i = 0; i < BURST_EVENTS; i += 1) fireIn(trackerDirectory);
    expect(wakes).toBe(0);
    jest.advanceTimersByTime(OVERSEER_WATCH_DEBOUNCE_MILLISECONDS);
    expect(wakes).toBe(1);

    fireIn(hatchRoot());
    jest.advanceTimersByTime(OVERSEER_WATCH_DEBOUNCE_MILLISECONDS);
    expect(wakes).toBe(2);
    watcher.stop();
  });

  test('a stopped watcher closes both watches and wakes nothing, a debounce it left pending included', () => {
    jest.useFakeTimers();
    let wakes = 0;
    const { platformWatch, fireIn, closed } = fakeFolderWatches();
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => { wakes += 1; }, sweepMilliseconds: QUICK_SWEEP_MILLISECONDS, platformWatch
    });
    fireIn(trackerDirectory);
    watcher.stop();
    expect(closed).toEqual([trackerDirectory, hatchRoot()]);
    jest.advanceTimersByTime(NO_SWEEP_MILLISECONDS);
    expect(wakes).toBe(0);
  });

  test('the sweep wakes with no file event, and calls onSweep before each wake', () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const { platformWatch } = fakeFolderWatches();
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory,
      repositoryRoot,
      wake:              () => calls.push('wake'),
      onSweep:           () => calls.push('sweep'),
      sweepMilliseconds: QUICK_SWEEP_MILLISECONDS,
      platformWatch,
    });
    jest.advanceTimersByTime(QUICK_SWEEP_MILLISECONDS * 2);
    watcher.stop();
    expect(calls).toEqual(['sweep', 'wake', 'sweep', 'wake']);
  });

  test('a watch the platform fails after the start is closed without a throw, and the sweep goes on waking', () => {
    jest.useFakeTimers();
    let sweeps = 0;
    const { platformWatch, failIn, closed } = fakeFolderWatches();
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => undefined, onSweep: () => { sweeps += 1; }, sweepMilliseconds: QUICK_SWEEP_MILLISECONDS, platformWatch
    });
    expect(() => failIn(trackerDirectory)).not.toThrow();
    expect(() => failIn(hatchRoot())).not.toThrow();
    expect(closed).toEqual([trackerDirectory, hatchRoot()]);
    jest.advanceTimersByTime(QUICK_SWEEP_MILLISECONDS * 2);
    watcher.stop();
    expect(sweeps).toBe(2);
  });

  test('a watch the platform refuses at its start leaves the sweep waking', () => {
    jest.useFakeTimers();
    let sweeps = 0;
    const refusingWatch: PlatformWatch = () => { throw new Error('EMFILE: too many open files, watch'); };
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => undefined, onSweep: () => { sweeps += 1; }, sweepMilliseconds: QUICK_SWEEP_MILLISECONDS, platformWatch: refusingWatch
    });
    watcher.watchHatchFolder(join(hatchRoot(), 'J1'));
    jest.advanceTimersByTime(QUICK_SWEEP_MILLISECONDS);
    watcher.stop();
    expect(sweeps).toBe(1);
  });

  test('a Hatch folder watch is added once per folder, wakes like the others, and closes with the rest', () => {
    jest.useFakeTimers();
    let wakes = 0;
    const {
      platformWatch, fireIn, watched, closed
    } = fakeFolderWatches();
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => { wakes += 1; }, sweepMilliseconds: NO_SWEEP_MILLISECONDS, platformWatch
    });
    const jobHatchFolder = join(hatchRoot(), 'J1');
    watcher.watchHatchFolder(jobHatchFolder);
    watcher.watchHatchFolder(jobHatchFolder);
    expect(watched).toEqual([trackerDirectory, hatchRoot(), jobHatchFolder]);
    fireIn(jobHatchFolder);
    jest.advanceTimersByTime(OVERSEER_WATCH_DEBOUNCE_MILLISECONDS);
    expect(wakes).toBe(1);
    watcher.stop();
    expect(closed).toEqual([trackerDirectory, hatchRoot(), jobHatchFolder]);
  });

  test('an unwatched Hatch folder closes its watch and is forgotten, so a second watch of it opens a new one', () => {
    const { platformWatch, watched, closed } = fakeFolderWatches();
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => undefined, sweepMilliseconds: NO_SWEEP_MILLISECONDS, platformWatch
    });
    const jobHatchFolder = join(hatchRoot(), 'J1');
    watcher.watchHatchFolder(jobHatchFolder);
    watcher.unwatchHatchFolder(jobHatchFolder);
    expect(closed).toEqual([jobHatchFolder]);
    watcher.unwatchHatchFolder(jobHatchFolder);
    expect(closed).toEqual([jobHatchFolder]);
    watcher.watchHatchFolder(jobHatchFolder);
    expect(watched).toEqual([trackerDirectory, hatchRoot(), jobHatchFolder, jobHatchFolder]);
    watcher.stop();
    expect(closed).toEqual([jobHatchFolder, trackerDirectory, hatchRoot(), jobHatchFolder]);
  });

  // The data folder is left unwatchable, so only the recursive Hatch watch can wake this. The write repeats because a platform watch may start
  // after the call returns; the repeat is slower than the debounce, which each write would otherwise push back for good.
  test('a request in a Hatch folder made after the start reaches the real recursive watch', async () => {
    let wakes = 0;
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory: join(repositoryRoot, 'no-such-folder'), repositoryRoot, wake: () => { wakes += 1; }, sweepMilliseconds: NO_SWEEP_MILLISECONDS
    });
    try {
      const requestsFolder = join(hatchRoot(), 'J7', 'requests');
      mkdirSync(requestsFolder, { recursive: true });
      let writes = 0;
      await waitUntil(() => {
        writes += 1;
        writeFileSync(join(requestsFolder, `request-${writes}.json`), '{}\n');
        return wakes > 0;
      }, 'a wake from the Hatch folder', OVERSEER_WATCH_DEBOUNCE_MILLISECONDS * 2);
    } finally {
      watcher.stop();
    }
  });
});
