/**
 * `stop`, answered in this process: it finds nothing to do with no Hephaestus live or, over a fake process table, never reports a clean stop
 * after an end that skipped Hephaestus's own stop, and repairs only once the process is gone, also when an earlier close was refused and left
 * a dead Hephaestus lock; a live one whose lock cannot be read is still ended. The stop waits of a stopping Hephaestus share one bound, so a
 * drive pass that never ends cannot hold back the stop record past what Windows gives. The registry's presence key is written in each state
 * and kept by a call without one; a stop ends presence `stopped` and a release `handed-over`, each also in the registry, the handover's
 * ending written before the crash path lets go of the generation.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createHephaestusLockWriter }                                               from '../../src/adapters/hephaestus-lock/HephaestusLockWriter.ts';
import type { PlatformPorts }                                                       from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessStopStage }                                                    from '../../src/lib/process-identity/ProcessSupervision.ts';
import { hephaestusFilesIn }                                                        from '../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock }                                                           from '../../src/services/hephaestus/HephaestusLock.ts';
import { Presence }                                                                 from '../../src/services/hephaestus/Presence.ts';
import { registerWithTheMonitor }                                                   from '../../src/services/tracker/MonitorRegistration.ts';
import { withLock }                                                                 from '../../src/services/tracker/TrackerLock.ts';
import { requireWorkspace }                                                         from '../../src/services/tracker/Workspace.ts';
import { MONITOR_REGISTRY_FILES }                                                   from '../../src/services/tracker/constants/MonitorRegistryFiles.ts';
import { HEPHAESTUS_STOP_INTERVAL_MILLISECONDS, HEPHAESTUS_STOP_WAIT_MILLISECONDS } from '../../src/shared/constants/HephaestusLimits.ts';
import { PRODUCT_NAMES }                                                            from '../../src/shared/constants/ProductNames.ts';
import { instantSleepsOf }                                                          from '../../src/testing/InstantSleeps.ts';
import { lockRetryWaitsDuring }                                                     from '../../src/testing/LockRetryWaits.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                                                  from '../../src/testing/LockTakers.ts';
import { nativePlatformPorts }                                                      from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                                           from '../../src/testing/RecordedGit.ts';
import { useRecordedProcessTable }                                                  from '../../src/testing/RecordedProcessTable.ts';
import { registeredBoardFactsOf }                                                   from '../../src/testing/RegisteredBoardFacts.ts';
import { removeScratchDirectory }                                                   from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                                                     from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                                                           from '../Main.ts';
import { createArgumentParser }                                                     from '../arguments/ArgumentParser.ts';
import { createCapturedCommandContext }                                             from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                                   from '../testing/InitializedScratchRepository.ts';
import { ANSWER_VERSION }                                                           from '../utils/ProgramAnswerUtil.ts';
import { closeTheStoppedHephaestus, recordTheHandover, waitOutTheStopWaits }        from './HephaestusForeground.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const WEDGED_PROCESS_ID          = 5_000_000;
const UNANSWERING_URL            = 'http://127.0.0.1:1/';
const SUCCESSOR_URL              = 'http://127.0.0.1:2/';
const READS_WHILE_THE_STOP_LANDS = 2;

const recordedGit = useRecordedGit();
const processTable = useRecordedProcessTable(nativePlatformPorts());
const hephaestusStoppedRecordsIn = (logKinds: readonly string[]): number => logKinds.filter((kind) => kind === 'hephaestus-stopped').length;

function storedLogKindsOf(repository: string): string[] {
  const logFilePath = join(repository, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl');
  if (!existsSync(logFilePath)) return [];
  return readFileSync(logFilePath, 'utf8').split('\n').filter((line) => line !== '').map((line) => (JSON.parse(line) as { kind: string }).kind);
}

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('hephaestus', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'run stop', () => {
  test('stop with no Hephaestus live has nothing to do', async () => {
    const stopped = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['stop'], stopped), stopped.errorText()).toBe(0);
    expect(stopped.outputText().trim()).toBe('No Hephaestus is live; nothing to stop.');
  });

  /** A live Hephaestus whose API never answers, played by one process-table entry that a stop ends only after further reads of it. */
  function plantWedgedHephaestus(
    fallbackStopIsForced: boolean,
    whenStopLands: (hephaestusDirectory: string) => void = () => undefined,
    lockFormat: 'current' | 'without-version' = 'current',
  ) {
    const workspace = requireWorkspace(repositoryDirectory);
    const { hephaestusDirectory } = hephaestusFilesIn(workspace.trackerDirectory);
    const identity  = { processId: WEDGED_PROCESS_ID, startStamp: '2', bootIdentity: 'example-boot' };
    const homeDirectory = join(repositoryDirectory, 'wedged-home');
    const stopStages: ProcessStopStage[] = [];
    const logKindsWhileLive: string[][] = [];
    let readsLeftOnceStopped = Number.POSITIVE_INFINITY;
    const native = nativePlatformPorts();
    const platformPorts: PlatformPorts = {
      ...native,
      processSupervision: {
        ...native.processSupervision,
        fallbackStopIsForced,
        identityOf: (processId) => {
          if (processId !== identity.processId) return null;
          if (readsLeftOnceStopped <= 0) return null;
          readsLeftOnceStopped -= 1;
          logKindsWhileLive.push(storedLogKindsOf(repositoryDirectory));
          return identity;
        },
        stopProcess: (_processId, stage) => {
          stopStages.push(stage);
          readsLeftOnceStopped = READS_WHILE_THE_STOP_LANDS;
          whenStopLands(hephaestusDirectory);
          return { verdict: 'signalled' };
        },
      },
    };
    const record = {
      processId:            identity.processId,
      processStartStamp:    identity.startStamp,
      bootIdentity:         identity.bootIdentity,
      port:                 1,
      url:                  UNANSWERING_URL,
      tokenFile:            join(hephaestusDirectory, 'token'),
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    };
    if (lockFormat === 'without-version') {
      mkdirSync(hephaestusDirectory, { recursive: true });
      writeFileSync(HephaestusLock.filePathFor(hephaestusDirectory, 1), JSON.stringify(record));
    } else {
      expect(HephaestusLock.acquire(platformPorts, hephaestusDirectory, record).verdict).toBe('acquired');
    }
    const stopContext = () => createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory, temporaryDirectories: [], platformPorts
    });
    return {
      workspace, hephaestusDirectory, homeDirectory, stopStages, logKindsWhileLive, platformPorts, stopContext
    };
  }

  async function registerWedgedHephaestus({ workspace, homeDirectory }: ReturnType<typeof plantWedgedHephaestus>): Promise<void> {
    await registerWithTheMonitor({
      ...registeredBoardFactsOf(workspace),
      monitorFolder:        join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER),
      lockTaker:            LIVE_HOLDERS_LOCK_TAKER,
      temporaryDirectories: [],
      command:              'start',
      program:              '/example/bin/forge',
      now:                  SPEC_CLOCK,
      hephaestus:           {
        url: UNANSWERING_URL, processId: WEDGED_PROCESS_ID, startedAt: '2026-09-18T20:11:03+00:00', tokenPath: '/example/monitor/private/example/token'
      },
    });
  }

  function registeredHephaestusProcessesIn(homeDirectory: string): unknown[] {
    const registryFilePath = join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER, MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME);
    const registry = JSON.parse(readFileSync(registryFilePath, 'utf8')) as Record<string, Record<string, { hephaestus?: unknown }>>;
    return Object.values(registry[MONITOR_REGISTRY_FILES.ENTRIES_KEY] ?? {}).flatMap((entry) => (entry.hephaestus === undefined ? [] : [entry.hephaestus]));
  }

  function registeredPresenceIn(homeDirectory: string): unknown {
    const registryFilePath = join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER, MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME);
    const registry = JSON.parse(readFileSync(registryFilePath, 'utf8')) as Record<string, Record<string, { presence?: unknown }>>;
    return Object.values(registry[MONITOR_REGISTRY_FILES.ENTRIES_KEY] ?? {})[0]?.presence;
  }

  /** The stop waits for the wedged process to go; its waits end at once, and the case proves the wait ran. */
  async function stopWithInstantWaits(commandLine: string[], context: ReturnType<typeof createCapturedCommandContext>): Promise<number> {
    const { value: exitCode, instantSleeps } = await instantSleepsOf(HEPHAESTUS_STOP_INTERVAL_MILLISECONDS, () => runCommandLine(commandLine, context));
    expect(instantSleeps).toBeGreaterThan(0);
    return exitCode;
  }

  test('a forced end says so, and the CLI does what Hephaestus could not, with the process gone first; a second stop finds nothing to do', async () => {
    const wedged = plantWedgedHephaestus(true);
    await registerWedgedHephaestus(wedged);
    expect(registeredHephaestusProcessesIn(wedged.homeDirectory)).toHaveLength(1);

    const stopped = wedged.stopContext();
    expect(await stopWithInstantWaits(['stop'], stopped), stopped.errorText()).toBe(0);

    expect(wedged.stopStages).toEqual(['force']);
    expect(stopped.outputText()).toContain(`Ended Hephaestus at ${UNANSWERING_URL} by force`);
    expect(stopped.outputText()).not.toContain('Stopped Hephaestus');
    expect(hephaestusStoppedRecordsIn(wedged.logKindsWhileLive.at(-1) ?? [])).toBe(0);
    expect(hephaestusStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
    expect(registeredHephaestusProcessesIn(wedged.homeDirectory)).toEqual([]);
    expect(HephaestusLock.newestOf(wedged.platformPorts, wedged.hephaestusDirectory).verdict).toBe('none');

    const again = wedged.stopContext();
    expect(await runCommandLine(['stop'], again), again.errorText()).toBe(0);
    expect(again.outputText().trim()).toBe('No Hephaestus is live; nothing to stop.');
    expect(hephaestusStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
  });

  test('a live Hephaestus whose lock has no version, as one of older code holds, reads live and is still ended by stop', async () => {
    const wedged = plantWedgedHephaestus(true, undefined, 'without-version');
    expect(HephaestusLock.newestOf(wedged.platformPorts, wedged.hephaestusDirectory).verdict).toBe('live-unreadable');

    const stopped = wedged.stopContext();
    expect(await stopWithInstantWaits(['stop'], stopped), stopped.errorText()).toBe(0);

    expect(wedged.stopStages).toEqual(['force']);
    expect(stopped.outputText()).toContain(`Ended Hephaestus at ${UNANSWERING_URL} by force`);
    expect(hephaestusStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
    expect(HephaestusLock.newestOf(wedged.platformPorts, wedged.hephaestusDirectory).verdict).toBe('none');
  });

  test('the registry entry of a board names no page and no progress file: it holds exactly these keys', async () => {
    const wedged = plantWedgedHephaestus(true);
    await registerWedgedHephaestus(wedged);
    const registryFilePath = join(wedged.homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER, MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME);
    const registry = JSON.parse(readFileSync(registryFilePath, 'utf8')) as Record<string, Record<string, Record<string, unknown>>>;
    const entries  = Object.values(registry[MONITOR_REGISTRY_FILES.ENTRIES_KEY] ?? {});
    expect(entries).toHaveLength(1);
    expect(Object.keys(entries[0] ?? {})).toEqual(['project', 'root', 'gitOrigin', 'program', 'registeredAt', 'lastChangedAt', 'lastCommand', 'hephaestus']);
  });

  test('the registry writes the presence key in each state, keeps it through a call without one, and a stop writes it stopped', async () => {
    const wedged = plantWedgedHephaestus(true);
    const registerPresence = (presence: Parameters<typeof registerWithTheMonitor>[0]['presence']) => registerWithTheMonitor({
      ...registeredBoardFactsOf(wedged.workspace),
      monitorFolder:        join(wedged.homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER),
      lockTaker:            LIVE_HOLDERS_LOCK_TAKER,
      temporaryDirectories: [],
      command:              'start',
      program:              '/example/bin/forge',
      now:                  SPEC_CLOCK,
      ...(presence === undefined ? {} : { presence }),
    });
    const at = '2026-09-18T20:11:03+00:00';
    const crash = {
      component: 'talos', suspected: false, errorName: 'TalosLost', errorMessage: 'Example message', crashLogPath: '/example/hephaestus/crash-logs/crash-1.json'
    } as const;
    const presences = [
      { state: 'handed-over', generation: 1, at },
      {
        state: 'crashed', generation: 1, at, crash
      },
      {
        state: 'serving', generation: 1, at, process: { processId: WEDGED_PROCESS_ID, startStamp: '2', bootIdentity: 'example-boot' }
      },
    ] as const;
    for (const presence of presences) {
      await registerPresence(presence);
      expect(registeredPresenceIn(wedged.homeDirectory)).toEqual(presence);
    }

    await registerPresence(undefined);
    expect(registeredPresenceIn(wedged.homeDirectory)).toEqual(presences.at(-1));

    const stopped = wedged.stopContext();
    expect(await stopWithInstantWaits(['stop'], stopped), stopped.errorText()).toBe(0);
    expect(registeredPresenceIn(wedged.homeDirectory)).toEqual({ state: 'stopped', generation: 1, at: expect.any(String) as unknown });
  });

  test('a forced end overtaken by a newer Hephaestus still says so and records the stop, and leaves that Hephaestus its registry entry and Hephaestus lock', async () => {
    const successorStarts = (hephaestusDirectory: string): void => {
      const successorRecord = {
        processId:            WEDGED_PROCESS_ID + 1,
        processStartStamp:    '3',
        bootIdentity:         'example-boot',
        port:                 2,
        url:                  SUCCESSOR_URL,
        tokenFile:            join(hephaestusDirectory, 'token'),
        codeVersion:          'code-example',
        installVersion:       1,
        talosProtocolVersion: 1,
      };
      createHephaestusLockWriter(HephaestusLock.filePathFor(hephaestusDirectory, 1 + 1)).createWhole(successorRecord);
      // A claim removes the generations below its own.
      rmSync(HephaestusLock.filePathFor(hephaestusDirectory, 1), { force: true });
    };
    const wedged = plantWedgedHephaestus(true, successorStarts);
    await registerWedgedHephaestus(wedged);

    const stopped = wedged.stopContext();
    expect(await runCommandLine(['stop', '--json'], stopped), stopped.errorText()).toBe(0);

    expect(JSON.parse(stopped.outputText())).toEqual({ answerVersion: ANSWER_VERSION, outcome: 'done', ending: 'forced' });
    expect(hephaestusStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
    expect(registeredHephaestusProcessesIn(wedged.homeDirectory)).toHaveLength(1);
    expect(HephaestusLock.generationsIn(wedged.hephaestusDirectory)).toEqual([2]);
  });

  test('the JSON answer of a forced end names it, and --now says the line children kept running', async () => {
    const wedged = plantWedgedHephaestus(true);

    const stopped = wedged.stopContext();
    expect(await stopWithInstantWaits(['stop', '--json', '--now'], stopped), stopped.errorText()).toBe(0);
    expect(JSON.parse(stopped.outputText())).toEqual({ answerVersion: ANSWER_VERSION, outcome: 'done', ending: 'forced' });

    const worded = plantWedgedHephaestus(true);
    const wordedContext = worded.stopContext();
    expect(await stopWithInstantWaits(['stop', '--now'], wordedContext), wordedContext.errorText()).toBe(0);
    expect(wordedContext.outputText()).toContain('Line children were not stopped');
  });

  test('where a stop can ask, a Hephaestus that died without its stop is repaired too, and never called forced', async () => {
    const wedged = plantWedgedHephaestus(false);

    const stopped = wedged.stopContext();
    expect(await stopWithInstantWaits(['stop'], stopped), stopped.errorText()).toBe(0);

    expect(wedged.stopStages).toEqual(['ask']);
    expect(stopped.outputText()).toContain('ended before it finished its stop');
    expect(stopped.outputText()).not.toContain('by force');
    expect(hephaestusStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
  });

  test('a close refused on a held tracker lock leaves a dead Hephaestus lock, and the next stop with the lock free finishes that close', async () => {
    const wedged = plantWedgedHephaestus(false);
    await registerWedgedHephaestus(wedged);

    const refused = wedged.stopContext();
    const { outcome } = await withLock(wedged.workspace, () => lockRetryWaitsDuring(() => runCommandLine(['stop'], refused)), refused.now, LIVE_HOLDERS_LOCK_TAKER);
    expect(outcome).toEqual({ settled: 'fulfilled', value: 2 });
    expect(HephaestusLock.newestOf(wedged.platformPorts, wedged.hephaestusDirectory).verdict).toBe('dead');
    expect(registeredHephaestusProcessesIn(wedged.homeDirectory)).toHaveLength(1);
    expect(hephaestusStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(0);

    const repaired = wedged.stopContext();
    expect(await runCommandLine(['stop', '--json'], repaired), repaired.errorText()).toBe(0);

    expect(JSON.parse(repaired.outputText())).toEqual({ answerVersion: ANSWER_VERSION, outcome: 'done', ending: 'unfinished' });
    expect(hephaestusStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
    expect(registeredHephaestusProcessesIn(wedged.homeDirectory)).toEqual([]);
    expect(HephaestusLock.newestOf(wedged.platformPorts, wedged.hephaestusDirectory).verdict).toBe('none');
  });

  test('a newest Hephaestus lock found dead is closed in words, never called nothing to stop', async () => {
    const wedged = plantWedgedHephaestus(false);
    const goneAtOnce: PlatformPorts = { ...wedged.platformPorts, processSupervision: { ...wedged.platformPorts.processSupervision, identityOf: () => null } };
    const stopped = createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory: wedged.homeDirectory, temporaryDirectories: [], platformPorts: goneAtOnce
    });

    expect(await runCommandLine(['stop'], stopped), stopped.errorText()).toBe(0);

    expect(stopped.outputText()).toContain(`Hephaestus at ${UNANSWERING_URL} had already ended before it finished its stop`);
    expect(stopped.outputText()).not.toContain('nothing to stop');
    expect(HephaestusLock.newestOf(goneAtOnce, wedged.hephaestusDirectory).verdict).toBe('none');
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the bounded stop waits', () => {
  const SHORT_STOP_WAIT_MILLISECONDS = 10;
  const ONE_SECOND_MILLISECONDS      = 1000;

  function stopRequestIn(platformPorts: PlatformPorts) {
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory: join(repositoryDirectory, 'stop-home'), temporaryDirectories: [], platformPorts
    });
    return { commandArguments: createArgumentParser([]), context, workspace: requireWorkspace(repositoryDirectory) };
  }

  function plantOwnHephaestusLock(platformPorts: PlatformPorts): { hephaestusDirectory: string; generation: number } {
    const { hephaestusDirectory } = hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
    const ownIdentity = processTable.callerProcess();
    const acquisition = HephaestusLock.acquire(platformPorts, hephaestusDirectory, {
      processId:            ownIdentity.processId,
      processStartStamp:    ownIdentity.startStamp,
      bootIdentity:         ownIdentity.bootIdentity,
      port:                 1,
      url:                  UNANSWERING_URL,
      tokenFile:            join(hephaestusDirectory, 'token'),
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    });
    if (acquisition.verdict !== 'acquired') throw new Error('The example Hephaestus lock was not acquired.');
    return { hephaestusDirectory, generation: acquisition.generation };
  }

  test('a drive pass that never becomes idle no longer holds back the stop record and the Hephaestus lock release', async () => {
    const platformPorts = processTable.ports;
    const { hephaestusDirectory, generation } = plantOwnHephaestusLock(platformPorts);
    const request = stopRequestIn(platformPorts);
    const logLines: string[] = [];
    const laterWaitsStarted: string[] = [];
    const startedAt = performance.now();

    await waitOutTheStopWaits([
      { name: 'the drive pass', run: () => new Promise<void>(() => undefined) },
      { name: 'the server stop', run: async () => { laterWaitsStarted.push('the server stop'); } },
    ], (line) => logLines.push(line), SHORT_STOP_WAIT_MILLISECONDS);
    await closeTheStoppedHephaestus(request, hephaestusFilesIn(request.workspace.trackerDirectory), generation);

    expect(performance.now() - startedAt).toBeLessThan(SHORT_STOP_WAIT_MILLISECONDS + ONE_SECOND_MILLISECONDS);
    expect(logLines).toEqual([`The stop went on without the drive pass, which did not end within ${SHORT_STOP_WAIT_MILLISECONDS} ms.`]);
    expect(laterWaitsStarted).toEqual(['the server stop']);
    expect(storedLogKindsOf(repositoryDirectory)).toContain('hephaestus-stopped');
    expect(HephaestusLock.newestOf(platformPorts, hephaestusDirectory).verdict).toBe('none');
  });

  function writeOwnPresence(generation: number): void {
    Presence.writeStartedPresence(hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory), {
      generation,
      process:             processTable.callerProcess(),
      codeVersion:         'code-example',
      startOrigin:         'user',
      startedAt:           '2026-09-18T20:00:00+00:00',
      startClassification: null,
    });
  }

  function storedEnding(): unknown {
    const presence = Presence.readPresence(hephaestusFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory));
    return presence.verdict === 'read' ? presence.record.ending : presence.verdict;
  }

  function registeredPresenceUnder(request: ReturnType<typeof stopRequestIn>): unknown {
    const { context } = request;
    const registryFilePath = join(context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory), MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME);
    const registry = JSON.parse(readFileSync(registryFilePath, 'utf8')) as Record<string, Record<string, { presence?: unknown }>>;
    return Object.values(registry[MONITOR_REGISTRY_FILES.ENTRIES_KEY] ?? {})[0]?.presence;
  }

  test('a stop writes the presence ending stopped and the registry presence stopped, then releases the Hephaestus lock', async () => {
    const platformPorts = processTable.ports;
    const { hephaestusDirectory, generation } = plantOwnHephaestusLock(platformPorts);
    writeOwnPresence(generation);
    const request = stopRequestIn(platformPorts);

    await closeTheStoppedHephaestus(request, hephaestusFilesIn(request.workspace.trackerDirectory), generation);

    expect(storedEnding()).toEqual({ kind: 'stopped', at: expect.any(String) as unknown });
    expect(registeredPresenceUnder(request)).toEqual({ state: 'stopped', generation, at: expect.any(String) as unknown });
    expect(HephaestusLock.newestOf(platformPorts, hephaestusDirectory).verdict).toBe('none');
  });

  test('a release writes the presence ending handed-over before the crash path lets go, then the registry presence handed-over', async () => {
    const platformPorts = processTable.ports;
    const { generation } = plantOwnHephaestusLock(platformPorts);
    writeOwnPresence(generation);
    const request = stopRequestIn(platformPorts);
    const endingsWhenTheCrashPathLetGo: unknown[] = [];

    await recordTheHandover(request, hephaestusFilesIn(request.workspace.trackerDirectory), generation, () => {
      endingsWhenTheCrashPathLetGo.push(storedEnding());
    });

    const handedOver = { kind: 'handed-over', at: expect.any(String) as unknown };
    expect(endingsWhenTheCrashPathLetGo).toEqual([handedOver]);
    expect(storedEnding()).toEqual(handedOver);
    expect(registeredPresenceUnder(request)).toEqual({ state: 'handed-over', generation, at: expect.any(String) as unknown });
    expect(storedLogKindsOf(repositoryDirectory)).toContain('hephaestus-stopped');
  });

  test('waits that all end in time run in order and log nothing of their own', async () => {
    const ended: string[] = [];
    const logLines: string[] = [];

    await waitOutTheStopWaits([
      { name: 'the drive pass', run: async () => { await Promise.resolve(); ended.push('the drive pass'); } },
      { name: 'the server stop', run: async () => { ended.push('the server stop'); } },
    ], (line) => logLines.push(line), HEPHAESTUS_STOP_WAIT_MILLISECONDS);

    expect(ended).toEqual(['the drive pass', 'the server stop']);
    expect(logLines).toEqual([]);
  });
});
