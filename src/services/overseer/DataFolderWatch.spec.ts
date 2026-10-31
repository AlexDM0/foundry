/**
 * What wakes the DrivePass. What matters: a burst of events is debounced into one wake, in the data folder and the Hatch root alike; the sweep
 * wakes with no file event at all; a stopped watcher wakes nothing, a pending debounce included. Those run on fake timers and fake watches, so
 * the platform's event latency and stray events decide nothing. One case keeps the real watch, the subject there: a request written into a Hatch
 * folder created after the start reaches it.
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

/** Stands in for the platform watch: `fireIn` is a file event in that folder. */
function fakeFolderWatches(): {
  watchFolder: (folderPath: string, onEvent: () => void) => { close: () => void };
  fireIn:      (folderPath: string) => void;
  closed:      string[];
} {
  const onEventOfFolder = new Map<string, () => void>();
  const closed: string[] = [];
  return {
    watchFolder: (folderPath, onEvent) => {
      onEventOfFolder.set(folderPath, onEvent);
      return { close: () => closed.push(folderPath) };
    },
    fireIn: (folderPath) => onEventOfFolder.get(folderPath)?.(),
    closed,
  };
}

describe('DataFolderWatch', () => {
  test('a burst of events in the data folder wakes once, after the debounce, and one in the Hatch root wakes again', () => {
    jest.useFakeTimers();
    let wakes = 0;
    const { watchFolder, fireIn } = fakeFolderWatches();
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => { wakes += 1; }, sweepMilliseconds: NO_SWEEP_MILLISECONDS, watchFolder
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
    const { watchFolder, fireIn, closed } = fakeFolderWatches();
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory, repositoryRoot, wake: () => { wakes += 1; }, sweepMilliseconds: QUICK_SWEEP_MILLISECONDS, watchFolder
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
    const { watchFolder } = fakeFolderWatches();
    const watcher = DataFolderWatch.startWatching({
      trackerDirectory,
      repositoryRoot,
      wake:              () => calls.push('wake'),
      onSweep:           () => calls.push('sweep'),
      sweepMilliseconds: QUICK_SWEEP_MILLISECONDS,
      watchFolder,
    });
    jest.advanceTimersByTime(QUICK_SWEEP_MILLISECONDS * 2);
    watcher.stop();
    expect(calls).toEqual(['sweep', 'wake', 'sweep', 'wake']);
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
