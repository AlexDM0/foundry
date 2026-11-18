/**
 * The tree stop at an agent's end, over fake calls and a fake spawn. What matters: an agent that ends with no stop asked for gets the tree
 * stop, and one that was stopped gets no second; and a launch's grace, five seconds on a worktree job, never stretches a clean quit or a
 * lease's end past its wait and the stop sweep, whether the agent ends on its quit act or ended just before the quit began.
 */
import { expect, test } from 'bun:test';

import { waitUntil }                                           from '../../testing/WaitUntil.ts';
import type { ProcessStopStage }                               from '../process-identity/ProcessSupervision.ts';
import type { ChildLaunch }                                    from './ChildLaunch.ts';
import { childRecordOf }                                       from './ChildRecord.ts';
import { type ChildSupervisor, createChildSupervisor }         from './ChildSupervisor.ts';
import { endAgentsAtTurnEnd, PERFORMANCE_TIMER, runCleanQuit } from './CleanQuit.ts';
import { createLaunchRegistry }                                from './LaunchRegistry.ts';
import type { SynchronousCalls }                               from './SynchronousCallsClient.ts';

const BOARD_FOLDER = '/example/board';
const CHILD_PROCESS_ID = 4242;
const AGENT_FOLDER = 'jobs/J-1';
const AGENT_ID = `${AGENT_FOLDER}#1`;
/** The grace a worktree job's launch carries. */
const WORKTREE_JOB_TREE_STOP_GRACE_MILLISECONDS = 5000;
const QUIT_WAIT_MILLISECONDS = 300;
/** The stop sweep's own bound: twenty `force` rounds a hundred milliseconds apart. */
const STOP_SWEEP_MILLISECONDS = 2000;

function agentLaunchWithTreeStopGrace(treeStopAtEndGraceMilliseconds: number): ChildLaunch {
  return {
    childFolder:           AGENT_FOLDER,
    instance:              1,
    kind:                  'agent',
    label:                 'J-1 build',
    argv:                  ['example-agent'],
    environment:           {},
    environmentFromTalos:  {},
    workingDirectory:      BOARD_FOLDER,
    verbatimArguments:     false,
    standingReplies:       [],
    closingLine:           null,
    endingPatterns:        [],
    quitAtTurnEnd:         { act: 'close-input' },
    treeStopAtEndGraceMilliseconds,
    timeBoundMilliseconds: null,
  };
}

interface FakeAgentRun {
  readonly supervisor:     ChildSupervisor;
  readonly signalsSent:    ProcessStopStage[];
  readonly failures:       unknown[];
  /** Ends the agent as one that finished its work does: its output closes and it exits 0. */
  readonly endByItself:    () => void;
  readonly writtenStateOf: () => string | null;
}

/** An agent that ends once its stdin is closed or a `force` reaches it; its tree is empty once it ended. */
function fakeAgentRun(): FakeAgentRun {
  const signalsSent: ProcessStopStage[] = [];
  const failures: unknown[] = [];
  let agentEnded = false;
  let closeStandardOutput = (): void => undefined;
  let settleExit = (_exitCode: number | null): void => undefined;
  const exited = new Promise<number | null>((resolve) => {
    settleExit = resolve;
  });
  const endAgent = (): void => {
    if (agentEnded) return;
    agentEnded = true;
    closeStandardOutput();
    settleExit(0);
  };
  const standardOutput = new ReadableStream<Uint8Array>({
    start: (controller) => {
      closeStandardOutput = () => controller.close();
    },
  });
  let writtenRecordText: string | null = null;
  const calls: SynchronousCalls = {
    start:         async () => null,
    identityOf:    async (processId) => ({ processId, startStamp: '1', bootIdentity: 'example-boot' }),
    treeMembersOf: async () => (agentEnded ? [] : [{ processId: CHILD_PROCESS_ID, startStamp: '1', processGroupId: CHILD_PROCESS_ID }]),
    stopTree:      async (_leader, stage) => {
      signalsSent.push(stage);
      if (stage === 'force') endAgent();
      return { verdict: 'signalled' };
    },
    endOf:                async (exitCode) => ({ reason: 'exited', exitCode, signal: null }),
    openEventLog:         async () => null,
    appendEvent:          async (_eventLogPath, entry) => entry,
    syncAndCloseEventLog: async () => null,
    writeRecord:          async (_path, text) => {
      writtenRecordText = text;
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
    spawnChild:     () => ({
      processId:     CHILD_PROCESS_ID,
      standardInput: { writeLine: () => undefined, close: endAgent },
      standardOutput,
      standardError: null,
      exited,
      signalCode:    () => null,
    }),
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
    signalsSent,
    failures,
    endByItself:    endAgent,
    writtenStateOf: () => {
      if (writtenRecordText === null) return null;
      const reading = childRecordOf(writtenRecordText);
      return reading.verdict === 'read' ? reading.record.state : null;
    },
  };
}

function cleanQuitOf(run: FakeAgentRun): Promise<void> {
  return runCleanQuit({
    children:         run.supervisor,
    waitMilliseconds: QUIT_WAIT_MILLISECONDS,
    timer:            PERFORMANCE_TIMER,
    markQuitting:     async () => null,
    finishQuit:       async () => null,
  });
}

async function millisecondsTakenBy(work: () => Promise<void>): Promise<number> {
  const startedAt = performance.now();
  await work();
  return performance.now() - startedAt;
}

test('an agent that ends with no stop asked for gets the tree stop at its end', async () => {
  const run = fakeAgentRun();
  expect(await run.supervisor.launch(agentLaunchWithTreeStopGrace(0))).toEqual({ verdict: 'done' });
  run.endByItself();
  await waitUntil(() => run.signalsSent.includes('force'), () => `the tree stop at the end sends force, not only ${run.signalsSent.join(', ')}`);
  expect(run.signalsSent).toEqual(['ask', 'force']);
  expect(run.writtenStateOf()).toBe('ended');
  expect(run.failures).toEqual([]);
});

test('an agent that was stopped gets no second stop at its end', async () => {
  const run = fakeAgentRun();
  expect(await run.supervisor.launch(agentLaunchWithTreeStopGrace(0))).toEqual({ verdict: 'done' });
  expect(run.supervisor.stop(AGENT_ID, 0)).toEqual({ verdict: 'done' });
  await run.supervisor.everyEndRecorded();
  expect(run.writtenStateOf()).toBe('ended');
  expect(run.signalsSent).toEqual(['ask', 'force']);
  expect(run.failures).toEqual([]);
});

test('a clean quit ends within its wait and the sweep when the agent ends on its quit act and its launch carries a grace', async () => {
  const run = fakeAgentRun();
  expect(await run.supervisor.launch(agentLaunchWithTreeStopGrace(WORKTREE_JOB_TREE_STOP_GRACE_MILLISECONDS))).toEqual({ verdict: 'done' });
  expect(await millisecondsTakenBy(() => cleanQuitOf(run))).toBeLessThan(QUIT_WAIT_MILLISECONDS + STOP_SWEEP_MILLISECONDS);
  expect(run.writtenStateOf()).toBe('ended');
  expect(run.signalsSent).toEqual(['ask', 'force']);
  expect(run.failures).toEqual([]);
});

test('a lease\'s end ends within its wait and the sweep when the agent ends on its quit act and its launch carries a grace', async () => {
  const run = fakeAgentRun();
  expect(await run.supervisor.launch(agentLaunchWithTreeStopGrace(WORKTREE_JOB_TREE_STOP_GRACE_MILLISECONDS))).toEqual({ verdict: 'done' });
  const leaseEnd = (): Promise<void> => endAgentsAtTurnEnd({
    children: run.supervisor, reason: 'lease-ended', waitMilliseconds: QUIT_WAIT_MILLISECONDS, timer: PERFORMANCE_TIMER
  });
  expect(await millisecondsTakenBy(leaseEnd)).toBeLessThan(QUIT_WAIT_MILLISECONDS + STOP_SWEEP_MILLISECONDS);
  expect(run.signalsSent).toEqual(['ask', 'force']);
  expect(run.failures).toEqual([]);
});

test('a clean quit cuts short the grace of an agent that ended by itself just before it', async () => {
  const run = fakeAgentRun();
  expect(await run.supervisor.launch(agentLaunchWithTreeStopGrace(WORKTREE_JOB_TREE_STOP_GRACE_MILLISECONDS))).toEqual({ verdict: 'done' });
  run.endByItself();
  await waitUntil(() => run.writtenStateOf() === 'ended', 'the agent\'s record reads ended');
  expect(run.signalsSent).toEqual([]);
  expect(await millisecondsTakenBy(() => cleanQuitOf(run))).toBeLessThan(QUIT_WAIT_MILLISECONDS + STOP_SWEEP_MILLISECONDS);
  expect(run.signalsSent).toEqual(['ask', 'force']);
  expect(run.failures).toEqual([]);
});
