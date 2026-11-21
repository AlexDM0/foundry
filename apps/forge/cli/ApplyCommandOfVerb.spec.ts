/**
 * A verb's command applied through the store's command face, the nudge against the recorded Hephaestus API in place of the global `fetch`.
 * What matters: under a job the verb is refused `verb-not-relayable` before the store is reached; an unreadable ticket file is named on
 * standard error after the write, at exit 0; after the write, a live Hephaestus lock gets one body-less `POST api/nudge` with no token, sent once the
 * lock is released; no live Hephaestus lock gets no request; and a Hephaestus gone leaves the write done and the command at exit 0, since
 * Hephaestus's watch notices the write anyway.
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

import { LocalTimeUtil }                                   from '../src/lib/local-time/LocalTimeUtil.ts';
import type { PlatformPorts }                              from '../src/lib/platform-ports/PlatformPortsFor.ts';
import type { HephaestusLockRecord }                       from '../src/services/hephaestus/HephaestusLock.ts';
import { localStoreLayoutOf }                              from '../src/services/tracker/LocalStoreLayout.ts';
import { requireWorkspace }                                from '../src/services/tracker/Workspace.ts';
import { refusalIsOperationRefusal }                       from '../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                                   from '../src/shared/constants/ProductNames.ts';
import { nativePlatformPorts }                             from '../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                  from '../src/testing/RecordedGit.ts';
import { useRecordedHephaestusFetch }                      from '../src/testing/RecordedHephaestusAnswers.ts';
import { HEPHAESTUS_CALL_SHAPES, type RecordedHephaestus } from '../src/testing/RecordedHephaestusFetch.ts';
import { removeScratchDirectory }                          from '../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                       from '../src/testing/ToolGuard.ts';
import { applyCommandOfVerb }                              from './ApplyCommandOfVerb.ts';
import { boardStoreOf }                                    from './BoardStoreOf.ts';
import { runCommandLine }                                  from './Main.ts';
import { createArgumentParser }                            from './arguments/ArgumentParser.ts';
import { createCapturedCommandContext }                    from './testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }          from './testing/InitializedScratchRepository.ts';

const FROZEN_NOW = new Date('2026-09-23T10:00:00Z');
const HEPHAESTUS_LOCK_PROCESS = { processId: 4242, startStamp: '1767225600', bootIdentity: 'example-boot' };

const recordedGit = useRecordedGit();
const recordedHephaestus = useRecordedHephaestusFetch();

let repositoryDirectory = '';
let hephaestus: RecordedHephaestus;
let globalFetch: ReturnType<typeof spyOn> | null = null;

/** The Hephaestus lock's process reads as alive, so no process table is asked. */
function portsWithTheHephaestusLockProcessAlive(): PlatformPorts {
  const native = nativePlatformPorts();
  return {
    ...native,
    processSupervision: {
      ...native.processSupervision,
      identityOf:  (processId) => (processId === HEPHAESTUS_LOCK_PROCESS.processId ? HEPHAESTUS_LOCK_PROCESS : null),
      sameProcess: (first, second) => first.processId === second.processId && first.startStamp === second.startStamp,
    },
  };
}

function writeLiveHephaestusLock(): void {
  const hephaestusDirectory = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'hephaestus');
  mkdirSync(hephaestusDirectory, { recursive: true });
  const record: HephaestusLockRecord = {
    processId:            HEPHAESTUS_LOCK_PROCESS.processId,
    processStartStamp:    HEPHAESTUS_LOCK_PROCESS.startStamp,
    bootIdentity:         HEPHAESTUS_LOCK_PROCESS.bootIdentity,
    port:                 hephaestus.port,
    url:                  hephaestus.url,
    tokenFile:            join(hephaestusDirectory, 'token'),
    codeVersion:          'code-example',
    installVersion:       17,
    talosProtocolVersion: 2,
  };
  writeFileSync(join(hephaestusDirectory, 'lock-1.json'), JSON.stringify(record));
}

async function addTask(): Promise<{ exitCode: number; errorText: string }> {
  const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW, platformPorts: portsWithTheHephaestusLockProcessAlive() });
  const exitCode = await runCommandLine(['task', 'add', 'Review pass'], context);
  return { exitCode, errorText: context.errorText() };
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('apply-command-of-verb', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
  hephaestus = recordedHephaestus();
  globalFetch = spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL, init?: RequestInit) => hephaestus.fetch(input, init)) as typeof fetch);
});

afterEach(() => {
  globalFetch?.mockRestore();
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the nudge after a write', () => {
  test('a live Hephaestus lock gets one body-less POST api/nudge with no token', async () => {
    writeLiveHephaestusLock();
    expect(await addTask()).toEqual({ exitCode: 0, errorText: '' });
    expect(hephaestus.requests.map(({
      method, callShape, authorization, init
    }) => [method, callShape, authorization, init?.body])).toEqual([
      ['POST', HEPHAESTUS_CALL_SHAPES.NUDGE, null, undefined],
    ]);
  });

  test('with no Hephaestus lock no request goes out', async () => {
    expect((await addTask()).exitCode).toBe(0);
    expect(hephaestus.requests).toEqual([]);
  });

  test('a Hephaestus gone leaves the write done at exit 0', async () => {
    writeLiveHephaestusLock();
    hephaestus.stop();
    expect((await addTask()).exitCode).toBe(0);
    expect(hephaestus.requests.map((request) => request.callShape)).toEqual([HEPHAESTUS_CALL_SHAPES.NOTHING_LISTENS]);
  });
});

describeWhenGitIsRecorded('the command face', () => {
  test('a verb under a job is refused verb-not-relayable before any file is read', async () => {
    // A folder that does not exist: finding a board there would fail on a git call no recording answers.
    const folderWithNoBoard = join(repositoryDirectory, 'no-board-here');
    const context = {
      ...createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW }),
      currentDirectory: folderWithNoBoard,
      commandVerb:      'log',
      job:              {
        jobId: 'J4', hatchDirectory: folderWithNoBoard, replyTries: 1, replyIntervalMilliseconds: 1
      },
    };
    const refusal = await applyCommandOfVerb(createArgumentParser(['note', 'Example note']), context, { kind: 'log-note', text: 'Example note' })
      .then(() => null, (thrown: unknown) => thrown);
    expect(refusalIsOperationRefusal(refusal) ? refusal.detail : refusal).toEqual({ kind: 'verb-not-relayable', verb: 'log', jobId: 'J4' });
  });

  test('an unreadable ticket file is named on standard error after the write, and the command exits 0', async () => {
    writeFileSync(join(localStoreLayoutOf(requireWorkspace(repositoryDirectory)).ticketRecordsFolder, '0099-broken.md'), 'no frontmatter here\n');
    const { exitCode, errorText } = await addTask();
    expect(exitCode).toBe(0);
    expect(errorText).toMatch(/^Ticket file ignored: .*0099-broken\.md/);
  });

  test('the nudge goes out after the lock is released: a write of the store during it is not held up', async () => {
    writeLiveHephaestusLock();
    const writesDuringTheNudge: string[] = [];
    globalFetch?.mockImplementation((async (input: string | URL, init?: RequestInit) => {
      const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
      const written = await boardStoreOf(context).store.transactions.transact({ at: LocalTimeUtil.formatLocalIso(FROZEN_NOW), mutate: () => 'written during the nudge' });
      writesDuringTheNudge.push(written.result);
      return hephaestus.fetch(input, init);
    }) as typeof fetch);
    expect(await addTask()).toEqual({ exitCode: 0, errorText: '' });
    expect(writesDuringTheNudge).toEqual(['written during the nudge']);
  });
});
