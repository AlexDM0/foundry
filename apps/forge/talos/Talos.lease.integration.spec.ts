/**
 * The supervision lease end to end with the Talos binary: renewals keep agents running, silence ends them `lease-ended` at their turn end,
 * and a Talos suspended longer than the lease stops nothing once it continues. No renewal is sent while it is suspended, so none can renew
 * before the first tick after the continue: the record must read `waiting-after-gap` first, which a broken wake rule never writes.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { LeaseRenewer }                                        from '../src/domain/talos/TalosRecord.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                  from '../src/testing/ChildProcessCaseTimeout.ts';
import { fakeStartedLineSelectorOf }                                from '../src/testing/FakeAgentAdapter.ts';
import { fakeAgentChildLaunch }                                     from '../src/testing/FakeAgentChildLaunch.ts';
import { createScratchTalos, type ScratchTalos, type ServingTalos } from '../src/testing/ScratchTalos.ts';
import { testWhenProcessesCanBeSuspended }                          from '../src/testing/ToolGuard.ts';
import { waitUntil }                                                from '../src/testing/WaitUntil.ts';

const START_NUMBER = 1;
const LEASE_BOUNDS = {
  leaseMilliseconds:           600,
  renewalIntervalMilliseconds: 150,
  tickMilliseconds:            50,
  tickGapMilliseconds:         200,
  cleanQuitWaitMilliseconds:   300,
} as const;
const AGENT_FOLDER = 'jobs/J-1';
const LINE_FOLDER = 'jobs/J-2/install';
const RENEWER: LeaseRenewer = {
  processId: 4242, startStamp: '1', bootIdentity: 'example-boot', generation: 1
};
/** More renewals than fit in the lease, so an agent that outlives them outlived the lease. */
const RENEWALS_PAST_THE_LEASE = 2 * LEASE_BOUNDS.leaseMilliseconds / LEASE_BOUNDS.renewalIntervalMilliseconds;
const STAYS_UNTIL_STOPPED = 'setInterval(() => undefined, 60000);';

let currentScratchTalos: ScratchTalos | null = null;

beforeEach(() => {
  currentScratchTalos = createScratchTalos();
});

afterEach(async () => {
  await currentScratchTalos?.remove();
});

function scratchTalos(): ScratchTalos {
  if (currentScratchTalos === null) throw new Error('no scratch Talos outside a test');
  return currentScratchTalos;
}

interface Renewals {
  /** The renewals Talos answered so far. */
  readonly answered: () => number;
  readonly stop:     () => void;
}

/** Renews at the interval, as Hephaestus's main loop does, without waiting for an answer. */
function renewEachInterval(serving: ServingTalos): Renewals {
  const frameIds = new Set<number>();
  const timer = setInterval(() => {
    frameIds.add(serving.sendAndGoOn({ kind: 'lease-renewal', renewer: RENEWER }));
  }, LEASE_BOUNDS.renewalIntervalMilliseconds);
  return {
    answered: () => serving.client.received().filter((frame) => frame.kind === 'done' && frameIds.has(frame.frameId)).length,
    stop:     () => clearInterval(timer),
  };
}

async function servingWithAnAgentAndALine(): Promise<ServingTalos> {
  const scratch = scratchTalos();
  const serving = await scratch.serve(START_NUMBER, LEASE_BOUNDS);
  const agentSteps = [{ kind: 'print', line: fakeStartedLineSelectorOf('fake-session') }, { kind: 'await-line' }] as const;
  await serving.send({ kind: 'launch', launch: fakeAgentChildLaunch(scratch.boardFolder, AGENT_FOLDER, 1, agentSteps) });
  await serving.send({ kind: 'launch', launch: scratch.lineLaunch(LINE_FOLDER, 1, STAYS_UNTIL_STOPPED) });
  await waitUntil(() => scratch.childRecordOf(AGENT_FOLDER, 1)?.state === 'running', 'the agent running');
  return serving;
}

test('renewals keep agents running; silence ends them lease-ended and leaves a line running; a later renewal holds the lease again', async () => {
  const scratch = scratchTalos();
  const serving = await servingWithAnAgentAndALine();
  const renewals = renewEachInterval(serving);
  try {
    await waitUntil(() => scratch.talosRecordOf(START_NUMBER)?.lease.standing === 'held', 'the lease held');
    expect(scratch.talosRecordOf(START_NUMBER)?.lease.lastRenewer).toEqual(RENEWER);
    await waitUntil(() => renewals.answered() >= RENEWALS_PAST_THE_LEASE, 'renewals past the lease answered');
    expect(scratch.childRecordOf(AGENT_FOLDER, 1)?.state).toBe('running');
  } finally {
    renewals.stop();
  }

  expect((await scratch.endedRecordOf(AGENT_FOLDER, 1)).end).toMatchObject({ reason: 'lease-ended', exitCode: 0 });
  expect(scratch.talosRecordOf(START_NUMBER)?.lease.standing).toBe('ended');
  expect(scratch.childRecordOf(LINE_FOLDER, 1)?.state).toBe('running');

  expect(await serving.send({ kind: 'lease-renewal', renewer: RENEWER })).toMatchObject({ verdict: 'done' });
  expect(scratch.talosRecordOf(START_NUMBER)?.lease.standing).toBe('held');
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

function waitedPastTheLease(suspendedAtMilliseconds: number): boolean {
  return performance.now() - suspendedAtMilliseconds > 2 * LEASE_BOUNDS.leaseMilliseconds;
}

testWhenProcessesCanBeSuspended('a Talos suspended longer than the lease waits out the grace after it continues, and a renewal in it stops nothing', async () => {
  const scratch = scratchTalos();
  const serving = await servingWithAnAgentAndALine();
  const renewalsBeforeTheSuspension = renewEachInterval(serving);
  try {
    await waitUntil(() => scratch.talosRecordOf(START_NUMBER)?.lease.standing === 'held', 'the lease held');
  } finally {
    renewalsBeforeTheSuspension.stop();
  }
  process.kill(serving.talos.pid, 'SIGSTOP');
  const suspendedAtMilliseconds = performance.now();
  try {
    await waitUntil(() => waitedPastTheLease(suspendedAtMilliseconds), 'twice the lease passed while Talos is suspended');
  } finally {
    process.kill(serving.talos.pid, 'SIGCONT');
  }
  await waitUntil(() => {
    const standing = scratch.talosRecordOf(START_NUMBER)?.lease.standing;
    if (standing === 'ended') throw new Error('the lease ended at the first tick after the continue, with no grace');
    return standing === 'waiting-after-gap';
  }, 'the lease waiting after the gap');

  expect(await serving.send({ kind: 'lease-renewal', renewer: RENEWER })).toMatchObject({ verdict: 'done' });
  expect(scratch.talosRecordOf(START_NUMBER)?.lease.standing).toBe('held');
  const renewalsAfterTheContinue = renewEachInterval(serving);
  try {
    await waitUntil(() => renewalsAfterTheContinue.answered() >= RENEWALS_PAST_THE_LEASE, 'renewals past the lease answered after the continue');
    expect(scratch.childRecordOf(AGENT_FOLDER, 1)?.state).toBe('running');
    expect(scratch.talosRecordOf(START_NUMBER)?.lease.standing).toBe('held');
  } finally {
    renewalsAfterTheContinue.stop();
  }
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
