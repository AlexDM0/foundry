/**
 * The delivery pass over a job whose frames were already taken. What matters: a message whose marker exists is not built again, so a pass
 * never reads and encodes the pictures of every message a live job was ever sent; the frames are built only for a send.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { Job }                                       from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                         from '../../testing/TalosChildReadings.ts';
import { jobFolderIn }                                    from './HephaestusFiles.ts';
import { JobControlDelivery }                             from './JobControlDelivery.ts';

const EXAMPLE_STAMP = '2026-11-10T09:30:00+01:00';

const RUNNING_PRODUCT_OWNER: Job = {
  id:                 'J3',
  kind:               'product-owner',
  role:               'product-owner',
  ticketIds:          [],
  parentJobId:        null,
  attempt:            1,
  target:             null,
  state:              'running',
  childInstance:      1,
  eventCursor:        { instance: 1, sequence: 0 },
  answeredRequestIds: [],
  crashResumes:       0,
};

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

describe('a pass over messages already taken', () => {
  test('builds no chat line, so the pictures of a taken message are not read again', async () => {
    const trackerDirectory = createScratchDirectory('job-control-delivery');
    scratchDirectories.push(trackerDirectory);
    const markersFolder = join(jobFolderIn(trackerDirectory, RUNNING_PRODUCT_OWNER.id), 'control-frames');
    mkdirSync(markersFolder, { recursive: true });
    writeFileSync(join(markersFolder, 'message-1'), '');
    const messaged: LogRecord = {
      at:     EXAMPLE_STAMP,
      kind:   'job-messaged',
      jobId:  RUNNING_PRODUCT_OWNER.id,
      fields: { text: 'Example message', pictures: [{ pictureId: 'a'.repeat(64), name: 'example.png' }] },
    };
    let chatLinesBuilt = 0;
    await JobControlDelivery.deliverJobControls({
      boardChildren:   talosChildReadingsWith(nativePlatformPorts(), trackerDirectory),
      trackerDirectory,
      board:           { jobs: () => [RUNNING_PRODUCT_OWNER], logRecordsSoFar: () => [messaged] },
      adapter:         { chatLineOf: (message) => { chatLinesBuilt += 1; return message; } },
      windDownMessage: 'Example wind-down',
    });
    expect(chatLinesBuilt).toBe(0);
  });
});
