/**
 * An Overseer run in this process, so its monitor registry can be one that registers the scratch tracker: a spawned binary sees the scratch
 * root as a temp folder and registers nothing. An Overseer whose data folder watch fails to start registers no URL with the monitor: a move of
 * the registry write before the watch start makes it fail. The page stub and the output of that start are held by
 * `cli/overseer/OverseerCommand.integration.spec.ts`. Its confinement is a planted answer and its own identity the recorded process
 * table's, so the start reads the same under a gate's sandbox, which refuses a nested sandbox and a setuid program. A Talos started from the
 * program on disk that answers another protocol version refuses the start `talos-protocol-differs`, naming both versions, and one that never
 * served refuses it `talos-unavailable`; `cli/overseer/OverseerCommand.integration.spec.ts` holds that a started Overseer's Talos serves
 * under a lease it renewed.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join }                                from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { TALOS_PROTOCOL_VERSION }                                from '../../src/lib/talos/constants/TalosProtocol.ts';
import { MONITOR_REGISTRY_FILES }                                from '../../src/services/tracker/constants/MonitorRegistryFiles.ts';
import { PRODUCT_NAMES }                                         from '../../src/shared/constants/ProductNames.ts';
import { fakeGateConfinement }                                   from '../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                   from '../../src/testing/NativePlatformPorts.ts';
import { GIT_CALL_SHAPES, type RecordedGitStep, useRecordedGit } from '../../src/testing/RecordedGit.ts';
import { useRecordedProcessTable }                               from '../../src/testing/RecordedProcessTable.ts';
import { removeScratchDirectory }                                from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                                  from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                                        from '../Main.ts';
import { createCapturedCommandContext }                          from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                from '../testing/InitializedScratchRepository.ts';
import { idleOverseerAnswersIn }                                 from '../testing/RecordedGitStages.ts';
import { talosStartRefusalOf }                                   from './OverseerForeground.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const ORIGIN_ASKED_WITH_NONE_SET: RecordedGitStep = { gitArguments: ['remote', 'get-url', 'origin'], answeredAs: GIT_CALL_SHAPES.ORIGIN_URL_UNSET };

const recordedGit = useRecordedGit();
const processTable = useRecordedProcessTable(nativePlatformPorts());

function registryEntriesIn(monitorFolder: string): Record<string, unknown>[] {
  const registry = JSON.parse(readFileSync(join(monitorFolder, MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME), 'utf8')) as Record<string, Record<string, Record<string, unknown>>>;
  return Object.values(registry[MONITOR_REGISTRY_FILES.ENTRIES_KEY] ?? {});
}

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('overseer-foreground', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the start of an Overseer', () => {
  test('an Overseer whose data folder watch fails to start registers no URL with the monitor', async () => {
    const worktreesFolder = join(repositoryDirectory, PRODUCT_NAMES.WORKTREES_FOLDER);
    rmSync(worktreesFolder, { recursive: true, force: true });
    // A file where the watch creates its Hatch root makes the watch start throw, after the bind and the logged URL.
    writeFileSync(worktreesFolder, 'not a folder\n');
    recordedGit.answerFrom([...idleOverseerAnswersIn(repositoryDirectory), ORIGIN_ASKED_WITH_NONE_SET]);
    processTable.callerProcess();
    const platformPorts = { ...processTable.ports, gateConfinement: fakeGateConfinement('confined') };
    // Inside the repository, so the isolation check asks git nothing for it.
    const homeDirectory = join(repositoryDirectory, 'overseer-home');
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory, temporaryDirectories: [], platformPorts, now: SPEC_CLOCK
    });

    const exitCode = await runCommandLine(['oversee', '--port', '0'], context);

    expect(exitCode, context.errorText()).toBe(2);
    // The start's tracker write registers the tracker, so the entry exists; only an Overseer that gave out its URL adds its key.
    const entries = registryEntriesIn(platformPorts.dataFolders.monitorFolderOf(homeDirectory));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ lastCommand: 'oversee' });
    expect(Object.keys(entries[0] ?? {})).not.toContain('overseer');
  });
});

describe('a start whose Talos cannot serve', () => {
  test('is refused talos-protocol-differs, unrepaired, when the Talos it started answers another protocol version', () => {
    const refusal = talosStartRefusalOf({ verdict: 'held', reason: 'talos-protocol-differs', answeredProtocolVersion: TALOS_PROTOCOL_VERSION + 1 });
    const detail = { kind: 'talos-protocol-differs', requiredProtocolVersion: TALOS_PROTOCOL_VERSION, answeredProtocolVersion: TALOS_PROTOCOL_VERSION + 1 } as const;
    expect(refusal.status).toBe('unrepaired');
    expect(refusal.detail).toEqual(detail);
  });

  test('is refused talos-unavailable, unrepaired, naming why the Talos it started never served', () => {
    const refusal = talosStartRefusalOf({ verdict: 'unavailable', reason: 'endpoint-does-not-fit', startNumber: 2 });
    const detail = { kind: 'talos-unavailable', reason: 'endpoint-does-not-fit', startNumber: 2 } as const;
    expect(refusal.status).toBe('unrepaired');
    expect(refusal.detail).toEqual(detail);
  });
});
