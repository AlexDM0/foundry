/**
 * The clean quit over the child supervisor, its calls and spawn faked and its wait on a fake timer. What matters: an agent that ends at its
 * turn end within the wait ends `paused` with its own exit code, its quit act in its event log first; one that does not is stopped only once
 * the wait is over and still ends `paused`; lines are stopped at once, not after the wait; nothing is launched while quitting; Talos records
 * `quit` only after every end; and a lease end runs the agent half alone, leaving lines and agents launched during its wait running.
 */
import { expect, test } from 'bun:test';

import { waitUntil }                                             from '../../testing/WaitUntil.ts';
import type { ProcessIdentity }                                  from '../process-identity/ProcessIdentity.ts';
import type { ChildLaunch }                                      from './ChildLaunch.ts';
import { type ChildRecord, childRecordOf }                       from './ChildRecord.ts';
import { type ChildSupervisor, createChildSupervisor }           from './ChildSupervisor.ts';
import { endAgentsAtTurnEnd, type MonotonicTimer, runCleanQuit } from './CleanQuit.ts';
import type { EventLogEntry }                                    from './EventLog.ts';
import { createLaunchRegistry }                                  from './LaunchRegistry.ts';
import type { SynchronousCalls }                                 from './SynchronousCallsClient.ts';
import { childFilesOf }                                          from './TalosFiles.ts';

const BOARD_FOLDER = '/example/board';
const QUIT_WAIT_MILLISECONDS = 300;
const FIRST_PROCESS_ID = 5000;
const SESSION_EXIT_CODE = 0;

/** How a fake child answers its closed input: an agent that ends its turn and exits, or one that runs on until it is killed. */
type FakeChildBehaviour = 'ends-when-input-closes' | 'runs-until-killed';

interface FakeProcess {
  readonly exit:  (exitCode: number | null, signalCode: string | null) => void;
  readonly ended: () => boolean;
}

interface FakeTalos {
  readonly supervisor:   ChildSupervisor;
  readonly timer:        MonotonicTimer;
  readonly waitsAsked:   number[];
  readonly endTheWait:   () => void;
  readonly spawnCount:   () => number;
  readonly recordOf:     (childFolder: string) => ChildRecord | null;
  readonly eventLinesOf: (childFolder: string) => readonly string[];
  readonly failures:     unknown[];
}

function fakeTalos(): FakeTalos {
  const processes = new Map<number, FakeProcess>();
  const recordTexts = new Map<string, string>();
  const eventEntries = new Map<string, EventLogEntry[]>();
  const failures: unknown[] = [];
  const waitsAsked: number[] = [];
  let lastProcessId = FIRST_PROCESS_ID;
  let endTheWait = (): void => undefined;
  const calls: SynchronousCalls = {
    start:         async () => null,
    identityOf:    async (processId): Promise<ProcessIdentity> => ({ processId, startStamp: '1', bootIdentity: 'example-boot' }),
    treeMembersOf: async (leader) => (processes.get(leader.processId)?.ended() === false
      ? [{ processId: leader.processId, startStamp: '1', processGroupId: leader.processId }]
      : []),
    stopTree: async (leader, stage) => {
      if (stage === 'force') processes.get(leader.processId)?.exit(null, 'SIGKILL');
      return { verdict: 'signalled' };
    },
    endOf: async (exitCode, signalCode) => (signalCode === null
      ? { reason: 'exited', exitCode, signal: null }
      : { reason: 'signalled', exitCode: null, signal: signalCode }),
    openEventLog: async () => null,
    appendEvent:  async (eventLogPath, entry) => {
      eventEntries.set(eventLogPath, [...eventEntries.get(eventLogPath) ?? [], entry]);
      return entry;
    },
    syncAndCloseEventLog: async () => null,
    writeRecord:          async (path, text) => {
      recordTexts.set(path, text);
      return 'replaced';
    },
    appendText:      async () => null,
    prepareEndpoint: async () => ({ verdict: 'done' }),
    releaseEndpoint: async () => ({ verdict: 'done' }),
  };
  const supervisor = createChildSupervisor({
    boardFolder:    BOARD_FOLDER,
    startNumber:    1,
    talos:          null,
    calls,
    launchRegistry: createLaunchRegistry(`${BOARD_FOLDER}/talos/launches-1.ndjson`, calls.appendText),
    spawnChild:     (request) => {
      lastProcessId += 1;
      const processId = lastProcessId;
      const behaviour = request.argv[0] as FakeChildBehaviour;
      let ended = false;
      let signal: string | null = null;
      let closeStandardOutput = (): void => undefined;
      let settleExit = (_exitCode: number | null): void => undefined;
      const exited = new Promise<number | null>((resolve) => {
        settleExit = resolve;
      });
      const fakeProcess: FakeProcess = {
        exit: (exitCode, signalCode) => {
          if (ended) return;
          ended = true;
          signal = signalCode;
          closeStandardOutput();
          settleExit(exitCode);
        },
        ended: () => ended,
      };
      processes.set(processId, fakeProcess);
      return {
        processId,
        standardInput: request.takesInput ? {
          writeLine: () => undefined,
          close:     () => {
            if (behaviour === 'ends-when-input-closes') fakeProcess.exit(SESSION_EXIT_CODE, null);
          },
        } : null,
        standardOutput: new ReadableStream<Uint8Array>({
          start: (controller) => {
            closeStandardOutput = () => controller.close();
          },
        }),
        standardError: null,
        exited,
        signalCode:    () => signal,
      };
    },
    ownVariableOf:       () => undefined,
    stampNow:            () => '2026-11-19T00:00:00.000Z',
    wallNowMilliseconds: () => 0,
    tickMilliseconds:    50,
    talosLogPath:        `${BOARD_FOLDER}/talos/talos-1.log`,
    broadcastState:      () => undefined,
    fail:                (cause) => failures.push(cause),
  });
  return {
    supervisor,
    timer: {
      elapsed: (milliseconds) => {
        waitsAsked.push(milliseconds);
        return new Promise((resolve) => {
          endTheWait = resolve;
        });
      },
    },
    waitsAsked,
    endTheWait: () => endTheWait(),
    spawnCount: () => lastProcessId - FIRST_PROCESS_ID,
    recordOf:   (childFolder) => {
      const text = recordTexts.get(childFilesOf(BOARD_FOLDER, childFolder, 1).recordPath);
      const reading = text === undefined ? null : childRecordOf(text);
      return reading?.verdict === 'read' ? reading.record : null;
    },
    eventLinesOf: (childFolder) => (eventEntries.get(childFilesOf(BOARD_FOLDER, childFolder, 1).eventLogPath) ?? []).map(({ line }) => line),
    failures,
  };
}

function launchOf(childFolder: string, kind: ChildLaunch['kind'], behaviour: FakeChildBehaviour): ChildLaunch {
  return {
    childFolder,
    instance:                       1,
    kind,
    label:                          `example ${childFolder}`,
    argv:                           [behaviour],
    environment:                    {},
    environmentFromTalos:           {},
    workingDirectory:               BOARD_FOLDER,
    verbatimArguments:              false,
    standingReplies:                [],
    closingLine:                    null,
    endingPatterns:                 [],
    quitAtTurnEnd:                  kind === 'agent' ? { act: 'close-input' } : null,
    treeStopAtEndGraceMilliseconds: null,
    timeBoundMilliseconds:          null,
  };
}

interface QuitRun {
  readonly happenings: string[];
  readonly finished:   Promise<void>;
}

function quitOf(talos: FakeTalos): QuitRun {
  const happenings: string[] = [];
  const finished = runCleanQuit({
    children:         talos.supervisor,
    waitMilliseconds: QUIT_WAIT_MILLISECONDS,
    timer:            talos.timer,
    markQuitting:     async () => happenings.push('quitting'),
    finishQuit:       async () => happenings.push('quit'),
  });
  return { happenings, finished };
}

test('an agent that ends at its turn end within the wait ends paused with its own exit code, its quit act logged first', async () => {
  const talos = fakeTalos();
  await talos.supervisor.launch(launchOf('jobs/J-1', 'agent', 'ends-when-input-closes'));
  const quit = quitOf(talos);
  await quit.finished;
  expect(talos.recordOf('jobs/J-1')?.end).toMatchObject({ reason: 'paused', exitCode: SESSION_EXIT_CODE, signal: null });
  expect(talos.eventLinesOf('jobs/J-1')).toEqual([JSON.stringify({ act: 'close' })]);
  expect(talos.waitsAsked).toEqual([QUIT_WAIT_MILLISECONDS]);
  expect(quit.happenings).toEqual(['quitting', 'quit']);
  expect(talos.failures).toEqual([]);
});

test('an agent that runs on past its quit act is stopped once the wait is over, and ends paused', async () => {
  const talos = fakeTalos();
  await talos.supervisor.launch(launchOf('jobs/J-1', 'agent', 'runs-until-killed'));
  const quit = quitOf(talos);
  await waitUntil(() => talos.waitsAsked.length === 1, 'the quit waiting for the agent');
  expect(talos.recordOf('jobs/J-1')?.state).toBe('running');
  expect(quit.happenings).toEqual(['quitting']);
  talos.endTheWait();
  await quit.finished;
  expect(talos.recordOf('jobs/J-1')?.end).toMatchObject({ reason: 'paused', exitCode: null, signal: 'SIGKILL' });
  expect(talos.eventLinesOf('jobs/J-1')).toEqual([JSON.stringify({ act: 'close' }), JSON.stringify({ act: 'stop', graceMilliseconds: 0 })]);
  expect(quit.happenings).toEqual(['quitting', 'quit']);
});

test('lines are stopped at once, before the wait for the agents is over, and end paused', async () => {
  const talos = fakeTalos();
  await talos.supervisor.launch(launchOf('jobs/J-1', 'agent', 'runs-until-killed'));
  await talos.supervisor.launch(launchOf('jobs/J-1/gate-1', 'line', 'runs-until-killed'));
  const quit = quitOf(talos);
  await waitUntil(() => talos.recordOf('jobs/J-1/gate-1')?.state === 'ended', 'the line ending while the quit waits');
  expect(talos.recordOf('jobs/J-1/gate-1')?.end?.reason).toBe('paused');
  expect(talos.recordOf('jobs/J-1')?.state).toBe('running');
  talos.endTheWait();
  await quit.finished;
});

test('nothing is launched while quitting', async () => {
  const talos = fakeTalos();
  await talos.supervisor.launch(launchOf('jobs/J-1', 'agent', 'runs-until-killed'));
  const quit = quitOf(talos);
  await waitUntil(() => talos.waitsAsked.length === 1, 'the quit waiting for the agent');
  expect(await talos.supervisor.launch(launchOf('jobs/J-2', 'agent', 'runs-until-killed'))).toEqual({ verdict: 'refused', reason: 'quitting' });
  expect(talos.spawnCount()).toBe(1);
  talos.endTheWait();
  await quit.finished;
});

test('a lease end ends the agents lease-ended and leaves a line running', async () => {
  const talos = fakeTalos();
  await talos.supervisor.launch(launchOf('jobs/J-1', 'agent', 'ends-when-input-closes'));
  await talos.supervisor.launch(launchOf('jobs/J-1/gate-1', 'line', 'runs-until-killed'));
  await endAgentsAtTurnEnd({
    children: talos.supervisor, reason: 'lease-ended', waitMilliseconds: QUIT_WAIT_MILLISECONDS, timer: talos.timer
  });
  expect(talos.recordOf('jobs/J-1')?.end).toMatchObject({ reason: 'lease-ended', exitCode: SESSION_EXIT_CODE });
  expect(talos.recordOf('jobs/J-1/gate-1')?.state).toBe('running');
  expect(await talos.supervisor.launch(launchOf('jobs/J-2', 'agent', 'ends-when-input-closes'))).toEqual({ verdict: 'done' });
});

test('an agent launched while a lease end waits is no part of it: it runs on when the wait ends and the asked agent is stopped', async () => {
  const talos = fakeTalos();
  await talos.supervisor.launch(launchOf('jobs/J-1', 'agent', 'runs-until-killed'));
  const agentHalf = endAgentsAtTurnEnd({
    children: talos.supervisor, reason: 'lease-ended', waitMilliseconds: QUIT_WAIT_MILLISECONDS, timer: talos.timer
  });
  await waitUntil(() => talos.waitsAsked.length === 1, 'the lease end waiting for the agent');
  expect(await talos.supervisor.launch(launchOf('jobs/J-2', 'agent', 'runs-until-killed'))).toEqual({ verdict: 'done' });
  talos.endTheWait();
  await agentHalf;
  expect(talos.recordOf('jobs/J-1')?.end).toMatchObject({ reason: 'lease-ended', exitCode: null, signal: 'SIGKILL' });
  expect(talos.recordOf('jobs/J-2')?.state).toBe('running');
  expect(talos.eventLinesOf('jobs/J-2')).toEqual([]);
  expect(talos.failures).toEqual([]);
});
