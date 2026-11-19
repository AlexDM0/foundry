/**
 * The `oversee` verbs that answer in this process, so no Overseer starts: a confinement preflight refuses before any Baton, the Bridge header's
 * board state reads as `status` and `oversee status` do, the board state reads the stored pipeline, so it forecasts each open ticket, `oversee
 * pause|resume` write the drain flag with no Overseer up, and `oversee stop` finds nothing to do or, over a fake process table, never reports a
 * clean stop after an end that skipped the Overseer's own stop, and repairs only once the process is gone, also when an earlier close was refused
 * and left a dead Baton. The stop waits of a stopping Overseer share one bound, so a drive pass that never ends cannot hold back the stop record
 * past what Windows gives. `oversee restart` over an Overseer found dead keeps its port, also one dead before the hand-over, which it closes, over
 * the recorded process table. An Overseer that runs is held by `cli/overseer/OverseerCommand.integration.spec.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';


import { createProgressPageStubWriter, progressPageStubTextOf }                 from '../../src/adapters/progress-page/ProgressPageStubWriter.ts';
import type { PlatformPorts }                                                   from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessStopStage }                                                from '../../src/lib/process-identity/ProcessSupervision.ts';
import { Baton }                                                                from '../../src/services/overseer/Baton.ts';
import { overseerFilesIn }                                                      from '../../src/services/overseer/OverseerFiles.ts';
import { registerWithTheMonitor }                                               from '../../src/services/tracker/MonitorRegistration.ts';
import { NO_LOCK_HOLDER_READS_AS_GONE, withLock }                               from '../../src/services/tracker/TrackerLock.ts';
import { requireWorkspace }                                                     from '../../src/services/tracker/Workspace.ts';
import { MONITOR_REGISTRY_FILES }                                               from '../../src/services/tracker/constants/MonitorRegistryFiles.ts';
import { OVERSEER_STOP_INTERVAL_MILLISECONDS, OVERSEER_STOP_WAIT_MILLISECONDS } from '../../src/shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                                        from '../../src/shared/constants/ProductNames.ts';
import { FAKE_MISSING_TOOLS_REASON, fakeGateConfinement }                       from '../../src/testing/FakeGateConfinement.ts';
import { instantSleepsOf }                                                      from '../../src/testing/InstantSleeps.ts';
import { lockRetryWaitsDuring }                                                 from '../../src/testing/LockRetryWaits.ts';
import { nativePlatformPorts }                                                  from '../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                                                       from '../../src/testing/RecordedGit.ts';
import { useRecordedProcessTable }                                              from '../../src/testing/RecordedProcessTable.ts';
import { removeScratchDirectory }                                               from '../../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                                               from '../../src/testing/TalosChildReadings.ts';
import { describeWhenRecorded }                                                 from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                                                       from '../Main.ts';
import { createArgumentParser }                                                 from '../arguments/ArgumentParser.ts';
import { INSTALL_VERSION }                                                      from '../constants/InstallVersion.ts';
import { createCapturedCommandContext }                                         from '../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                               from '../testing/InitializedScratchRepository.ts';
import { fileReadyTicketThrough }                                               from '../testing/ReadyTicketFiling.ts';
import { storedProgressOf }                                                     from '../testing/StoredProgress.ts';
import { closeTheStoppedOverseer, waitOutTheStopWaits }                         from './OverseerForeground.ts';
import { readBoardState }                                                       from './routes/BoardStateReader.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const WEDGED_PROCESS_ID          = 5_000_000;
const UNANSWERING_URL            = 'http://127.0.0.1:1/';
const SUCCESSOR_URL              = 'http://127.0.0.1:2/';
const READS_WHILE_THE_STOP_LANDS = 2;

const recordedGit = useRecordedGit();
const processTable = useRecordedProcessTable(nativePlatformPorts());
const overseerStoppedRecordsIn = (logKinds: readonly string[]): number => logKinds.filter((kind) => kind === 'overseer-stopped').length;

function storedLogKindsOf(repository: string): string[] {
  const logFilePath = join(repository, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl');
  if (!existsSync(logFilePath)) return [];
  return readFileSync(logFilePath, 'utf8').split('\n').filter((line) => line !== '').map((line) => (JSON.parse(line) as { kind: string }).kind);
}

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('overseer', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  recordedGit.enterFlowStage('tracker ready', repositoryDirectory);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the confinement preflight', () => {
  const STARTS = [[['oversee', '--port', '0']], [['oversee', '--detach', '--port', '0']]];

  test.each(STARTS)('%j on an adapter reporting missing tools refuses once at exit 1, naming them, with no Baton', async (commandLine) => {
    const context = createCapturedCommandContext({
      currentDirectory: repositoryDirectory,
      platformPorts:    { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement('unavailable') },
    });

    expect(await runCommandLine(commandLine, context)).toBe(1);

    expect(context.errorText().trim()).toBe(`Gates and install lines cannot run confined here, so the Overseer did not start: ${FAKE_MISSING_TOOLS_REASON}.`);
    expect(context.errorText()).toContain('bubblewrap, socat and ripgrep');
    expect(storedProgressOf(repositoryDirectory).jobs ?? []).toEqual([]);
    expect(Baton.newestBatonOf(nativePlatformPorts(), overseerFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory).overseerDirectory).verdict).not.toBe('live');
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the board state the Bridge header reads', () => {
  test.each(['confined', 'unavailable', 'unconfined-by-design'] as const)('states %s, the port\'s word, as status does', async (verdict) => {
    const platformPorts = { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement(verdict) };
    const statusContext = createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts });
    expect(await runCommandLine(['status', '--json'], statusContext)).toBe(0);

    const { state } = readBoardState({
      context:       createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts }),
      workspace:     requireWorkspace(repositoryDirectory),
      boardChildren: talosChildReadingsWith(nativePlatformPorts(), requireWorkspace(repositoryDirectory).trackerDirectory),
      notices:       () => [],
      overseer:      () => ({
        state: 'serving', url: null, generation: null, codeVersion: 'code-example', installVersion: 1, batonPassWarning: null
      }),
    });

    expect(state['confinement']).toBe(verdict);
    expect((JSON.parse(statusContext.outputText()) as { confinement: string }).confinement).toBe(verdict);
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'the board state the Bridge\'s ticket form reads', () => {
  test('reads the stored pipeline, so a ready ticket has its forecast: a builder takes it when a launch slot frees', async () => {
    const run = async (commandLine: readonly string[]): Promise<string> => {
      const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
      expect(await runCommandLine(commandLine, context), context.errorText()).toBe(0);
      return context.outputText();
    };
    await run(['gate', 'none']);
    await fileReadyTicketThrough(run, (output) => output, ['ticket', 'add', '--type', 'ticket', 'Example account pages']);

    const { state } = readBoardState({
      context:       createCapturedCommandContext({ currentDirectory: repositoryDirectory }),
      workspace:     requireWorkspace(repositoryDirectory),
      boardChildren: talosChildReadingsWith(nativePlatformPorts(), requireWorkspace(repositoryDirectory).trackerDirectory),
      notices:       () => [],
      overseer:      () => ({
        state: 'serving', url: null, generation: null, codeVersion: 'code-example', installVersion: 1, batonPassWarning: null
      }),
    });

    expect(state.ticketForecasts.map((forecast) => [forecast.ticketId, forecast.steps[0], forecast.currentStepIndex])).toEqual([
      ['001', { kind: 'build', attempt: 1, jobId: null }, null],
    ]);
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'run stop', () => {
  test('stop with no Overseer live has nothing to do', async () => {
    const stopped = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['oversee', 'stop'], stopped), stopped.errorText()).toBe(0);
    expect(stopped.outputText().trim()).toBe('No Overseer is live; nothing to stop.');
  });

  /** A live Overseer whose API never answers, played by one process-table entry that a stop ends only after further reads of it. */
  function plantWedgedOverseer(fallbackStopIsForced: boolean, whenStopLands: (overseerDirectory: string, htmlFilePath: string) => void = () => undefined) {
    const workspace = requireWorkspace(repositoryDirectory);
    const { overseerDirectory } = overseerFilesIn(workspace.trackerDirectory);
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
          whenStopLands(overseerDirectory, workspace.htmlFilePath);
          return { verdict: 'signalled' };
        },
      },
    };
    const acquisition = Baton.acquire(platformPorts, overseerDirectory, {
      processId:            identity.processId,
      processStartStamp:    identity.startStamp,
      bootIdentity:         identity.bootIdentity,
      port:                 1,
      url:                  UNANSWERING_URL,
      tokenFile:            join(overseerDirectory, 'token'),
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    });
    expect(acquisition.verdict).toBe('acquired');
    createProgressPageStubWriter(workspace.htmlFilePath).write(UNANSWERING_URL);
    const stopContext = () => createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory, temporaryDirectories: [], platformPorts
    });
    return {
      workspace, overseerDirectory, homeDirectory, stopStages, logKindsWhileLive, platformPorts, stopContext
    };
  }

  async function registerWedgedOverseer({ workspace, homeDirectory }: ReturnType<typeof plantWedgedOverseer>): Promise<void> {
    await registerWithTheMonitor({
      workspace,
      monitorFolder:        join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER),
      temporaryDirectories: [],
      command:              'oversee',
      program:              '/example/bin/forge',
      now:                  SPEC_CLOCK,
      overseer:             {
        url: UNANSWERING_URL, processId: WEDGED_PROCESS_ID, startedAt: '2026-09-18T20:11:03+00:00', tokenPath: '/example/monitor/private/example/token'
      },
    });
  }

  function registeredOverseersIn(homeDirectory: string): unknown[] {
    const registryFilePath = join(homeDirectory, PRODUCT_NAMES.MONITOR_FOLDER, MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME);
    const registry = JSON.parse(readFileSync(registryFilePath, 'utf8')) as Record<string, Record<string, { overseer?: unknown }>>;
    return Object.values(registry[MONITOR_REGISTRY_FILES.ENTRIES_KEY] ?? {}).flatMap((entry) => (entry.overseer === undefined ? [] : [entry.overseer]));
  }

  /** The stop waits for the wedged process to go; its waits end at once, and the case proves the wait ran. */
  async function stopWithInstantWaits(commandLine: string[], context: ReturnType<typeof createCapturedCommandContext>): Promise<number> {
    const { value: exitCode, instantSleeps } = await instantSleepsOf(OVERSEER_STOP_INTERVAL_MILLISECONDS, () => runCommandLine(commandLine, context));
    expect(instantSleeps).toBeGreaterThan(0);
    return exitCode;
  }

  test('a forced end says so, and the CLI does what the Overseer could not, with the process gone first; a second stop finds nothing to do', async () => {
    const wedged = plantWedgedOverseer(true);
    await registerWedgedOverseer(wedged);
    expect(registeredOverseersIn(wedged.homeDirectory)).toHaveLength(1);

    const stopped = wedged.stopContext();
    expect(await stopWithInstantWaits(['oversee', 'stop'], stopped), stopped.errorText()).toBe(0);

    expect(wedged.stopStages).toEqual(['force']);
    expect(stopped.outputText()).toContain(`Ended the Overseer at ${UNANSWERING_URL} by force`);
    expect(stopped.outputText()).not.toContain('Stopped the Overseer');
    expect(overseerStoppedRecordsIn(wedged.logKindsWhileLive.at(-1) ?? [])).toBe(0);
    expect(overseerStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
    expect(registeredOverseersIn(wedged.homeDirectory)).toEqual([]);
    expect(readFileSync(wedged.workspace.htmlFilePath, 'utf8')).toBe(progressPageStubTextOf(null));
    expect(Baton.newestBatonOf(wedged.platformPorts, wedged.overseerDirectory).verdict).toBe('none');

    const again = wedged.stopContext();
    expect(await runCommandLine(['oversee', 'stop'], again), again.errorText()).toBe(0);
    expect(again.outputText().trim()).toBe('No Overseer is live; nothing to stop.');
    expect(overseerStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
  });

  test('a forced end overtaken by a newer Overseer still says so and records the stop, and leaves that Overseer its registry entry, page and Baton', async () => {
    const successorStarts = (overseerDirectory: string, htmlFilePath: string): void => {
      const successorRecord = {
        processId:            WEDGED_PROCESS_ID + 1,
        processStartStamp:    '3',
        bootIdentity:         'example-boot',
        port:                 2,
        url:                  SUCCESSOR_URL,
        tokenFile:            join(overseerDirectory, 'token'),
        codeVersion:          'code-example',
        installVersion:       1,
        talosProtocolVersion: 1,
      };
      expect(Baton.acquireAbove(overseerDirectory, successorRecord, 1).verdict).toBe('acquired');
      createProgressPageStubWriter(htmlFilePath).write(SUCCESSOR_URL);
    };
    const wedged = plantWedgedOverseer(true, successorStarts);
    await registerWedgedOverseer(wedged);

    const stopped = wedged.stopContext();
    expect(await runCommandLine(['oversee', 'stop', '--json'], stopped), stopped.errorText()).toBe(0);

    expect(JSON.parse(stopped.outputText())).toEqual({ outcome: 'done', ending: 'forced' });
    expect(overseerStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
    expect(registeredOverseersIn(wedged.homeDirectory)).toHaveLength(1);
    expect(readFileSync(wedged.workspace.htmlFilePath, 'utf8')).toBe(progressPageStubTextOf(SUCCESSOR_URL));
    expect(Baton.batonGenerationsIn(wedged.overseerDirectory)).toEqual([2]);
  });

  test('the JSON answer of a forced end names it, and --now says the Watchers kept running', async () => {
    const wedged = plantWedgedOverseer(true);

    const stopped = wedged.stopContext();
    expect(await stopWithInstantWaits(['oversee', 'stop', '--json', '--now'], stopped), stopped.errorText()).toBe(0);
    expect(JSON.parse(stopped.outputText())).toEqual({ outcome: 'done', ending: 'forced' });

    const worded = plantWedgedOverseer(true);
    const wordedContext = worded.stopContext();
    expect(await stopWithInstantWaits(['oversee', 'stop', '--now'], wordedContext), wordedContext.errorText()).toBe(0);
    expect(wordedContext.outputText()).toContain('Process Watchers were not stopped');
  });

  test('where a stop can ask, an Overseer that died without its stop is repaired too, and never called forced', async () => {
    const wedged = plantWedgedOverseer(false);

    const stopped = wedged.stopContext();
    expect(await stopWithInstantWaits(['oversee', 'stop'], stopped), stopped.errorText()).toBe(0);

    expect(wedged.stopStages).toEqual(['ask']);
    expect(stopped.outputText()).toContain('ended before it finished its stop');
    expect(stopped.outputText()).not.toContain('by force');
    expect(overseerStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
  });

  test('a close refused on a held tracker lock leaves a dead Baton, and the next stop with the lock free finishes that close', async () => {
    const wedged = plantWedgedOverseer(false);
    await registerWedgedOverseer(wedged);

    const refused = wedged.stopContext();
    const { outcome } = await withLock(wedged.workspace, () => lockRetryWaitsDuring(() => runCommandLine(['oversee', 'stop'], refused)), refused.now, NO_LOCK_HOLDER_READS_AS_GONE);
    expect(outcome).toEqual({ settled: 'fulfilled', value: 2 });
    expect(Baton.newestBatonOf(wedged.platformPorts, wedged.overseerDirectory).verdict).toBe('dead');
    expect(registeredOverseersIn(wedged.homeDirectory)).toHaveLength(1);
    expect(readFileSync(wedged.workspace.htmlFilePath, 'utf8')).toBe(progressPageStubTextOf(UNANSWERING_URL));
    expect(overseerStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(0);

    const repaired = wedged.stopContext();
    expect(await runCommandLine(['oversee', 'stop', '--json'], repaired), repaired.errorText()).toBe(0);

    expect(JSON.parse(repaired.outputText())).toEqual({ outcome: 'done', ending: 'unfinished' });
    expect(overseerStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
    expect(registeredOverseersIn(wedged.homeDirectory)).toEqual([]);
    expect(readFileSync(wedged.workspace.htmlFilePath, 'utf8')).toBe(progressPageStubTextOf(null));
    expect(Baton.newestBatonOf(wedged.platformPorts, wedged.overseerDirectory).verdict).toBe('none');
  });

  test('a newest Baton found dead is closed in words, never called nothing to stop', async () => {
    const wedged = plantWedgedOverseer(false);
    const goneAtOnce: PlatformPorts = { ...wedged.platformPorts, processSupervision: { ...wedged.platformPorts.processSupervision, identityOf: () => null } };
    const stopped = createCapturedCommandContext({
      currentDirectory: repositoryDirectory, homeDirectory: wedged.homeDirectory, temporaryDirectories: [], platformPorts: goneAtOnce
    });

    expect(await runCommandLine(['oversee', 'stop'], stopped), stopped.errorText()).toBe(0);

    expect(stopped.outputText()).toContain(`The Overseer at ${UNANSWERING_URL} had already ended before it finished its stop`);
    expect(stopped.outputText()).not.toContain('nothing to stop');
    expect(Baton.newestBatonOf(goneAtOnce, wedged.overseerDirectory).verdict).toBe('none');
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'run restart', () => {
  /** The Overseer dies between the Baton pass ask and the stop, so the stop finds its Baton dead; the successor only writes its arguments down. */
  test('restart over an Overseer found dead starts the successor with the port of its Baton record', async () => {
    const workspace = requireWorkspace(repositoryDirectory);
    const { overseerDirectory } = overseerFilesIn(workspace.trackerDirectory);
    const deadOverseer = processTable.bornProcess();
    const tablePorts = processTable.ports;
    let identityReads = 0;
    const platformPorts: PlatformPorts = {
      ...tablePorts,
      processSupervision: {
        ...tablePorts.processSupervision,
        identityOf: (processId) => {
          const identity = tablePorts.processSupervision.identityOf(processId);
          identityReads += 1;
          if (identityReads === 1) processTable.endProcess(deadOverseer);
          return identity;
        },
        spawnOptionsFor: nativePlatformPorts().processSupervision.spawnOptionsFor,
      },
    };
    const acquisition = Baton.acquire(platformPorts, overseerDirectory, {
      processId:            deadOverseer.processId,
      processStartStamp:    deadOverseer.startStamp,
      bootIdentity:         deadOverseer.bootIdentity,
      port:                 1,
      url:                  UNANSWERING_URL,
      tokenFile:            join(overseerDirectory, 'token'),
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    });
    expect(acquisition.verdict).toBe('acquired');
    const successorArgumentsFile = join(repositoryDirectory, 'successor-arguments.json');
    const writeArguments = `require('node:fs').writeFileSync(${JSON.stringify(successorArgumentsFile)}, JSON.stringify(process.argv.slice(1)))`;
    const restarted = {
      ...createCapturedCommandContext({
        currentDirectory: repositoryDirectory, homeDirectory: join(repositoryDirectory, 'restart-home'), temporaryDirectories: [], platformPorts
      }),
      programCommand: [process.execPath, '-e', writeArguments],
    };

    // The successor writes its arguments and ends, so the start is refused as an Overseer that did not start.
    expect(await runCommandLine(['oversee', 'restart', '--json'], restarted), restarted.errorText()).toBe(1);

    expect((JSON.parse(readFileSync(successorArgumentsFile, 'utf8')) as string[]).join(' ')).toBe('oversee --port 1');
    expect(overseerStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
  });

  /** The Overseer is dead before the Baton pass ask, so the hand-over finds no live Baton; the restart still reads the dead one. */
  test('restart over a Baton already dead at the hand-over keeps its port and closes it', async () => {
    const workspace = requireWorkspace(repositoryDirectory);
    const { overseerDirectory } = overseerFilesIn(workspace.trackerDirectory);
    const deadOverseer = processTable.bornProcess();
    const platformPorts: PlatformPorts = {
      ...processTable.ports,
      processSupervision: { ...processTable.ports.processSupervision, spawnOptionsFor: nativePlatformPorts().processSupervision.spawnOptionsFor },
    };
    const acquisition = Baton.acquire(platformPorts, overseerDirectory, {
      processId:            deadOverseer.processId,
      processStartStamp:    deadOverseer.startStamp,
      bootIdentity:         deadOverseer.bootIdentity,
      port:                 1,
      url:                  UNANSWERING_URL,
      tokenFile:            join(overseerDirectory, 'token'),
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    });
    expect(acquisition.verdict).toBe('acquired');
    processTable.endProcess(deadOverseer);
    const successorArgumentsFile = join(repositoryDirectory, 'successor-arguments.json');
    const writeArguments = `require('node:fs').writeFileSync(${JSON.stringify(successorArgumentsFile)}, JSON.stringify(process.argv.slice(1)))`;
    const restarted = {
      ...createCapturedCommandContext({
        currentDirectory: repositoryDirectory, homeDirectory: join(repositoryDirectory, 'restart-home'), temporaryDirectories: [], platformPorts
      }),
      programCommand: [process.execPath, '-e', writeArguments],
    };

    // The successor writes its arguments and ends, so the start is refused as an Overseer that did not start.
    expect(await runCommandLine(['oversee', 'restart', '--json'], restarted), restarted.errorText()).toBe(1);

    expect((JSON.parse(readFileSync(successorArgumentsFile, 'utf8')) as string[]).join(' ')).toBe('oversee --port 1');
    expect(overseerStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
    expect(Baton.newestBatonOf(platformPorts, overseerDirectory).verdict).toBe('none');
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

  function plantOwnBaton(platformPorts: PlatformPorts): { overseerDirectory: string; generation: number } {
    const { overseerDirectory } = overseerFilesIn(requireWorkspace(repositoryDirectory).trackerDirectory);
    const ownIdentity = processTable.callerProcess();
    const acquisition = Baton.acquire(platformPorts, overseerDirectory, {
      processId:            ownIdentity.processId,
      processStartStamp:    ownIdentity.startStamp,
      bootIdentity:         ownIdentity.bootIdentity,
      port:                 1,
      url:                  UNANSWERING_URL,
      tokenFile:            join(overseerDirectory, 'token'),
      codeVersion:          'code-example',
      installVersion:       1,
      talosProtocolVersion: 1,
    });
    if (acquisition.verdict !== 'acquired') throw new Error('The example Baton was not acquired.');
    return { overseerDirectory, generation: acquisition.generation };
  }

  test('a drive pass that never becomes idle no longer holds back the stop record and the Baton release', async () => {
    const platformPorts = processTable.ports;
    const { overseerDirectory, generation } = plantOwnBaton(platformPorts);
    const request = stopRequestIn(platformPorts);
    const logLines: string[] = [];
    const laterWaitsStarted: string[] = [];
    const startedAt = performance.now();

    await waitOutTheStopWaits([
      { name: 'the drive pass', run: () => new Promise<void>(() => undefined) },
      { name: 'the server stop', run: async () => { laterWaitsStarted.push('the server stop'); } },
    ], (line) => logLines.push(line), SHORT_STOP_WAIT_MILLISECONDS);
    await closeTheStoppedOverseer(request, overseerFilesIn(request.workspace.trackerDirectory), generation);

    expect(performance.now() - startedAt).toBeLessThan(SHORT_STOP_WAIT_MILLISECONDS + ONE_SECOND_MILLISECONDS);
    expect(logLines).toEqual([`The stop went on without the drive pass, which did not end within ${SHORT_STOP_WAIT_MILLISECONDS} ms.`]);
    expect(laterWaitsStarted).toEqual(['the server stop']);
    expect(storedLogKindsOf(repositoryDirectory)).toContain('overseer-stopped');
    expect(Baton.newestBatonOf(platformPorts, overseerDirectory).verdict).toBe('none');
  });

  test('waits that all end in time run in order and log nothing of their own', async () => {
    const ended: string[] = [];
    const logLines: string[] = [];

    await waitOutTheStopWaits([
      { name: 'the drive pass', run: async () => { await Promise.resolve(); ended.push('the drive pass'); } },
      { name: 'the server stop', run: async () => { ended.push('the server stop'); } },
    ], (line) => logLines.push(line), OVERSEER_STOP_WAIT_MILLISECONDS);

    expect(ended).toEqual(['the drive pass', 'the server stop']);
    expect(logLines).toEqual([]);
  });
});

describeWhenRecorded(['git-recording', 'process-table-recording'], 'run pause and resume', () => {
  test('write the stored drain flag through the write pipeline with no Overseer up', async () => {
    const paused = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['oversee', 'resume', '--json'], paused), paused.errorText()).toBe(0);
    expect(JSON.parse(paused.outputText())).toEqual({ overseerState: 'running', previousState: 'paused' });
    const resumed = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['oversee', 'pause', '--json'], resumed), resumed.errorText()).toBe(0);
    expect(JSON.parse(resumed.outputText())).toEqual({ overseerState: 'paused', previousState: 'running' });
    const progress = JSON.parse(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'), 'utf8')) as Record<string, unknown>;
    expect(progress['overseerState']).toBe('paused');
  });

  test('the board state the Bridge header reads agrees with oversee status after a resume and after a pause', async () => {
    // The header states the confinement too, and the real port's probe starts a process.
    const platformPorts = { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement('confined') };
    const pausedFlagsAfter = async (commandLine: readonly string[]): Promise<{ header: boolean; runStatus: unknown }> => {
      const moved = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
      expect(await runCommandLine([...commandLine], moved), moved.errorText()).toBe(0);
      const statusContext = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
      expect(await runCommandLine(['oversee', 'status', '--json'], statusContext), statusContext.errorText()).toBe(0);
      const boardState = readBoardState({
        context:       createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts }),
        workspace:     requireWorkspace(repositoryDirectory),
        boardChildren: talosChildReadingsWith(nativePlatformPorts(), requireWorkspace(repositoryDirectory).trackerDirectory),
        notices:       () => [],
        overseer:      () => ({
          state: 'serving', url: null, generation: null, codeVersion: 'example', installVersion: INSTALL_VERSION, batonPassWarning: null
        }),
      }).state;
      return { header: boardState.overseer.paused, runStatus: (JSON.parse(statusContext.outputText()) as Record<string, unknown>)['paused'] };
    };
    expect(await pausedFlagsAfter(['oversee', 'resume'])).toEqual({ header: false, runStatus: false });
    expect(await pausedFlagsAfter(['oversee', 'pause'])).toEqual({ header: true, runStatus: true });
  });
});
