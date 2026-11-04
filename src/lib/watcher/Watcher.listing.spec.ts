/**
 * The Watcher's tree listing and its claim, over fake supervision and fake file moves, so no process, socket or link is made. What matters:
 * a stop whose fresh listing cannot be read signals no member of the kept listing, since the kept one only finds groups again and a signal
 * needs a fresh answer; and a claim that cannot be created whole records nothing and exits refused, so no reader sees a partial claim.
 */
import { existsSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { useRecordedLocalEndpoint }                            from '../../testing/RecordedLocalEndpoint.ts';
import { createScratchDirectory, removeScratchDirectory }      from '../../testing/ScratchWorkspace.ts';
import type { FileReplace }                                    from '../atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                            from '../atomic-file/FileReplaceFor.ts';
import type { ProcessIdentity }                                from '../process-identity/ProcessIdentity.ts';
import type { ProcessSupervision, ProcessTreeMember }          from '../process-identity/ProcessSupervision.ts';
import { processSupervisionFor }                               from '../process-identity/ProcessSupervisionFor.ts';
import { actOnFrame, createWatcherSession, runWatcherOnPorts } from './Watcher.ts';
import { watcherFilesOf }                                      from './WatcherFiles.ts';
import { WATCHER_PROTOCOL_VERSION }                            from './constants/WatcherProtocol.ts';

const CHILD_LEADER: ProcessIdentity = { processId: 4_100_001, startStamp: '2', bootIdentity: 'example-boot' };
const KEPT_MEMBERS: readonly ProcessTreeMember[] = [
  { processId: 4_100_002, startStamp: '2', processGroupId: 4_100_002 },
  { processId: 4_100_003, startStamp: '2', processGroupId: 4_100_003 },
];

let jobFolder = '';
const recordedEndpoint = useRecordedLocalEndpoint();

beforeEach(() => {
  jobFolder = createScratchDirectory('watcher-listing');
});

afterEach(() => {
  removeScratchDirectory(jobFolder);
});

/** Lists the two kept members once, then cannot read the tree for the `ask` and the first `force`, then reads it empty so the sweep ends. */
function supervisionWithAnUnreadableListing(stopTreeMembers: (readonly ProcessTreeMember[] | undefined)[]): ProcessSupervision {
  const listings: (readonly ProcessTreeMember[] | null)[] = [KEPT_MEMBERS, null, null];
  return {
    ...processSupervisionFor(process.platform),
    treeMembersOf: () => (listings.length > 0 ? listings.shift() ?? null : []),
    stopTree:      (_leader, _stage, treeMembers) => {
      stopTreeMembers.push(treeMembers);
      return { verdict: 'group-gone' };
    },
  };
}

test('a stop whose fresh listing cannot be read signals none of the members the earlier listing kept', async () => {
  const stopTreeMembers: (readonly ProcessTreeMember[] | undefined)[] = [];
  const { session } = createWatcherSession();
  session.childLeader = CHILD_LEADER;
  const parts = {
    ports:  { supervision: supervisionWithAnUnreadableListing(stopTreeMembers), endpoint: recordedEndpoint.endpoint },
    launch: {
      kind:               'process',
      argv:               [],
      environment:        {},
      workingDirectory:   jobFolder,
      standingReplies:    [],
      protocolVersion:    WATCHER_PROTOCOL_VERSION,
      jobId:              'J-1',
      watcherCodeVersion: 'code-example',
      socketPath:         '',
      secretFilePath:     '',
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

  actOnFrame(parts, { kind: 'stop', graceMilliseconds: 0 });
  await session.stopSignalsSent;

  expect(stopTreeMembers.length).toBeGreaterThanOrEqual(2);
  for (const members of stopTreeMembers) expect(members).toEqual([]);
});

test('a claim that cannot be created whole, where hard links fail, records nothing and exits refused', async () => {
  let wholeCreations = 0;
  const fileReplaceWithoutLinks: FileReplace = {
    ...fileReplaceOfThisProcess(),
    createWholeExclusively: () => {
      wholeCreations += 1;
      throw Object.assign(new Error('EPERM: example link refusal'), { code: 'EPERM' });
    },
  };
  const ports = {
    supervision: { ...processSupervisionFor(process.platform), identityOf: () => CHILD_LEADER },
    endpoint:    recordedEndpoint.endpoint,
    fileReplace: fileReplaceWithoutLinks,
  };

  expect(await runWatcherOnPorts([jobFolder, '1'], () => '2026-01-01T00:00:00.000Z', ports)).toBe(1);
  expect(wholeCreations).toBe(1);
  expect(existsSync(watcherFilesOf(jobFolder, 1).watcherRecordPath)).toBe(false);
});
