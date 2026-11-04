/**
 * The Watcher's stop at its end, over fake supervision that answers recorded listings, so no process, socket or signal is made. What
 * matters: after `close-input` and no `stop`, a launch that asks for the stop at the end signals every group of the last listing, since a
 * wound-down session can leave a group of its own running; and a launch that does not ask for it signals nothing, so that job's groups
 * keep running.
 */
import { afterEach, beforeEach, expect } from 'bun:test';

import { useRecordedLocalEndpoint }                                     from '../../testing/RecordedLocalEndpoint.ts';
import { createScratchDirectory, removeScratchDirectory }               from '../../testing/ScratchWorkspace.ts';
import { testWhenRecorded }                                             from '../../testing/ToolGuard.ts';
import type { ProcessIdentity }                                         from '../process-identity/ProcessIdentity.ts';
import type { ProcessStopStage, ProcessSupervision, ProcessTreeMember } from '../process-identity/ProcessSupervision.ts';
import { processSupervisionFor }                                        from '../process-identity/ProcessSupervisionFor.ts';
import { actOnFrame, createWatcherSession, stopTreeLeftAtEnd }          from './Watcher.ts';
import { watcherFilesOf }                                               from './WatcherFiles.ts';
import type { WatcherLaunch }                                           from './WatcherLaunch.ts';
import type { WatcherEnd }                                              from './WatcherRecord.ts';
import { WATCHER_PROTOCOL_VERSION }                                     from './constants/WatcherProtocol.ts';

const CHILD_LEADER: ProcessIdentity = { processId: 4_200_001, startStamp: '2', bootIdentity: 'example-boot' };
const BACKGROUND_SERVER_GROUP: readonly ProcessTreeMember[] = [
  { processId: 4_200_002, startStamp: '2', processGroupId: 4_200_002 },
  { processId: 4_200_003, startStamp: '2', processGroupId: 4_200_002 },
];
const CHILD_EXITED: WatcherEnd = { reason: 'exited', exitCode: 0, signal: null };
/** The listings the group answers: at `close-input`, at the end, at `ask` and at the first `force`; then it reads empty, killed. */
const LISTINGS_UNTIL_KILLED = 4;

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

/** A session given `close-input` while it ran, whose child then exited with no `stop` frame. */
function partsOfAWoundDownSession(launchExtras: Partial<WatcherLaunch>, stopTreeCalls: StopTreeCall[]): Parameters<typeof actOnFrame>[0] {
  const { session } = createWatcherSession();
  session.childLeader = CHILD_LEADER;
  const parts = {
    ports:  { supervision: supervisionOfABackgroundServer(stopTreeCalls), endpoint: recordedEndpoint.endpoint },
    launch: {
      kind:               'agent',
      argv:               [],
      environment:        {},
      workingDirectory:   jobFolder,
      standingReplies:    [],
      protocolVersion:    WATCHER_PROTOCOL_VERSION,
      jobId:              'J-1',
      watcherCodeVersion: 'code-example',
      socketPath:         '',
      secretFilePath:     '',
      ...launchExtras,
    },
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

testWhenRecorded(['local-endpoint-recording'], 'a launch that does not ask for the stop at the end signals no group without a stop frame', async () => {
  const stopTreeCalls: StopTreeCall[] = [];
  const parts = partsOfAWoundDownSession({}, stopTreeCalls);

  stopTreeLeftAtEnd(parts);
  await parts.session.stopSignalsSent;

  expect(parts.session.stopSignalsSent).toBeNull();
  expect(stopTreeCalls).toEqual([]);
});
