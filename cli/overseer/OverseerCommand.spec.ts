/**
 * The `oversee` verbs that answer in this process, so no Overseer starts: a confinement preflight refuses before any Baton, the Bridge header's
 * board state reads as `status` and `oversee status` do, `oversee pause|resume` write the drain flag with no Overseer up, and `oversee stop` finds
 * nothing to do or, over a fake process table, never reports a clean stop after an end that skipped the Overseer's own stop, and repairs only once
 * the process is gone. An Overseer that runs is held by `cli/overseer/OverseerCommand.integration.spec.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createProgressPageStubWriter, progressPageStubTextOf } from '../../src/adapters/progress-page/ProgressPageStubWriter.ts';
import type { PlatformPorts }                                   from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessStopStage }                                from '../../src/lib/process-identity/ProcessSupervision.ts';
import { Baton }                                                from '../../src/services/overseer/Baton.ts';
import { overseerFilesIn }                                      from '../../src/services/overseer/OverseerFiles.ts';
import { registerWithTheMonitor }                               from '../../src/services/tracker/MonitorRegistration.ts';
import { requireWorkspace }                                     from '../../src/services/tracker/Workspace.ts';
import { MONITOR_REGISTRY_FILES }                               from '../../src/services/tracker/constants/MonitorRegistryFiles.ts';
import { PRODUCT_NAMES }                                        from '../../src/shared/constants/ProductNames.ts';
import { FAKE_MISSING_TOOLS_REASON, fakeGateConfinement }       from '../../src/testing/FakeGateConfinement.ts';
import { useFakeGit }                                           from '../../src/testing/FakeGit.ts';
import { nativePlatformPorts }                                  from '../../src/testing/NativePlatformPorts.ts';
import { removeScratchDirectory }                               from '../../src/testing/ScratchWorkspace.ts';
import { runCommandLine }                                       from '../Main.ts';
import { INSTALL_VERSION }                                      from '../constants/InstallVersion.ts';
import { createCapturedCommandContext }                         from '../testing/CapturedCommandContext.ts';
import { createInitializedFakeGitRepository }                   from '../testing/InitializedScratchRepository.ts';
import { storedProgressOf }                                     from '../testing/StoredProgress.ts';
import { readBoardState }                                       from './routes/BoardStateReader.ts';

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const WEDGED_PROCESS_ID          = 5_000_000;
const UNANSWERING_URL            = 'http://127.0.0.1:1/';
const READS_WHILE_THE_STOP_LANDS = 2;

const fakeGit = useFakeGit();

function storedLogKindsOf(repository: string): string[] {
  const logFilePath = join(repository, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl');
  if (!existsSync(logFilePath)) return [];
  return readFileSync(logFilePath, 'utf8').split('\n').filter((line) => line !== '').map((line) => (JSON.parse(line) as { kind: string }).kind);
}

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedFakeGitRepository('overseer', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, fakeGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describe('the confinement preflight', () => {
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

describe('the board state the Bridge header reads', () => {
  test.each(['confined', 'unavailable', 'unconfined-by-design'] as const)('states %s, the port\'s word, as status does', async (verdict) => {
    const platformPorts = { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement(verdict) };
    const statusContext = createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts });
    expect(await runCommandLine(['status', '--json'], statusContext)).toBe(0);

    const { state } = readBoardState({
      context:   createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts }),
      workspace: requireWorkspace(repositoryDirectory),
      notices:   () => [],
      overseer:  () => ({
        state: 'serving', url: null, generation: null, codeVersion: 'code-example', installVersion: 1, batonPassWarning: null
      }),
    });

    expect(state['confinement']).toBe(verdict);
    expect((JSON.parse(statusContext.outputText()) as { confinement: string }).confinement).toBe(verdict);
  });
});

describe('run stop', () => {
  test('stop with no Overseer live has nothing to do', async () => {
    const stopped = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    expect(await runCommandLine(['oversee', 'stop'], stopped), stopped.errorText()).toBe(0);
    expect(stopped.outputText().trim()).toBe('No Overseer is live; nothing to stop.');
  });

  /** A live Overseer whose API never answers, played by one process-table entry that a stop ends only after further reads of it. */
  function plantWedgedOverseer(fallbackStopIsForced: boolean) {
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
          return { verdict: 'signalled' };
        },
      },
    };
    const acquisition = Baton.acquire(platformPorts, overseerDirectory, {
      processId:              identity.processId,
      processStartStamp:      identity.startStamp,
      bootIdentity:           identity.bootIdentity,
      port:                   1,
      url:                    UNANSWERING_URL,
      tokenFile:              join(overseerDirectory, 'token'),
      codeVersion:            'code-example',
      installVersion:         1,
      watcherProtocolVersion: 1,
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
      homeDirectory,
      temporaryDirectories: [],
      command:              'oversee',
      now:                  SPEC_CLOCK,
      overseer:             { url: UNANSWERING_URL, processId: WEDGED_PROCESS_ID, startedAt: '2026-09-18T20:11:03+00:00' },
    });
  }

  function registeredOverseersIn(homeDirectory: string): unknown[] {
    const registryFilePath = join(homeDirectory, MONITOR_REGISTRY_FILES.REGISTRY_DIRECTORY_NAME, MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME);
    const registry = JSON.parse(readFileSync(registryFilePath, 'utf8')) as Record<string, Record<string, { overseer?: unknown }>>;
    return Object.values(registry[MONITOR_REGISTRY_FILES.ENTRIES_KEY] ?? {}).flatMap((entry) => (entry.overseer === undefined ? [] : [entry.overseer]));
  }

  const overseerStoppedRecordsIn = (logKinds: readonly string[]): number => logKinds.filter((kind) => kind === 'overseer-stopped').length;

  test('a forced end says so, and the CLI does what the Overseer could not, with the process gone first; a second stop finds nothing to do', async () => {
    const wedged = plantWedgedOverseer(true);
    await registerWedgedOverseer(wedged);
    expect(registeredOverseersIn(wedged.homeDirectory)).toHaveLength(1);

    const stopped = wedged.stopContext();
    expect(await runCommandLine(['oversee', 'stop'], stopped), stopped.errorText()).toBe(0);

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

  test('the JSON answer of a forced end names it, and --now says the Watchers kept running', async () => {
    const wedged = plantWedgedOverseer(true);

    const stopped = wedged.stopContext();
    expect(await runCommandLine(['oversee', 'stop', '--json', '--now'], stopped), stopped.errorText()).toBe(0);
    expect(JSON.parse(stopped.outputText())).toEqual({ outcome: 'done', ending: 'forced' });

    const worded = plantWedgedOverseer(true);
    const wordedContext = worded.stopContext();
    expect(await runCommandLine(['oversee', 'stop', '--now'], wordedContext), wordedContext.errorText()).toBe(0);
    expect(wordedContext.outputText()).toContain('Process Watchers were not stopped');
  });

  test('where a stop can ask, an Overseer that died without its stop is repaired too, and never called forced', async () => {
    const wedged = plantWedgedOverseer(false);

    const stopped = wedged.stopContext();
    expect(await runCommandLine(['oversee', 'stop'], stopped), stopped.errorText()).toBe(0);

    expect(wedged.stopStages).toEqual(['ask']);
    expect(stopped.outputText()).toContain('ended before it finished its stop');
    expect(stopped.outputText()).not.toContain('by force');
    expect(overseerStoppedRecordsIn(storedLogKindsOf(repositoryDirectory))).toBe(1);
  });
});

describe('run pause and resume', () => {
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
        context:   createCapturedCommandContext({ currentDirectory: repositoryDirectory, platformPorts }),
        workspace: requireWorkspace(repositoryDirectory),
        notices:   () => [],
        overseer:  () => ({
          state: 'serving', url: null, generation: null, codeVersion: 'example', installVersion: INSTALL_VERSION, batonPassWarning: null
        }),
      }).state;
      return { header: boardState.overseer.paused, runStatus: (JSON.parse(statusContext.outputText()) as Record<string, unknown>)['paused'] };
    };
    expect(await pausedFlagsAfter(['oversee', 'resume'])).toEqual({ header: false, runStatus: false });
    expect(await pausedFlagsAfter(['oversee', 'pause'])).toEqual({ header: true, runStatus: true });
  });
});
