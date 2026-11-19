/**
 * User's job controls as frames to the board's Talos, a recording one answering for it. What matters: a Talos that answers no frame on one
 * pass is sent it on a later pass, its marker written only once Talos took it; a session is asked to quit at its turn end, never sent a
 * close; a session's stop has a marker of its own, so a `job stop` recorded after its quit still reaches the session; a stop asked before
 * any quit sends the quit then the stop, each once, a restarted Overseer included; and a message's pictures are read from the board's
 * store and written into its chat line.
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
import { type FrameRecordingTalos, frameRecordingTalos }  from '../../testing/FrameRecordingTalos.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { sentActLinesOf }                                 from '../../testing/SentActLines.ts';
import { PictureStore }                                   from '../tracker/PictureStore.ts';
import { JobControlDelivery }                             from './JobControlDelivery.ts';
import { jobFolderIn }                                    from './OverseerFiles.ts';

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
    childInstance:      1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...overrides,
  };
}

const QUIT_AT_TURN_END = JSON.stringify({ act: 'quit-at-turn-end' });
const STOP = JSON.stringify({ act: 'stop', graceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS });

describe('a session job\'s control frames', () => {
  let trackerDirectory = '';
  let talos: FrameRecordingTalos;

  beforeEach(() => {
    trackerDirectory = createScratchDirectory('job-controls');
    talos            = frameRecordingTalos(trackerDirectory, nativePlatformPorts());
  });

  afterEach(() => {
    removeScratchDirectory(trackerDirectory);
  });

  /** The job's session, live under the board's Talos. */
  function plantLiveSession(job: Job): void {
    talos.plantLiveChild(jobFolderIn(trackerDirectory, job.id), 1);
  }

  async function deliverPass(job: Job, logRecords: readonly LogRecord[] = []): Promise<void> {
    await JobControlDelivery.deliverJobControls({
      boardChildren:   talos.boardChildren,
      trackerDirectory,
      board:           { jobs: () => [job], logRecordsSoFar: () => [...logRecords] },
      adapter:         { chatLineOf: (message, pictures = []) => JSON.stringify({ message, pictures }) },
      windDownMessage: 'Example wind-down',
    });
  }

  function markerExists(job: Job, marker: string): boolean {
    return existsSync(join(jobFolderIn(trackerDirectory, job.id), 'control-frames', marker));
  }

  async function actingFramesWhile(during: () => Promise<void>): Promise<readonly string[]> {
    const framesBefore = talos.frames().length;
    await during();
    return sentActLinesOf(talos.frames().slice(framesBefore));
  }

  test('a closed intake\'s quit at its turn end reaches a Talos that answered nothing on the first pass on the next pass, marked only then', async () => {
    const job = productOwnerJob();
    plantLiveSession(job);
    talos.answers(false);
    await deliverPass(job);
    talos.answers(true);
    const markedWhileRefusing = markerExists(job, 'input-closed-1');
    const frames = await actingFramesWhile(async () => {
      await deliverPass(job);
      await deliverPass(job);
    });
    expect({ markedWhileRefusing, frames, marked: markerExists(job, 'input-closed-1') }).toEqual({ markedWhileRefusing: false, frames: [QUIT_AT_TURN_END], marked: true });
  });

  test('a job stop recorded after a delivered quit sends the stop frame on the next pass', async () => {
    const closedIntake = productOwnerJob();
    plantLiveSession(closedIntake);
    const frames = await actingFramesWhile(async () => {
      await deliverPass(closedIntake);
      await deliverPass(productOwnerJob({ stopRequest: 'stop' }));
    });
    expect(frames).toEqual([QUIT_AT_TURN_END, STOP]);
  });

  test('a message\'s pictures are read from the board\'s store and written into its chat line', async () => {
    const job = productOwnerJob({ state: 'running' });
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const storing = PictureStore.storePicture(nativePlatformPorts().ownerOnlyFiles, trackerDirectory, pngBytes);
    if (storing.verdict !== 'stored') throw new Error('the example picture was not stored');
    const messaged: LogRecord = {
      at: '2026-11-10T09:30:00+01:00', kind: 'job-messaged', jobId: job.id, fields: { text: 'Like this.', pictures: [{ pictureId: storing.pictureId, name: 'header.png' }] }
    };
    plantLiveSession(job);
    const frames = await actingFramesWhile(async () => {
      await deliverPass(job, [messaged]);
    });
    const line = JSON.stringify({ message: 'Like this.', pictures: [{ mediaType: 'image/png', base64Data: Buffer.from(pngBytes).toString('base64') }] });
    expect(frames).toEqual([JSON.stringify({ act: 'write-line', line })]);
  });

  test('a stop asked before any quit sends the quit then the stop, each once across an Overseer restart', async () => {
    const job = productOwnerJob({ stopRequest: 'stop' });
    plantLiveSession(job);
    const beforeRestart = await actingFramesWhile(async () => {
      await deliverPass(job);
    });
    const afterRestart = await actingFramesWhile(async () => {
      await deliverPass(productOwnerJob({ stopRequest: 'stop' }));
    });
    expect({ beforeRestart, afterRestart }).toEqual({ beforeRestart: [QUIT_AT_TURN_END, STOP], afterRestart: [] });
  });
});
