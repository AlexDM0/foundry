/**
 * User's job controls as frames to a planted Watcher. What matters: a Watcher refusing the first connection is sent the frame on a later
 * pass, its marker written only then; a session's stop has a marker of its own, so a `job stop` recorded after its input was closed still
 * reaches the session; a stop asked before any close sends close-input then stop, each once, a restarted Overseer included; and a message's
 * pictures are read from the board's store and written into its chat line.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                       from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import { SESSION_STOP_GRACE_MILLISECONDS }                from '../../shared/constants/OverseerLimits.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { watcherChildReadingsWith }                       from '../../testing/WatcherChildReadings.ts';
import { PictureStore }                                   from '../tracker/PictureStore.ts';
import { JobControlDelivery }                             from './JobControlDelivery.ts';
import { jobFolderIn }                                    from './OverseerFiles.ts';
import { PlantedWatcher }                                 from './testing/PlantedWatcher.ts';

function productOwnerJob(overrides: Partial<Job> = {}): Job {
  return {
    id:                 'J3',
    kind:               'product-owner',
    role:               'product-owner',
    ticketIds:          [],
    parentJobId:        null,
    attempt:            1,
    target:             null,
    state:              'stopping',
    watcherInstance:    1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...overrides,
  };
}

const CLOSE_INPUT = JSON.stringify({ kind: 'close-input' });
const STOP = JSON.stringify({ kind: 'stop', graceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS });

describe('a session job\'s control frames', () => {
  let trackerDirectory = '';
  let monitorFolder    = '';

  beforeEach(() => {
    trackerDirectory = createScratchDirectory('job-controls');
    monitorFolder    = createScratchDirectory('h');
  });

  afterEach(() => {
    removeScratchDirectory(trackerDirectory);
    removeScratchDirectory(monitorFolder);
  });

  async function deliverPass(job: Job, logRecords: readonly LogRecord[] = []): Promise<void> {
    await JobControlDelivery.deliverJobControls({
      boardChildren:   watcherChildReadingsWith(nativePlatformPorts(), trackerDirectory),
      trackerDirectory,
      board:           { jobs: () => [job], logRecordsSoFar: () => [...logRecords] },
      adapter:         { chatLineOf: (message, pictures = []) => JSON.stringify({ message, pictures }) },
      windDownMessage: 'Example wind-down',
    });
  }

  function markerExists(job: Job, marker: string): boolean {
    return existsSync(join(jobFolderIn(trackerDirectory, job.id), 'control-frames', marker));
  }

  async function actingFramesWhile(socketPath: string, during: () => Promise<void>): Promise<readonly string[]> {
    return (await PlantedWatcher.framesReceivedWhile(socketPath, during)).filter((line) => !line.includes('"hello"'));
  }

  test('a closed intake\'s close-input reaches a Watcher that refused the first connection on the next pass, marked only then', async () => {
    const job = productOwnerJob();
    const socketPath = PlantedWatcher.plantLiveWatcher({
      trackerDirectory, monitorFolder, jobId: job.id, instance: 1
    });
    await deliverPass(job);
    const markedWhileRefusing = markerExists(job, 'input-closed-1');
    const frames = await actingFramesWhile(socketPath, async () => {
      await deliverPass(job);
      await deliverPass(job);
    });
    expect({ markedWhileRefusing, frames, marked: markerExists(job, 'input-closed-1') }).toEqual({ markedWhileRefusing: false, frames: [CLOSE_INPUT], marked: true });
  });

  test('a job stop recorded after a delivered close-input sends the stop frame on the next pass', async () => {
    const closedIntake = productOwnerJob();
    const socketPath = PlantedWatcher.plantLiveWatcher({
      trackerDirectory, monitorFolder, jobId: closedIntake.id, instance: 1
    });
    const frames = await actingFramesWhile(socketPath, async () => {
      await deliverPass(closedIntake);
      await deliverPass(productOwnerJob({ stopRequest: 'stop' }));
    });
    expect(frames).toEqual([CLOSE_INPUT, STOP]);
  });

  test('a message\'s pictures are read from the board\'s store and written into its chat line', async () => {
    const job = productOwnerJob({ state: 'running' });
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const storing = PictureStore.storePicture(nativePlatformPorts().ownerOnlyFiles, trackerDirectory, pngBytes);
    if (storing.verdict !== 'stored') throw new Error('the example picture was not stored');
    const messaged: LogRecord = {
      at: '2026-11-10T09:30:00+01:00', kind: 'job-messaged', jobId: job.id, fields: { text: 'Like this.', pictures: [{ pictureId: storing.pictureId, name: 'header.png' }] }
    };
    const socketPath = PlantedWatcher.plantLiveWatcher({
      trackerDirectory, monitorFolder, jobId: job.id, instance: 1
    });
    const frames = await actingFramesWhile(socketPath, async () => {
      await deliverPass(job, [messaged]);
    });
    const line = JSON.stringify({ message: 'Like this.', pictures: [{ mediaType: 'image/png', base64Data: Buffer.from(pngBytes).toString('base64') }] });
    expect(frames).toEqual([JSON.stringify({ kind: 'write', line })]);
  });

  test('a stop asked before any close sends close-input then stop, each once across an Overseer restart', async () => {
    const job = productOwnerJob({ stopRequest: 'stop' });
    const socketPath = PlantedWatcher.plantLiveWatcher({
      trackerDirectory, monitorFolder, jobId: job.id, instance: 1
    });
    const beforeRestart = await actingFramesWhile(socketPath, async () => {
      await deliverPass(job);
    });
    const afterRestart = await actingFramesWhile(socketPath, async () => {
      await deliverPass(productOwnerJob({ stopRequest: 'stop' }));
    });
    expect({ beforeRestart, afterRestart }).toEqual({ beforeRestart: [CLOSE_INPUT, STOP], afterRestart: [] });
  });
});
