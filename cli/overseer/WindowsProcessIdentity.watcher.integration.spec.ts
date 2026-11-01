/**
 * A Watcher run in this process on the Windows identity, over a fake kernel table in the place of `/bin/ps`, its child a real process. What
 * matters: it records its own identity at its claim and its child's once the child runs, so neither reads as lost.
 */
import { readFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { ProcessIdentity }                                               from '../../src/lib/process-identity/ProcessIdentity.ts';
import { runWatcherOnPorts }                                                  from '../../src/lib/watcher/Watcher.ts';
import { watcherFilesOf }                                                     from '../../src/lib/watcher/WatcherFiles.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                            from '../../src/testing/ChildProcessCaseTimeout.ts';
import { createFakeWindowsKernel, FAKE_BOOT_ID_TEXT, fakeWindowsSupervision } from '../../src/testing/FakeWindowsKernel.ts';
import { nativePlatformPorts }                                                from '../../src/testing/NativePlatformPorts.ts';
import { createWatcherJob, type WatcherJob }                                  from '../../src/testing/WatcherJob.ts';

const CREATION_TIME = 134_000_000_000_000_001n;

let job: WatcherJob;

beforeEach(() => {
  job = createWatcherJob();
});

afterEach(() => {
  job.remove();
});

describe('a Watcher on Windows', () => {
  test('records its own identity and its child\'s', async () => {
    const kernel = createFakeWindowsKernel();
    kernel.answerUnknownAs({ creationTime: CREATION_TIME });
    job.writeLaunch(1, 'process', 'process.exit(0);');
    const ports = { supervision: fakeWindowsSupervision(kernel), endpoint: nativePlatformPorts().localEndpoint };
    const watcherRun = runWatcherOnPorts([job.jobFolder, '1'], () => '2026-01-01T00:00:00.000Z', ports);
    const client = await job.attach(1);
    await client.nextFrame((frame) => (frame.kind === 'welcome' || frame.kind === 'state') && frame.state === 'ended');
    const record = JSON.parse(readFileSync(watcherFilesOf(job.jobFolder, 1).watcherRecordPath, 'utf8')) as { watcher: ProcessIdentity; childProcess: ProcessIdentity };
    client.send({ kind: 'stop', graceMilliseconds: 0 });
    expect(await watcherRun).toBe(0);
    client.close();
    expect(record.watcher).toEqual({ processId: process.pid, startStamp: String(CREATION_TIME), bootIdentity: FAKE_BOOT_ID_TEXT });
    expect(record.childProcess.startStamp).toBe(String(CREATION_TIME));
    expect(record.childProcess.processId).not.toBe(process.pid);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
