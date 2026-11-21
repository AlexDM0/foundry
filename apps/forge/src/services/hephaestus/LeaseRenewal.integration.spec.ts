/**
 * The lease renewal against the Talos binary on short bounds: lease 600, interval 150, tick 50, gap 200 milliseconds. What matters: an idle
 * Hephaestus keeps its agent running past twice the lease; a pass that never ends earns no renewal, so the agent ends `lease-ended` within
 * the lease and two intervals of the last renewal; and a main thread blocked longer than the lease renews nothing, the agent ends
 * `lease-ended`, and the first tick after the block, a late one, holds the lease again.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from '../../testing/ChildProcessCaseTimeout.ts';
import { fakeStartedLineSelectorOf }               from '../../testing/FakeAgentAdapter.ts';
import { fakeAgentChildLaunch }                    from '../../testing/FakeAgentChildLaunch.ts';
import { nativePlatformPorts }                     from '../../testing/NativePlatformPorts.ts';
import {
  createScratchTalos,
  SCRATCH_TALOS_SECRET,
  type ScratchTalos,
  type ServingTalos
} from '../../testing/ScratchTalos.ts';
import { waitUntil }                            from '../../testing/WaitUntil.ts';
import { type LeaseRenewal, startLeaseRenewal } from './LeaseRenewal.ts';
import { connectToTalos, type TalosConnection } from './TalosConnection.ts';

const START_NUMBER = 1;
const LEASE_BOUNDS = {
  leaseMilliseconds:           600,
  renewalIntervalMilliseconds: 150,
  tickMilliseconds:            50,
  tickGapMilliseconds:         200,
  cleanQuitWaitMilliseconds:   300,
} as const;
const AGENT_FOLDER = 'jobs/J-1';
const RENEWER = {
  processId: 4242, startStamp: '1', bootIdentity: 'example-boot', generation: 1
};
/** More renewals than fit in the lease, so an agent that outlives them outlived the lease. */
const RENEWALS_PAST_TWICE_THE_LEASE = 2 * 2 * LEASE_BOUNDS.leaseMilliseconds / LEASE_BOUNDS.renewalIntervalMilliseconds;
const FRAME_TIMEOUT_MILLISECONDS = 2000;
/** Longer than the lease, so a main thread held by it renews nothing for longer than the lease lasts. */
const MAIN_THREAD_BLOCK = ['/bin/sleep', '1'];

let currentScratchTalos: ScratchTalos | null = null;
let currentRenewal: LeaseRenewal | null = null;
let currentConnection: TalosConnection | null = null;

beforeEach(() => {
  currentScratchTalos = createScratchTalos();
});

afterEach(async () => {
  currentRenewal?.stop();
  currentConnection?.close();
  await currentScratchTalos?.remove();
});

function scratchTalos(): ScratchTalos {
  if (currentScratchTalos === null) throw new Error('no scratch Talos outside a test');
  return currentScratchTalos;
}

interface ServingWithAnAgent {
  readonly serving:    ServingTalos;
  readonly connection: TalosConnection;
}

async function servingWithAnAgent(): Promise<ServingWithAnAgent> {
  const scratch = scratchTalos();
  const serving = await scratch.serve(START_NUMBER, LEASE_BOUNDS);
  const agentSteps = [{ kind: 'print', line: fakeStartedLineSelectorOf('fake-session') }, { kind: 'await-line' }] as const;
  await serving.send({ kind: 'launch', launch: fakeAgentChildLaunch(scratch.boardFolder, AGENT_FOLDER, 1, agentSteps) });
  await waitUntil(() => scratch.childRecordOf(AGENT_FOLDER, 1)?.state === 'running', 'the agent running');
  const outcome = await connectToTalos({
    endpoint:                 scratch.endpointOf(START_NUMBER),
    secret:                   SCRATCH_TALOS_SECRET,
    localEndpoint:            nativePlatformPorts().localEndpoint,
    frameTimeoutMilliseconds: FRAME_TIMEOUT_MILLISECONDS,
  });
  if (outcome.verdict !== 'welcomed') throw new Error(`Talos did not welcome the renewal's connection: ${outcome.verdict}`);
  currentConnection = outcome.connection;
  return { serving, connection: outcome.connection };
}

interface StartedRenewal {
  /** The wall time of each renewal Talos answered `done`. */
  readonly renewedAt: number[];
  readonly logged:    string[];
}

function renewing(connection: TalosConnection, passInFlight: () => number | null): StartedRenewal {
  const renewedAt: number[] = [];
  const logged: string[] = [];
  currentRenewal = startLeaseRenewal({
    connection:           () => connection,
    renewer:              RENEWER,
    intervalMilliseconds: LEASE_BOUNDS.renewalIntervalMilliseconds,
    tickGapMilliseconds:  LEASE_BOUNDS.tickGapMilliseconds,
    passProgress:         { passInFlight },
    wallNowMilliseconds:  () => Date.now(),
    log:                  (sentence) => logged.push(sentence),
    onRenewed:            (renewedAtWallMilliseconds) => renewedAt.push(renewedAtWallMilliseconds),
  });
  return { renewedAt, logged };
}

test('an idle Hephaestus keeps its agent running past twice the lease', async () => {
  const scratch = scratchTalos();
  const { serving, connection } = await servingWithAnAgent();
  const renewal = renewing(connection, () => null);

  await waitUntil(() => renewal.renewedAt.length >= RENEWALS_PAST_TWICE_THE_LEASE, 'renewals past twice the lease');

  expect(scratch.childRecordOf(AGENT_FOLDER, 1)?.state).toBe('running');
  expect(scratch.talosRecordOf(START_NUMBER)?.lease).toEqual({ standing: 'held', lastRenewer: RENEWER });
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a pass that never ends earns no renewal, and the agent ends lease-ended within the lease and two intervals of the last renewal', async () => {
  const scratch = scratchTalos();
  const { serving, connection } = await servingWithAnAgent();
  const renewal = renewing(connection, () => 1);

  const endedRecord = await scratch.endedRecordOf(AGENT_FOLDER, 1);
  const endSeenAtWallMilliseconds = Date.now();

  expect(endedRecord.end).toMatchObject({ reason: 'lease-ended' });
  expect(renewal.renewedAt).toHaveLength(1);
  const [lastRenewedAt = 0] = renewal.renewedAt;
  expect(endSeenAtWallMilliseconds - lastRenewedAt).toBeLessThanOrEqual(LEASE_BOUNDS.leaseMilliseconds + 2 * LEASE_BOUNDS.renewalIntervalMilliseconds);
  expect(renewal.logged).toEqual(['The lease renewal is withheld: pass 1 has run for more than one renewal interval.']);
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

test('a main thread blocked longer than the lease ends the agent lease-ended, and the first tick after the block holds the lease again', async () => {
  const scratch = scratchTalos();
  const { serving, connection } = await servingWithAnAgent();
  const renewal = renewing(connection, () => null);
  await waitUntil(() => scratch.talosRecordOf(START_NUMBER)?.lease.standing === 'held', 'the lease held');
  const renewalsBeforeTheBlock = renewal.renewedAt.length;

  Bun.spawnSync(MAIN_THREAD_BLOCK);

  expect((await scratch.endedRecordOf(AGENT_FOLDER, 1)).end).toMatchObject({ reason: 'lease-ended' });
  await waitUntil(() => renewal.renewedAt.length > renewalsBeforeTheBlock, 'a renewal after the block answered');
  await waitUntil(() => scratch.talosRecordOf(START_NUMBER)?.lease.standing === 'held', 'the lease held again');
  expect(await serving.quit()).toBe(0);
}, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
