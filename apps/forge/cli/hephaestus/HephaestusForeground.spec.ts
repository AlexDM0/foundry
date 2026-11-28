/**
 * A Hephaestus run in this process, since a spawned binary sees the scratch root as a temp folder and registers nothing. Its confinement is
 * planted and its identity the recorded process table's, so the start reads the same under a gate's sandbox, which refuses a nested sandbox
 * and a setuid program. The page stub and the start's output are held by `cli/hephaestus/StartCommand.integration.spec.ts`.
 */
import {
  appendFileSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test
} from 'bun:test';

import { HephaestusLogIngestion } from '../../src/adapters/hephaestus-log/HephaestusLogIngestion.ts';
import type { DoneFrame }         from '../../src/domain/talos/@types/TalosFrame.ts';

import { TALOS_PROTOCOL_VERSION }                                from '../../src/domain/talos/constants/TalosProtocol.ts';
import { CrashLog }                                              from '../../src/services/hephaestus/CrashLog.ts';
import { hephaestusFilesIn }                                     from '../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock }                                        from '../../src/services/hephaestus/HephaestusLock.ts';
import { startLeaseRenewal }                                     from '../../src/services/hephaestus/LeaseRenewal.ts';
import { Presence }                                              from '../../src/services/hephaestus/Presence.ts';
import type { TalosConnection }                                  from '../../src/services/hephaestus/TalosConnection.ts';
import { requireWorkspace }                                      from '../../src/services/tracker/Workspace.ts';
import { MONITOR_REGISTRY_FILES }                                from '../../src/services/tracker/constants/MonitorRegistryFiles.ts';
import { PRODUCT_NAMES }                                         from '../../src/shared/constants/ProductNames.ts';
import { fakeGateConfinement }                                   from '../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                   from '../../src/testing/NativePlatformPorts.ts';
import { GIT_CALL_SHAPES, type RecordedGitStep, useRecordedGit } from '../../src/testing/RecordedGit.ts';
import { useRecordedProcessTable }                               from '../../src/testing/RecordedProcessTable.ts';
import { createScratchDirectory, removeScratchDirectory }        from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                                  from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                                        from '../Main.ts';
import { createCapturedCommandContext }                          from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                from '../testing/InitializedScratchRepository.ts';
import { idleHephaestusAnswersIn }                               from '../testing/RecordedGitStages.ts';
import { heartbeatOnRenewalOf, talosStartRefusalOf }             from './HephaestusForeground.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const ORIGIN_ASKED_WITH_NONE_SET: RecordedGitStep = { gitArguments: ['remote', 'get-url', 'origin'], answeredAs: GIT_CALL_SHAPES.ORIGIN_URL_UNSET };

const recordedGit = useRecordedGit();
const processTable = useRecordedProcessTable(nativePlatformPorts());

function storedLogRecordsOf(repository: string): { kind: string; fields?: unknown }[] {
  const logText = readFileSync(join(repository, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl'), 'utf8');
  return logText.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as { kind: string; fields?: unknown });
}

function registryEntriesIn(monitorFolder: string): Record<string, unknown>[] {
  const registry = JSON.parse(readFileSync(join(monitorFolder, MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME), 'utf8')) as Record<string, Record<string, Record<string, unknown>>>;
  return Object.values(registry[MONITOR_REGISTRY_FILES.ENTRIES_KEY] ?? {});
}

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the start of a Hephaestus', () => {
  let repositoryDirectory = '';

  beforeEach(async () => {
    repositoryDirectory = await createInitializedRecordedGitRepository('hephaestus-foreground', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  });

  afterEach(() => {
    removeScratchDirectory(repositoryDirectory);
  });

  test('a Hephaestus whose data folder watch fails to start registers no URL with the monitor', async () => {
    const worktreesFolder = join(repositoryDirectory, PRODUCT_NAMES.WORKTREES_FOLDER);
    rmSync(worktreesFolder, { recursive: true, force: true });
    // A file where the watch creates its Hatch root makes the watch start throw, after the bind and the logged URL.
    writeFileSync(worktreesFolder, 'not a folder\n');
    recordedGit.answerFrom([...idleHephaestusAnswersIn(repositoryDirectory), ORIGIN_ASKED_WITH_NONE_SET]);
    processTable.callerProcess();
    const platformPorts = { ...processTable.ports, gateConfinement: fakeGateConfinement('confined') };
    // Inside the repository, so the isolation check asks git nothing for it.
    const homeDirectory = join(repositoryDirectory, 'hephaestus-home');
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory, temporaryDirectories: [], platformPorts, now: SPEC_CLOCK
    });

    const exitCode = await runCommandLine(['start', '--foreground', '--port', '0'], context);

    expect(exitCode, context.errorText()).toBe(2);
    // The start's tracker write registers the tracker, so the entry exists; only a Hephaestus that gave out its URL adds its key.
    const entries = registryEntriesIn(platformPorts.dataFolders.monitorFolderOf(homeDirectory));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ lastCommand: 'start' });
    expect(Object.keys(entries[0] ?? {})).not.toContain('hephaestus');
  });

  test('the start hold logs start-classified right after hephaestus-started, and presence records the classification and origin', async () => {
    const worktreesFolder = join(repositoryDirectory, PRODUCT_NAMES.WORKTREES_FOLDER);
    rmSync(worktreesFolder, { recursive: true, force: true });
    // The watch start fails after the start hold, so the case reads what the hold logged with no Talos started.
    writeFileSync(worktreesFolder, 'not a folder\n');
    recordedGit.answerFrom([...idleHephaestusAnswersIn(repositoryDirectory), ORIGIN_ASKED_WITH_NONE_SET]);
    processTable.callerProcess();
    const platformPorts = { ...processTable.ports, gateConfinement: fakeGateConfinement('confined') };
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory: join(repositoryDirectory, 'hephaestus-home'), temporaryDirectories: [], platformPorts, now: SPEC_CLOCK
    });

    expect(await runCommandLine(['start', '--foreground', '--started-by', 'user', '--port', '0'], context), context.errorText()).toBe(2);

    const records = storedLogRecordsOf(repositoryDirectory);
    const startedIndex = records.findIndex((record) => record.kind === 'hephaestus-started');
    expect(startedIndex).toBeGreaterThanOrEqual(0);
    expect(records[startedIndex + 1]).toMatchObject({ kind: 'start-classified', fields: { kind: 'first-start', startOrigin: 'user' } });
    const presence = Presence.readPresence(hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory));
    expect(presence.verdict === 'read' ? presence.record : null).toMatchObject({ startOrigin: 'user', startClassification: { kind: 'first-start' } });
  });

  test('a successor\'s start after a crash of its predecessor is refused forge-off-after-crash and leaves no Hephaestus lock generation and no port bound', async () => {
    const files = hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
    const crashedGeneration = 2;
    Presence.writeStartedPresence(files, {
      generation:          crashedGeneration,
      process:             { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
      codeVersion:         'code-example',
      startOrigin:         'user',
      startedAt:           '2026-09-18T20:00:00+00:00',
      startClassification: null,
    });
    Presence.writeEnding(files, crashedGeneration, { kind: 'crashed', component: 'hephaestus', crashLogNumber: null }, '2026-09-18T20:05:00+00:00');
    // What the successor's proof of the code on disk asks, then the registry's read of the origin; no git call of a serving start.
    recordedGit.answerFrom([...idleHephaestusAnswersIn(repositoryDirectory), ORIGIN_ASKED_WITH_NONE_SET]);
    processTable.callerProcess();
    const platformPorts = { ...processTable.ports, gateConfinement: fakeGateConfinement('confined') };
    const homeDirectory = join(repositoryDirectory, 'hephaestus-home');
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory, temporaryDirectories: [], platformPorts, now: SPEC_CLOCK
    });

    expect(await runCommandLine(['start', '--successor-of', String(crashedGeneration), '--port', '0'], context), context.errorText()).toBe(1);

    expect(context.errorText()).toContain(`is off after a crash of Hephaestus lock ${crashedGeneration}`);
    expect(HephaestusLock.generationsIn(files.hephaestusDirectory)).toEqual([]);
    const hephaestusLog = readFileSync(files.logFilePath, 'utf8');
    expect(hephaestusLog).toContain('Staying off after a crash of Hephaestus lock 2');
    expect(hephaestusLog).not.toContain('Hephaestus serving');
    const [entry] = registryEntriesIn(platformPorts.dataFolders.monitorFolderOf(homeDirectory));
    expect(Object.keys(entry ?? {})).not.toContain('hephaestus');
    expect(entry?.['presence']).toMatchObject({ state: 'crashed', generation: crashedGeneration, crash: { crashLogPath: CrashLog.pathOf(files, 1) } });
  });

  test('a successor, whose standard error is hephaestus.log, writes each record once, as a JSON line the log reader reads', async () => {
    const files = hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
    const crashedGeneration = 2;
    Presence.writeStartedPresence(files, {
      generation:          crashedGeneration,
      process:             { processId: 4242, startStamp: '1700000000', bootIdentity: 'example-boot' },
      codeVersion:         'code-example',
      startOrigin:         'user',
      startedAt:           '2026-09-18T20:00:00+00:00',
      startClassification: null,
    });
    Presence.writeEnding(files, crashedGeneration, { kind: 'crashed', component: 'hephaestus', crashLogNumber: null }, '2026-09-18T20:05:00+00:00');
    recordedGit.answerFrom([...idleHephaestusAnswersIn(repositoryDirectory), ORIGIN_ASKED_WITH_NONE_SET]);
    processTable.callerProcess();
    const platformPorts = { ...processTable.ports, gateConfinement: fakeGateConfinement('confined') };
    const capturedContext = createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory: join(repositoryDirectory, 'hephaestus-home'), temporaryDirectories: [], platformPorts, now: SPEC_CLOCK
    });
    // As `spawnSuccessor` starts it: standard error appended to the log.
    const context = { ...capturedContext, standardError: (text: string) => appendFileSync(files.logFilePath, `${text}\n`) };

    expect(await runCommandLine(['start', '--successor-of', String(crashedGeneration), '--port', '0'], context)).toBe(1);

    const reading = new HephaestusLogIngestion(files.logFilePath).read();
    const lines = reading.verdict === 'readable' ? reading.lines : [];
    const notRecords = lines.filter((line) => line.verdict === 'not-a-record');
    expect(lines.filter((line) => line.verdict === 'record').length).toBeGreaterThan(0);
    // Only the refusal the command prints as it ends is no record.
    expect(notRecords).toHaveLength(1);
    expect(notRecords[0]?.storedText).toContain(`is off after a crash of Hephaestus lock ${crashedGeneration}`);
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

describe('the heartbeat written at a lease renewal', () => {
  const RENEWAL_INTERVAL_MILLISECONDS = 150;
  const GENERATION = 3;
  const DONE: DoneFrame = { kind: 'done', frameId: 1, verdict: 'done' };
  const connection: TalosConnection = {
    send:    () => Promise.resolve(DONE),
    onState: () => undefined,
    onClose: () => undefined,
    close:   () => undefined,
  };
  let boardFolder = '';
  let stopRenewal = (): void => undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    boardFolder = createScratchDirectory('hephaestus-heartbeat');
  });

  afterEach(() => {
    stopRenewal();
    jest.useRealTimers();
    removeScratchDirectory(boardFolder);
  });

  /** Every promise the renewal chained on the fake connection's answer has settled. */
  async function renewalsSettled(): Promise<void> {
    for (const _turn of [1, 2, 3, 4, 5]) await Promise.resolve();
  }

  function renewingWhile(passInFlight: () => number | null) {
    const files = hephaestusFilesIn(boardFolder);
    let wallNowMilliseconds = SPEC_CLOCK().getTime();
    const renewal = startLeaseRenewal({
      connection: () => connection,
      renewer:    {
        processId: 4242, startStamp: '1', bootIdentity: 'example-boot', generation: GENERATION
      },
      intervalMilliseconds: RENEWAL_INTERVAL_MILLISECONDS,
      tickGapMilliseconds:  RENEWAL_INTERVAL_MILLISECONDS,
      passProgress:         { passInFlight },
      wallNowMilliseconds:  () => wallNowMilliseconds,
      log:                  () => undefined,
      onRenewed:            heartbeatOnRenewalOf(files, GENERATION, () => undefined),
    });
    stopRenewal = renewal.stop;
    const sequenceNow = () => {
      const reading = Presence.readHeartbeat(files);
      return reading.verdict === 'read' ? reading.record.sequence : null;
    };
    const tick = async () => {
      wallNowMilliseconds += RENEWAL_INTERVAL_MILLISECONDS;
      jest.advanceTimersByTime(RENEWAL_INTERVAL_MILLISECONDS);
      await renewalsSettled();
    };
    return { sequenceNow, tick };
  }

  test('a renewal Talos confirmed writes one beat of the generation', async () => {
    const renewing = renewingWhile(() => null);
    await renewalsSettled();
    expect(renewing.sequenceNow()).toBe(1);

    await renewing.tick();
    expect(renewing.sequenceNow()).toBe(2);
  });

  test('a withheld renewal writes no beat', async () => {
    const renewing = renewingWhile(() => 1);
    await renewalsSettled();
    await renewing.tick();
    expect(renewing.sequenceNow()).toBe(1);

    await renewing.tick();
    expect(renewing.sequenceNow()).toBe(1);
  });
});
