/**
 * The checked Baton pass decides whether a board keeps an Overseer through an update, so each way a successor can fail is planted here, and
 * what matters is which side drives afterwards: a failure before `released` leaves the old Overseer driving and never releases it, one after
 * it hands the board back for generation n+2, a silent successor is killed (only while it is still that process), and every failure is
 * recorded before the final `failed` is left in the file, which is what `oversee restart` and `update` read. The crash rows "the old Overseer
 * dies during a baton-pass" and "a Baton pass's successor fails" are held here over the recorded process table; real processes and a real port are
 * `src/services/overseer/BatonPass.integration.spec.ts`, the whole Baton pass between two real Overseers is held by
 * `cli/overseer/OverseerCommand.integration.spec.ts`, and the agent that keeps running across it by
 * `src/services/overseer/CrashMatrix.integration.spec.ts`.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  spyOn,
  test
} from 'bun:test';


import type { ProcessIdentity }                           from '../../lib/process-identity/ProcessIdentity.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { useRecordedProcessTable }                        from '../../testing/RecordedProcessTable.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { describeWhenRecorded }                           from '../../testing/ToolGuard.ts';
import { Baton, type BatonRecord }                        from './Baton.ts';
import {
  type BatonPassFailure,
  type BatonPassStep,
  type BatonPassStepRun,
  BatonPass
} from './BatonPass.ts';

const nativePorts = nativePlatformPorts();

const SCHEDULE = { readyTries: 40, releaseTries: 40, intervalMilliseconds: 10 };
/** A successor that never reports runs out every try it is given, so the cases with a silent successor give it few. */
const SILENT_SUCCESSOR_SCHEDULE = { ...SCHEDULE, readyTries: 3, releaseTries: 3 };
const PREPARATION_STEPS: readonly BatonPassStep[] = ['build-bundles', 'read-board', 'read-jobs', 'read-watcher-files', 'install-version'];
const AFTER_RELEASE_STEPS: readonly BatonPassStep[] = ['bind-port', 'take-baton', 'regroup'];
const SUCCESSOR_CODE = 'code-successor';

let overseerDirectory = '';
let batonPassFilePath = '';
const processTable = useRecordedProcessTable(nativePorts);
const { ports } = processTable;
let liveSuccessor: ProcessIdentity;

beforeEach(() => {
  liveSuccessor = processTable.bornProcess();
  overseerDirectory = createScratchDirectory('baton-pass');
  mkdirSync(overseerDirectory, { recursive: true });
  batonPassFilePath = BatonPass.batonPassFilePathOf(overseerDirectory, 1);
  BatonPass.writeBatonPass(batonPassFilePath, { state: 'requested' });
});

afterEach(() => {
  removeScratchDirectory(overseerDirectory);
});

function stepsFailingAt(failing: BatonPassStep | null, ran: BatonPassStep[]): BatonPassStepRun[] {
  return PREPARATION_STEPS.map((step) => ({
    step,
    run: () => {
      ran.push(step);
      if (step === failing) throw new Error(`Example failure at ${step}`);
    },
  }));
}

/** The old Overseer's side against an in-process successor; what it released and recorded, and its outcome. */
async function handOverAgainst(successor: () => Promise<void>, successorIdentity: ProcessIdentity | null = liveSuccessor, schedule = SCHEDULE) {
  const recorded: BatonPassFailure[] = [];
  let released = 0;
  const [outcome] = await Promise.all([
    BatonPass.handOver({
      ports,
      batonPassFilePath,
      successor:            successorIdentity,
      successorCodeVersion: SUCCESSOR_CODE,
      release:              () => {
        released += 1;
        return Promise.resolve();
      },
      recordFailure: (failure) => {
        // The file still holds the successor's own report while the failure is recorded.
        expect(BatonPass.readBatonPass(batonPassFilePath)?.state).not.toBe('failed');
        recorded.push(failure);
        return Promise.resolve();
      },
      logSuccessorKill: () => undefined,
      schedule,
    }),
    successor(),
  ]);
  return { outcome, recorded, released };
}

function successorRequest(predecessorIsLive: () => boolean = () => true, schedule = SCHEDULE) {
  return {
    batonPassFilePath, codeVersion: SUCCESSOR_CODE, predecessorIsLive, schedule
  };
}

describeWhenRecorded(['process-table-recording'], 'a successor failing before released', () => {
  test.each(PREPARATION_STEPS.map((step) => [step]))('at %s: no later step runs, the old Overseer never releases, keeps driving and records it', async (failing) => {
    const ran: BatonPassStep[] = [];
    let admission = '';
    const { outcome, recorded, released } = await handOverAgainst(async () => {
      admission = await BatonPass.prepareAndAwaitRelease(successorRequest(), stepsFailingAt(failing, ran));
    });
    expect(admission).toBe('failed');
    expect(ran.at(-1)).toBe(failing);
    expect(released).toBe(0);
    const failure = { successorCodeVersion: SUCCESSOR_CODE, step: failing, error: `Example failure at ${failing}` };
    expect(outcome).toEqual({ verdict: 'kept-driving', failure });
    expect(recorded).toEqual([failure]);
    expect(BatonPass.readBatonPass(batonPassFilePath)).toEqual({ state: 'failed', ...failure, afterRelease: false });
  });

  test('a successor that reports nothing within the ready tries is killed and counted as failed before released', async () => {
    const silent = processTable.bornProcess();
    const { outcome, released } = await handOverAgainst(() => Promise.resolve(), silent, SILENT_SUCCESSOR_SCHEDULE);
    expect(outcome).toMatchObject({ verdict: 'kept-driving', failure: { step: 'report-ready', successorCodeVersion: SUCCESSOR_CODE } });
    expect(released).toBe(0);
    expect(processTable.stoppedProcesses()).toEqual([silent]);
  });

  test('a successor that exits without a report fails at once, unkilled, and one never started fails at spawn', async () => {
    const exited = processTable.bornProcess();
    processTable.endProcess(exited);
    const { outcome } = await handOverAgainst(() => Promise.resolve(), exited);
    expect(outcome).toMatchObject({ verdict: 'kept-driving', failure: { step: 'report-ready', error: 'the successor exited without a report' } });
    expect(processTable.stoppedProcesses()).toEqual([]);
    BatonPass.writeBatonPass(batonPassFilePath, { state: 'requested' });
    expect((await handOverAgainst(() => Promise.resolve(), null)).outcome).toMatchObject({ verdict: 'kept-driving', failure: { step: 'spawn' } });
  });
});

describeWhenRecorded(['process-table-recording'], 'a successor failing after released', () => {
  test.each(AFTER_RELEASE_STEPS.map((step) => [step]))('at %s: the old Overseer released once and takes the board back, recording it', async (failing) => {
    const { outcome, recorded, released } = await handOverAgainst(async () => {
      expect(await BatonPass.prepareAndAwaitRelease(successorRequest(), stepsFailingAt(null, []))).toBe('released');
      BatonPass.reportFailure({ batonPassFilePath, codeVersion: SUCCESSOR_CODE }, failing, new Error('Example failure'), true);
    });
    expect(released).toBe(1);
    expect(outcome).toEqual({ verdict: 'taken-back', failure: { successorCodeVersion: SUCCESSOR_CODE, step: failing, error: 'Example failure' } });
    expect(recorded.length).toBe(1);
    expect(BatonPass.readBatonPass(batonPassFilePath)).toMatchObject({ state: 'failed', step: failing, afterRelease: true });
  });

  test('a successor that serves hands the board over, recording nothing', async () => {
    const { outcome, recorded, released } = await handOverAgainst(async () => {
      await BatonPass.prepareAndAwaitRelease(successorRequest(), stepsFailingAt(null, []));
      BatonPass.reportServing({ batonPassFilePath, codeVersion: SUCCESSOR_CODE }, 2, 'http://127.0.0.1:4930/');
    });
    expect(outcome).toEqual({
      verdict: 'baton-passed', successorCodeVersion: SUCCESSOR_CODE, generation: 2, url: 'http://127.0.0.1:4930/'
    });
    expect([recorded, released]).toEqual([[], 1]);
  });
});

describeWhenRecorded(['process-table-recording'], 'the old Overseer rebinding its port after taking a Baton pass back', () => {
  const PORT = 4930;

  /** A port table of one: a bind while the holder lives is refused, as the kernel refuses it. */
  function portHolder() {
    const holder = processTable.memberOfOwnGroup();
    const bind = (): Promise<{ port: number }> => (processTable.ports.processSupervision.identityOf(holder.processId) === null
      ? Promise.resolve({ port: PORT })
      : Promise.reject(new Error('Example port in use')));
    return { holder, bind };
  }

  test('a silent successor still holding the port after its kill is waited for, and the old Overseer then serves again on that port', async () => {
    const { holder, bind } = portHolder();
    const { outcome } = await handOverAgainst(async () => {
      await BatonPass.prepareAndAwaitRelease(successorRequest(() => true, SILENT_SUCCESSOR_SCHEDULE), stepsFailingAt(null, []));
    }, holder, SILENT_SUCCESSOR_SCHEDULE);
    expect(outcome).toMatchObject({ verdict: 'taken-back', failure: { step: 'serve' } });
    expect(processTable.stoppedProcesses()).toEqual([holder]);
    // The holder ends at the rebind's first wait, which comes only once it read the successor live.
    const firstRebindWait = spyOn(Bun, 'sleep').mockImplementationOnce(() => {
      processTable.endProcess(holder);
      return Promise.resolve();
    });
    let binds = 0;
    const rebound = await BatonPass.rebindAfterTakeBack({
      ports,
      successor:            holder,
      tries:                SCHEDULE.releaseTries,
      intervalMilliseconds: SCHEDULE.intervalMilliseconds,
      bind:                 () => {
        binds += 1;
        return bind();
      },
    });
    expect(firstRebindWait).toHaveBeenCalledTimes(1);
    firstRebindWait.mockRestore();
    expect(rebound).toEqual({ verdict: 'bound', bound: { port: PORT } });
    expect(binds).toBe(1);
  });

  test('a successor outliving the tries is never bound over; a port still held fails each try; a refused bind is tried again until it holds', async () => {
    const { holder, bind: bindWhileHeld } = portHolder();
    let binds = 0;
    const bind = () => {
      binds += 1;
      return bindWhileHeld();
    };
    const rebindOver = (successor: ProcessIdentity | null, bindOnce: typeof bind) => BatonPass.rebindAfterTakeBack({
      ports, successor, tries: 3, intervalMilliseconds: SCHEDULE.intervalMilliseconds, bind: bindOnce
    });
    expect(await rebindOver(holder, bind)).toEqual({ verdict: 'successor-live' });
    expect(binds).toBe(0);
    expect(await rebindOver(null, bind)).toMatchObject({ verdict: 'bind-failed' });
    expect(binds).toBe(3);
    processTable.endProcess(holder);
    binds = 0;
    const refusedOnce = () => (binds === 0 ? (binds += 1, Promise.reject(new Error('Example bind refusal'))) : bind());
    expect((await rebindOver(null, refusedOnce)).verdict).toBe('bound');
    expect(binds).toBe(2);
  });
});

describeWhenRecorded(['process-table-recording'], 'the old Overseer dies during a baton-pass', () => {
  test('its successor, ready and waiting, reads it as gone and starts as after a crash', async () => {
    let livenessReads = 0;
    const livenessReadsWhileItLives = 3;
    const predecessorIsLive = (): boolean => {
      livenessReads += 1;
      return livenessReads <= livenessReadsWhileItLives;
    };
    expect(await BatonPass.prepareAndAwaitRelease(successorRequest(predecessorIsLive), stepsFailingAt(null, []))).toBe('predecessor-gone');
    expect(livenessReads).toBe(livenessReadsWhileItLives + 1);
  });
});

describeWhenRecorded(['process-table-recording'], 'the Baton generations a Baton pass takes', () => {
  function recordNaming(identity: ProcessIdentity): BatonRecord {
    return {
      processId:              identity.processId,
      processStartStamp:      identity.startStamp,
      bootIdentity:           identity.bootIdentity,
      port:                   1,
      url:                    'http://127.0.0.1:1/',
      tokenFile:              join(overseerDirectory, 'token'),
      codeVersion:            'code-example',
      installVersion:         1,
      watcherProtocolVersion: 1,
    };
  }

  test('the successor takes n+1 beside the live n; the old Overseer, its successor gone, takes n+2; anything newer is contended', () => {
    const record = recordNaming(liveSuccessor);
    expect(Baton.acquire(ports, overseerDirectory, record)).toEqual({ verdict: 'acquired', generation: 1 });
    expect(Baton.acquire(ports, overseerDirectory, record).verdict).toBe('already-running');
    expect(Baton.acquireAbove(overseerDirectory, record, 1)).toEqual({ verdict: 'acquired', generation: 2 });
    Baton.release(overseerDirectory, 2);
    expect(Baton.acquireAbove(overseerDirectory, record, 1 + 1)).toEqual({ verdict: 'acquired', generation: 3 });
    expect(Baton.batonGenerationsIn(overseerDirectory)).toEqual([3]);
    expect(Baton.acquireAbove(overseerDirectory, record, 1)).toEqual({ verdict: 'contended' });
  });
});
