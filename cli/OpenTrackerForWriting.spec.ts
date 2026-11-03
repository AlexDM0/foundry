/**
 * The nudge a write sends the live Overseer, against the recorded Overseer API in place of the global `fetch`. What matters: after the
 * write, a live Baton gets one body-less `POST api/nudge` with no token; no live Baton gets no request; and an Overseer gone leaves the
 * write done and the command at exit 0, since the Overseer's watch notices the write anyway.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  spyOn,
  test
} from 'bun:test';

import type { PlatformPorts }                          from '../src/lib/platform-ports/PlatformPortsFor.ts';
import type { BatonRecord }                            from '../src/services/overseer/Baton.ts';
import { PRODUCT_NAMES }                               from '../src/shared/constants/ProductNames.ts';
import { nativePlatformPorts }                         from '../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                              from '../src/testing/RecordedGit.ts';
import { useRecordedOverseerFetch }                    from '../src/testing/RecordedOverseerAnswers.ts';
import { OVERSEER_CALL_SHAPES, type RecordedOverseer } from '../src/testing/RecordedOverseerFetch.ts';
import { removeScratchDirectory }                      from '../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent }                    from '../src/testing/ToolGuard.ts';
import { runCommandLine }                              from './Main.ts';
import { createCapturedCommandContext }                from './testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }      from './testing/InitializedScratchRepository.ts';

const FROZEN_NOW = new Date('2026-09-23T10:00:00Z');
const BATON_PROCESS = { processId: 4242, startStamp: '1767225600', bootIdentity: 'example-boot' };

const recordedGit = useRecordedGit();
const recordedOverseer = useRecordedOverseerFetch();

let repositoryDirectory = '';
let overseer: RecordedOverseer;
let globalFetch: ReturnType<typeof spyOn> | null = null;

/** The Baton's process reads as alive, so no process table is asked. */
function portsWithTheBatonProcessAlive(): PlatformPorts {
  const native = nativePlatformPorts();
  return {
    ...native,
    processSupervision: {
      ...native.processSupervision,
      identityOf:  (processId) => (processId === BATON_PROCESS.processId ? BATON_PROCESS : null),
      sameProcess: (first, second) => first.processId === second.processId && first.startStamp === second.startStamp,
    },
  };
}

function writeLiveBaton(): void {
  const overseerDirectory = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'overseer');
  mkdirSync(overseerDirectory, { recursive: true });
  const record: BatonRecord = {
    processId:              BATON_PROCESS.processId,
    processStartStamp:      BATON_PROCESS.startStamp,
    bootIdentity:           BATON_PROCESS.bootIdentity,
    port:                   overseer.port,
    url:                    overseer.url,
    tokenFile:              join(overseerDirectory, 'token'),
    codeVersion:            'code-example',
    installVersion:         17,
    watcherProtocolVersion: 2,
  };
  writeFileSync(join(overseerDirectory, 'baton-1.json'), JSON.stringify(record));
}

async function addTask(): Promise<{ exitCode: number; errorText: string }> {
  const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW, platformPorts: portsWithTheBatonProcessAlive() });
  const exitCode = await runCommandLine(['task', 'add', 'Review pass'], context);
  return { exitCode, errorText: context.errorText() };
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('open-tracker-for-writing', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  overseer = recordedOverseer();
  globalFetch = spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL, init?: RequestInit) => overseer.fetch(input, init)) as typeof fetch);
});

afterEach(() => {
  globalFetch?.mockRestore();
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsPresent('the nudge after a write', () => {
  test('a live Baton gets one body-less POST api/nudge with no token', async () => {
    writeLiveBaton();
    expect(await addTask()).toEqual({ exitCode: 0, errorText: '' });
    expect(overseer.requests.map(({
      method, callShape, authorization, init
    }) => [method, callShape, authorization, init?.body])).toEqual([
      ['POST', OVERSEER_CALL_SHAPES.NUDGE, null, undefined],
    ]);
  });

  test('with no Baton no request goes out', async () => {
    expect((await addTask()).exitCode).toBe(0);
    expect(overseer.requests).toEqual([]);
  });

  test('an Overseer gone leaves the write done at exit 0', async () => {
    writeLiveBaton();
    overseer.stop();
    expect((await addTask()).exitCode).toBe(0);
    expect(overseer.requests.map((request) => request.callShape)).toEqual([OVERSEER_CALL_SHAPES.NOTHING_LISTENS]);
  });
});
