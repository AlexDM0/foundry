/**
 * A Watcher whose event log fails while its child runs, over the recorded endpoint, the child a real process. What matters: the cause
 * reaches the Watcher log before the run fails, both from a child's line and from a client's frame, since the Overseer only sees a lost
 * Watcher and the log is the one place left to read why; and the record stays unended, so the Overseer recovers the job as `watcher-lost`
 * as before, with no end reason of a new kind.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';

import { afterEach, beforeEach, expect } from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from '../../testing/ChildProcessCaseTimeout.ts';
import { useRecordedLocalEndpoint }                       from '../../testing/RecordedLocalEndpoint.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenRecorded }                               from '../../testing/ToolGuard.ts';
import { waitUntil }                                      from '../../testing/WaitUntil.ts';
import { processSupervisionFor }                          from '../process-identity/ProcessSupervisionFor.ts';
import { runWatcherOnPorts }                              from './Watcher.ts';
import { watcherFilesOf }                                 from './WatcherFiles.ts';
import type { WatcherLaunch }                             from './WatcherLaunch.ts';
import type { WatcherRecord }                             from './WatcherRecord.ts';
import { WATCHER_PROTOCOL_VERSION }                       from './constants/WatcherProtocol.ts';

const EXAMPLE_WATCHER_SECRET = 'example-secret';
const DISK_FAILURE_TEXT = 'ENOSPC: example disk failure';

let jobFolder = '';
const recordedEndpoint = useRecordedLocalEndpoint();

beforeEach(() => {
  jobFolder = createScratchDirectory('watcher-failure');
});

afterEach(() => {
  removeScratchDirectory(jobFolder);
});

/** The event log stamps every entry it appends, so a stamp that throws fails each append as a full disk does. */
function failingStamp(): string {
  throw new Error(DISK_FAILURE_TEXT);
}

/** Writes the launch of an agent child running `childScript` and answers the socket path it names. */
function writeLaunch(childScript: string): string {
  const socketPath = recordedEndpoint.endpoint.endpointOf({
    monitorFolder: jobFolder, trackerId: 'tracker-example', jobId: 'J-1', instance: 1
  });
  const secretFilePath = join(jobFolder, 'secret-1');
  writeFileSync(secretFilePath, EXAMPLE_WATCHER_SECRET);
  const launch: WatcherLaunch = {
    kind:               'agent',
    argv:               [process.execPath, '-e', childScript],
    environment:        {},
    workingDirectory:   jobFolder,
    standingReplies:    [],
    protocolVersion:    WATCHER_PROTOCOL_VERSION,
    jobId:              'J-1',
    watcherCodeVersion: 'code-example',
    socketPath,
    secretFilePath,
  };
  writeFileSync(watcherFilesOf(jobFolder, 1).launchPath, JSON.stringify(launch));
  return socketPath;
}

function recordOfTheWatcher(): WatcherRecord | null {
  const recordPath = watcherFilesOf(jobFolder, 1).watcherRecordPath;
  return existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) as WatcherRecord : null;
}

function watcherLogText(): string {
  return readFileSync(watcherFilesOf(jobFolder, 1).watcherLogPath, 'utf8');
}

testWhenRecorded(['local-endpoint-recording'], 'a child line the event log cannot take fails the Watcher with its cause in the Watcher log and the record unended', async () => {
  writeLaunch('console.log("example line");');

  const watcherRun = runWatcherOnPorts([jobFolder, '1'], failingStamp, { supervision: processSupervisionFor(process.platform), endpoint: recordedEndpoint.endpoint });

  await expect(watcherRun).rejects.toThrow(DISK_FAILURE_TEXT);
  expect(watcherLogText()).toContain(`watcher failed: Error: ${DISK_FAILURE_TEXT}`);
  expect(recordOfTheWatcher()?.state).toBe('running');
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWhenRecorded(['local-endpoint-recording'], 'a client frame the event log cannot take fails the Watcher with its cause in the Watcher log and the record unended', async () => {
  const socketPath = writeLaunch('for await (const line of console) console.error(line);');
  const watcherRun = runWatcherOnPorts([jobFolder, '1'], failingStamp, { supervision: processSupervisionFor(process.platform), endpoint: recordedEndpoint.endpoint });
  await waitUntil(() => recordOfTheWatcher()?.state === 'running', 'the Watcher running its child');
  const client = recordedEndpoint.endpoint.connectionTo(socketPath);
  client.on('data', () => undefined);
  const hello = {
    kind: 'hello', protocolVersion: WATCHER_PROTOCOL_VERSION, sinceSequence: 0, watcherSecret: EXAMPLE_WATCHER_SECRET
  };
  client.once('connect', () => client.write(`${JSON.stringify(hello)}\n${JSON.stringify({ kind: 'write', line: 'example chat line' })}\n`));

  await expect(watcherRun).rejects.toThrow(DISK_FAILURE_TEXT);
  expect(watcherLogText()).toContain(`watcher failed: Error: ${DISK_FAILURE_TEXT}`);
  expect(recordOfTheWatcher()?.state).toBe('running');
  // A failed Watcher leaves its child to the Overseer's recovery, which no spec runs, so the case ends it.
  const childProcessId = recordOfTheWatcher()?.childProcessGroupId;
  if (childProcessId === undefined) throw new Error('the running record names no child');
  process.kill(childProcessId);
  client.destroy();
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
