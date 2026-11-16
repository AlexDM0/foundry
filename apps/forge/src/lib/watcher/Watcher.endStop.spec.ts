/**
 * The Watcher's stop at its end, over fake supervision that answers recorded listings, so no socket or signal is made. What
 * matters: after `close-input` and no `stop`, a launch that asks for the stop at the end signals every group of the last listing, since a
 * wound-down session can leave a group of its own running; and a launch that does not ask for it signals nothing, so that job's groups
 * keep running. A whole Watcher run, its child a real process that ends by itself, holds that the run makes this stop once it ends.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';

import { afterEach, beforeEach, expect } from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                      from '../../testing/ChildProcessCaseTimeout.ts';
import { useRecordedLocalEndpoint }                                     from '../../testing/RecordedLocalEndpoint.ts';
import { createScratchDirectory, removeScratchDirectory }               from '../../testing/ScratchWorkspace.ts';
import { testWhenRecorded }                                             from '../../testing/ToolGuard.ts';
import { waitUntil }                                                    from '../../testing/WaitUntil.ts';
import type { ProcessIdentity }                                         from '../process-identity/ProcessIdentity.ts';
import type { ProcessStopStage, ProcessSupervision, ProcessTreeMember } from '../process-identity/ProcessSupervision.ts';
import { processSupervisionFor }                                        from '../process-identity/ProcessSupervisionFor.ts';
import {
  actOnFrame,
  createWatcherSession,
  runWatcherOnPorts,
  stopTreeLeftAtEnd
} from './Watcher.ts';
import { watcherFilesOf }           from './WatcherFiles.ts';
import type { WatcherLaunch }       from './WatcherLaunch.ts';
import type { WatcherEnd }          from './WatcherRecord.ts';
import { WATCHER_PROTOCOL_VERSION } from './constants/WatcherProtocol.ts';

const CHILD_LEADER: ProcessIdentity = { processId: 4_200_001, startStamp: '2', bootIdentity: 'example-boot' };
const BACKGROUND_SERVER_GROUP: readonly ProcessTreeMember[] = [
  { processId: 4_200_002, startStamp: '2', processGroupId: 4_200_002 },
  { processId: 4_200_003, startStamp: '2', processGroupId: 4_200_002 },
];
const CHILD_EXITED: WatcherEnd = { reason: 'exited', exitCode: 0, signal: null };
/** The listings the group answers: at `close-input`, at the end, at `ask` and at the first `force`; then it reads empty, killed. */
const LISTINGS_UNTIL_KILLED = 4;
const EXAMPLE_WATCHER_SECRET = 'example-secret';

interface StopTreeCall {
  readonly stage:       ProcessStopStage;
  readonly treeMembers: readonly ProcessTreeMember[] | undefined;
}

let jobFolder = '';
const recordedEndpoint = useRecordedLocalEndpoint();

beforeEach(() => {
  jobFolder = createScratchDirectory('watcher-end-stop');
});

afterEach(() => {
  removeScratchDirectory(jobFolder);
});

function supervisionOfABackgroundServer(stopTreeCalls: StopTreeCall[]): ProcessSupervision {
  let listingsLeft = LISTINGS_UNTIL_KILLED;
  return {
    ...processSupervisionFor(process.platform),
    // Every process reads as one of this example boot, so no identity is read through a program a sandbox may refuse.
    identityOf:    (processId) => ({ ...CHILD_LEADER, processId }),
    treeMembersOf: () => {
      if (listingsLeft === 0) return [];
      listingsLeft -= 1;
      return BACKGROUND_SERVER_GROUP;
    },
    stopTree: (_leader, stage, treeMembers) => {
      stopTreeCalls.push({ stage, treeMembers });
      return { verdict: 'signalled' };
    },
  };
}

function launchOf(workingDirectory: string, launchExtras: Partial<WatcherLaunch>): WatcherLaunch {
  return {
    kind:               'agent',
    argv:               [],
    environment:        {},
    workingDirectory,
    standingReplies:    [],
    protocolVersion:    WATCHER_PROTOCOL_VERSION,
    jobId:              'J-1',
    watcherCodeVersion: 'code-example',
    socketPath:         '',
    secretFilePath:     '',
    ...launchExtras,
  };
}

/** A session given `close-input` while it ran, whose child then exited with no `stop` frame. */
function partsOfAWoundDownSession(launchExtras: Partial<WatcherLaunch>, stopTreeCalls: StopTreeCall[]): Parameters<typeof actOnFrame>[0] {
  const { session } = createWatcherSession();
  session.childLeader = CHILD_LEADER;
  const parts = {
    ports:    { supervision: supervisionOfABackgroundServer(stopTreeCalls), endpoint: recordedEndpoint.endpoint },
    launch:   launchOf(jobFolder, launchExtras),
    files:    watcherFilesOf(jobFolder, 1),
    eventLog: {
      append:       (origin, line) => ({ sequence: 1, origin, line }),
      sync:         () => undefined,
      syncAndClose: () => undefined,
    },
    session,
    server: { broadcast: () => undefined, close: () => undefined },
  } satisfies Parameters<typeof actOnFrame>[0];
  actOnFrame(parts, { kind: 'close-input' });
  session.end = CHILD_EXITED;
  return parts;
}

testWhenRecorded(['local-endpoint-recording'], 'a launch that asks for the stop at the end signals every group of the last listing after close-input and no stop', async () => {
  const stopTreeCalls: StopTreeCall[] = [];
  const parts = partsOfAWoundDownSession({ treeStopAtEndGraceMilliseconds: 0 }, stopTreeCalls);

  stopTreeLeftAtEnd(parts);
  await parts.session.stopSignalsSent;

  expect(stopTreeCalls.slice(0, 2)).toEqual([
    { stage: 'ask', treeMembers: BACKGROUND_SERVER_GROUP },
    { stage: 'force', treeMembers: BACKGROUND_SERVER_GROUP },
  ]);
});

/** A whole Watcher run of an agent child that ends by itself, acknowledged by a client over the recorded endpoint; the stop calls it made. */
async function stopTreeCallsOfAnEndedWatcher(launchKeys: Partial<WatcherLaunch>): Promise<StopTreeCall[]> {
  const stopTreeCalls: StopTreeCall[] = [];
  const { endpoint } = recordedEndpoint;
  const socketPath = endpoint.endpointOf({
    monitorFolder: jobFolder, trackerId: 'tracker-example', jobId: 'J-1', instance: 1
  });
  const secretFilePath = join(jobFolder, 'secret-1');
  writeFileSync(secretFilePath, EXAMPLE_WATCHER_SECRET);
  writeFileSync(watcherFilesOf(jobFolder, 1).launchPath, JSON.stringify({
    ...launchOf(jobFolder, launchKeys), argv: [process.execPath, '-e', 'process.exit(0);'], socketPath, secretFilePath,
  }));
  const watcherExit = runWatcherOnPorts([jobFolder, '1'], () => '2026-01-01T00:00:00.000Z', { supervision: supervisionOfABackgroundServer(stopTreeCalls), endpoint });
  const recordPath = watcherFilesOf(jobFolder, 1).watcherRecordPath;
  // The Watcher sets its end in the turn it writes the ended record, so a `close-input` sent after it is the acknowledgement.
  await waitUntil(() => existsSync(recordPath) && (JSON.parse(readFileSync(recordPath, 'utf8')) as { state?: string }).state === 'ended', 'the Watcher recording the end');
  const client = endpoint.connectionTo(socketPath);
  const hello = {
    kind: 'hello', protocolVersion: WATCHER_PROTOCOL_VERSION, sinceSequence: 0, watcherSecret: EXAMPLE_WATCHER_SECRET
  };
  client.once('connect', () => client.write(`${JSON.stringify(hello)}\n${JSON.stringify({ kind: 'close-input' })}\n`));
  expect(await watcherExit).toBe(0);
  client.destroy();
  return stopTreeCalls;
}

testWhenRecorded(['local-endpoint-recording'], 'an ended Watcher whose launch asks for the stop at the end signals the groups of its last listing', async () => {
  expect((await stopTreeCallsOfAnEndedWatcher({ treeStopAtEndGraceMilliseconds: 0 })).slice(0, 2)).toEqual([
    { stage: 'ask', treeMembers: BACKGROUND_SERVER_GROUP },
    { stage: 'force', treeMembers: BACKGROUND_SERVER_GROUP },
  ]);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWhenRecorded(['local-endpoint-recording'], 'an ended Watcher whose launch does not ask for the stop at the end signals no group', async () => {
  expect(await stopTreeCallsOfAnEndedWatcher({})).toEqual([]);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

testWhenRecorded(['local-endpoint-recording'], 'a launch that does not ask for the stop at the end signals no group without a stop frame', async () => {
  const stopTreeCalls: StopTreeCall[] = [];
  const parts = partsOfAWoundDownSession({}, stopTreeCalls);

  stopTreeLeftAtEnd(parts);
  await parts.session.stopSignalsSent;

  expect(parts.session.stopSignalsSent).toBeNull();
  expect(stopTreeCalls).toEqual([]);
});
