/**
 * The CLI's store, as `boardStoreIn` composes it. What matters: a stale store lock record its write takes over is logged to the command's
 * standard error in words, so the take-over the lock rule requires to be logged reaches the user.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { GENERATION_RECORD_FORMAT_VERSION }               from '../src/adapters/generation-record/GenerationRecordIngestion.ts';
import type { PlatformPorts }                             from '../src/lib/platform-ports/PlatformPortsFor.ts';
import { localStoreLayoutOf }                             from '../src/services/tracker/LocalStoreLayout.ts';
import { workspacePathsFor }                              from '../src/services/tracker/Workspace.ts';
import { defaultSpecPlatformPorts }                       from '../src/testing/DefaultSpecPlatformPorts.ts';
import { ECHOED_CONTROL_CONTEXT }                         from '../src/testing/EchoedControlContext.ts';
import { createScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchWorkspace.ts';
import { boardStoreIn }                                   from './BoardStoreOf.ts';

const GONE_HOLDER = { processId: 4242, startStamp: '1763370000', bootIdentity: 'example-boot' };
const STARTED_AT  = '2026-11-20T09:00:00+01:00';
const CHANGED_AT  = '2026-11-20T10:00:00+01:00';

let repositoryRoot = '';

beforeEach(() => {
  repositoryRoot = createScratchDirectory('board-store-of');
  mkdirSync(join(repositoryRoot, '.git'));
});

afterEach(() => {
  removeScratchDirectory(repositoryRoot);
});

/** The spec's ports, where the planted holder's process alone is gone. */
function portsWhereTheHolderIsGone(): PlatformPorts {
  const ports = defaultSpecPlatformPorts();
  return { ...ports, processSupervision: { ...ports.processSupervision, processIsGone: (processId) => processId === GONE_HOLDER.processId } };
}

test('a stale store lock record a write takes over is logged to standard error in words', async () => {
  const errorLines: string[] = [];
  const context = { now: () => new Date(CHANGED_AT), platformPorts: portsWhereTheHolderIsGone(), standardError: (line: string) => errorLines.push(line) };
  const workspace = workspacePathsFor(repositoryRoot);
  const store = boardStoreIn(context, workspace);
  await store.initialise({ project: 'Example Agency', startedAt: STARTED_AT, trackerId: 'example-tracker' });
  const recordPath = join(localStoreLayoutOf(workspace).storeLockFolder, 'generation-99');
  writeFileSync(recordPath, JSON.stringify({
    version: GENERATION_RECORD_FORMAT_VERSION, holder: GONE_HOLDER, acquiredAt: STARTED_AT, state: 'held'
  }));

  await store.commands.apply({ command: { kind: 'concurrency-set', limit: 6 }, at: CHANGED_AT, context: ECHOED_CONTROL_CONTEXT });

  expect(errorLines).toEqual([`The lock record ${recordPath} was stale and is taken over: the process ${GONE_HOLDER.processId} it names is gone.`]);
});
