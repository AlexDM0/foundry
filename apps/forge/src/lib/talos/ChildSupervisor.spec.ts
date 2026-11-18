/**
 * The child supervisor over fake calls and a fake spawn. What matters: a stop or `stop-lines` that arrives while a launch still reads the
 * child's identity signals the tree once the identity is read, instead of answering `done` and signalling nothing, which would leave the
 * child running and a clean quit waiting on it for ever; and a record is written before its state is broadcast, an ended one after its event
 * log is closed, so a client that hears of a state reads it in the record and the whole log beside it.
 */
import { expect, test } from 'bun:test';

import { waitUntil }                                   from '../../testing/WaitUntil.ts';
import type { ProcessIdentity }                        from '../process-identity/ProcessIdentity.ts';
import type { ProcessStopStage }                       from '../process-identity/ProcessSupervision.ts';
import type { ChildLaunch }                            from './ChildLaunch.ts';
import { childRecordOf }                               from './ChildRecord.ts';
import { type ChildSupervisor, createChildSupervisor } from './ChildSupervisor.ts';
import { createLaunchRegistry }                        from './LaunchRegistry.ts';
import type { SynchronousCalls }                       from './SynchronousCallsClient.ts';

const BOARD_FOLDER = '/example/board';
const CHILD_PROCESS_ID = 4242;
const CHILD_ID = 'jobs/J-1/gate-1#1';
/** Past the end of a stop of grace 0 that signals no leader, whose one sweep waits 100 milliseconds: the identity is held this long. */
const IDENTITY_HELD_PAST_A_LEADERLESS_STOP_MILLISECONDS = 500;

const LINE_LAUNCH: ChildLaunch = {
  childFolder:                    'jobs/J-1/gate-1',
  instance:                       1,
  kind:                           'line',
  label:                          'J-1 gate 1',
  argv:                           ['example-gate'],
  environment:                    {},
  environmentFromTalos:           {},
  workingDirectory:               BOARD_FOLDER,
  verbatimArguments:              false,
  standingReplies:                [],
  closingLine:                    null,
  endingPatterns:                 [],
  quitAtTurnEnd:                  null,
  treeStopAtEndGraceMilliseconds: null,
  timeBoundMilliseconds:          null,
};

interface FakeChildRun {
  readonly supervisor:      ChildSupervisor;
  /** Each call and broadcast as it settles: `record written <state>`, `state frame <state>`, `sync-and-close-event-log`. */
  readonly happenings:      string[];
  readonly signalsSent:     ProcessStopStage[];
  readonly failures:        unknown[];
  readonly identityAsked:   () => boolean;
  readonly releaseIdentity: () => void;
  readonly writtenStateOf:  () => string | null;
}

/** A child that runs until a `force` reaches its tree, or one that ends at once; the identity read is held when asked. */
function fakeChildRun(options: { endsAtOnce: boolean; holdIdentity: boolean }): FakeChildRun {
  const happenings: string[] = [];
  const signalsSent: ProcessStopStage[] = [];
  const failures: unknown[] = [];
  let identityAsked = false;
  let releaseIdentity = (): void => undefined;
  const identityReleased = options.holdIdentity ? new Promise<void>((resolve) => {
    releaseIdentity = resolve;
  }) : Promise.resolve();
  let childEnded = options.endsAtOnce;
  let endChild = (): void => undefined;
  const exited = options.endsAtOnce ? Promise.resolve<number | null>(0) : new Promise<number | null>((resolve) => {
    endChild = () => {
      childEnded = true;
      resolve(null);
    };
  });
  let closeStandardOutput = (): void => undefined;
  const standardOutput = new ReadableStream<Uint8Array>({
    start: (controller) => {
      if (options.endsAtOnce) controller.close();
      closeStandardOutput = () => controller.close();
    },
  });
  let writtenRecordText: string | null = null;
  const leader: ProcessIdentity = { processId: CHILD_PROCESS_ID, startStamp: '1', bootIdentity: 'example-boot' };
  const calls: SynchronousCalls = {
    start:      async () => null,
    identityOf: async (processId) => {
      identityAsked = true;
      await identityReleased;
      return { ...leader, processId };
    },
    treeMembersOf: async () => (childEnded ? [] : [{ processId: CHILD_PROCESS_ID, startStamp: '1', processGroupId: CHILD_PROCESS_ID }]),
    stopTree:      async (_leader, stage) => {
      signalsSent.push(stage);
      if (stage === 'force') {
        endChild();
        closeStandardOutput();
      }
      return { verdict: 'signalled' };
    },
    endOf: async (exitCode, signalCode) => (signalCode === null
      ? { reason: 'exited', exitCode, signal: null }
      : { reason: 'signalled', exitCode: null, signal: signalCode }),
    openEventLog:         async () => null,
    appendEvent:          async (_eventLogPath, entry) => entry,
    syncAndCloseEventLog: async () => {
      happenings.push('sync-and-close-event-log');
      return null;
    },
    writeRecord: async (_path, text) => {
      // Settled a turn later, as the thread answers: a broadcast sent before the write would come first.
      await Promise.resolve();
      writtenRecordText = text;
      const reading = childRecordOf(text);
      happenings.push(`record written ${reading.verdict === 'read' ? reading.record.state : 'unreadable'}`);
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
      standardInput: null,
      standardOutput,
      standardError: null,
      exited,
      signalCode:    () => (options.endsAtOnce ? null : 'SIGKILL'),
    }),
    ownVariableOf:       () => undefined,
    stampNow:            () => '2026-11-19T00:00:00.000Z',
    wallNowMilliseconds: () => 0,
    tickMilliseconds:    50,
    talosLogPath:        `${BOARD_FOLDER}/talos/talos-1.log`,
    broadcastState:      (frame) => happenings.push(`state frame ${frame.state}`),
    fail:                (cause) => failures.push(cause),
  });
  return {
    supervisor,
    happenings,
    signalsSent,
    failures,
    identityAsked:  () => identityAsked,
    releaseIdentity,
    writtenStateOf: () => {
      if (writtenRecordText === null) return null;
      const reading = childRecordOf(writtenRecordText);
      return reading.verdict === 'read' ? reading.record.state : null;
    },
  };
}

test.each([
  ['a stop', (supervisor: ChildSupervisor) => supervisor.stop(CHILD_ID, 0)],
  ['stop-lines', (supervisor: ChildSupervisor) => supervisor.stopLines()],
])('%s that arrives while the launch reads the child\'s identity signals the tree once it is read', async (_title, stopWhileLaunching) => {
  const run = fakeChildRun({ endsAtOnce: false, holdIdentity: true });
  const launching = run.supervisor.launch(LINE_LAUNCH);
  await waitUntil(run.identityAsked, 'the launch asks for the child\'s identity');
  expect(stopWhileLaunching(run.supervisor)).toEqual({ verdict: 'done' });
  await Bun.sleep(IDENTITY_HELD_PAST_A_LEADERLESS_STOP_MILLISECONDS);
  run.releaseIdentity();
  expect(await launching).toEqual({ verdict: 'done' });
  await waitUntil(() => run.writtenStateOf() === 'ended', () => `the child's record reads ended, not ${run.writtenStateOf()}`);
  expect(run.signalsSent).toEqual(['ask', 'force']);
  expect(run.supervisor.stop(CHILD_ID, 0)).toEqual({ verdict: 'already-done' });
  expect(run.failures).toEqual([]);
});

test('a clean quit asked while a launch reads the identity stops that child and ends', async () => {
  const run = fakeChildRun({ endsAtOnce: false, holdIdentity: true });
  const launching = run.supervisor.launch(LINE_LAUNCH);
  await waitUntil(run.identityAsked, 'the launch asks for the child\'s identity');
  expect(run.supervisor.stop(CHILD_ID, 0)).toEqual({ verdict: 'done' });
  const pausing = (async (): Promise<void> => {
    await run.supervisor.refuseLaunches();
    run.supervisor.pauseLiveLines();
    await run.supervisor.everyEndRecorded();
  })();
  await Bun.sleep(IDENTITY_HELD_PAST_A_LEADERLESS_STOP_MILLISECONDS);
  run.releaseIdentity();
  await launching;
  await pausing;
  expect(run.writtenStateOf()).toBe('ended');
  expect(run.signalsSent).toEqual(['ask', 'force']);
});

test('a record is written before its state is broadcast, and an ended one after its event log is synced and closed', async () => {
  const run = fakeChildRun({ endsAtOnce: true, holdIdentity: false });
  expect(await run.supervisor.launch(LINE_LAUNCH)).toEqual({ verdict: 'done' });
  await waitUntil(() => run.happenings.includes('state frame ended'), 'the child\'s end is broadcast');
  expect(run.happenings).toEqual([
    'record written starting',
    'state frame starting',
    'record written running',
    'state frame running',
    'sync-and-close-event-log',
    'record written ended',
    'state frame ended',
  ]);
  expect(run.failures).toEqual([]);
});
