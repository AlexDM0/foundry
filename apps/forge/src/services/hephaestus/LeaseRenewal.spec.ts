/**
 * The lease renewal on a fake timer, clock, connection and pass progress: a renewal is earned by progress, so a pass in flight at two ticks
 * withholds it; a late tick or a clock moved back renews, since a pass caught by a sleep must not cost the agents their lease; and nothing
 * throws into the main loop.
 */
import {
  afterEach,
  beforeEach,
  expect,
  jest,
  test
} from 'bun:test';

import type { DoneFrame }                              from '../../lib/talos/@types/TalosFrame.ts';
import { type LeaseRenewalRequest, startLeaseRenewal } from './LeaseRenewal.ts';
import type { TalosConnection, TalosFrameRequest }     from './TalosConnection.ts';

const INTERVAL_MILLISECONDS = 150;
const TICK_GAP_MILLISECONDS = 200;
const START_WALL_MILLISECONDS = 1_000_000;
const RENEWER = {
  processId: 4242, startStamp: '1', bootIdentity: 'example-boot', generation: 1
};

interface FakeTalos {
  readonly connection: TalosConnection;
  readonly sent:       TalosFrameRequest[];
  answer:              DoneFrame | 'no-answer';
}

function fakeTalos(): FakeTalos {
  const fake: FakeTalos = {
    sent:       [],
    answer:     { kind: 'done', frameId: 1, verdict: 'done' },
    connection: {
      send: (frame) => {
        fake.sent.push(frame);
        return Promise.resolve(fake.answer);
      },
      onState: () => undefined,
      onClose: () => undefined,
      close:   () => undefined,
    },
  };
  return fake;
}

let wallNowMilliseconds = START_WALL_MILLISECONDS;
let passInFlight: number | null = null;
let logged: string[] = [];
let renewedAt: number[] = [];
let stopRenewal = (): void => undefined;

beforeEach(() => {
  jest.useFakeTimers();
  wallNowMilliseconds = START_WALL_MILLISECONDS;
  passInFlight = null;
  logged = [];
  renewedAt = [];
});

afterEach(() => {
  stopRenewal();
  jest.useRealTimers();
});

function started(connection: TalosConnection | null, changes: Partial<LeaseRenewalRequest> = {}): void {
  const renewal = startLeaseRenewal({
    connection:           () => connection,
    renewer:              RENEWER,
    intervalMilliseconds: INTERVAL_MILLISECONDS,
    tickGapMilliseconds:  TICK_GAP_MILLISECONDS,
    passProgress:         { passInFlight: () => passInFlight },
    wallNowMilliseconds:  () => wallNowMilliseconds,
    log:                  (sentence) => logged.push(sentence),
    onRenewed:            (renewedAtWallMilliseconds) => renewedAt.push(renewedAtWallMilliseconds),
    ...changes,
  });
  stopRenewal = renewal.stop;
}

/** Every promise the renewal chained on the fake connection's answer has settled. */
async function renewalsSettled(): Promise<void> {
  for (const _turn of [1, 2, 3, 4, 5]) await Promise.resolve();
}

/** One tick of the timer, the wall clock moved by `wallStepMilliseconds`. */
async function tick(wallStepMilliseconds = INTERVAL_MILLISECONDS): Promise<void> {
  wallNowMilliseconds += wallStepMilliseconds;
  jest.advanceTimersByTime(INTERVAL_MILLISECONDS);
  await renewalsSettled();
}

test('it renews once at start, before the first tick', async () => {
  const talos = fakeTalos();
  started(talos.connection);
  await renewalsSettled();

  expect(talos.sent).toEqual([{ kind: 'lease-renewal', renewer: RENEWER }]);
  expect(renewedAt).toEqual([START_WALL_MILLISECONDS]);
});

test('an idle loop renews at every tick', async () => {
  const talos = fakeTalos();
  started(talos.connection);
  for (const _tick of [1, 2, 3]) await tick();

  expect(talos.sent).toHaveLength(4);
  expect(logged).toEqual([]);
});

test('a pass that ends between two ticks renews, and so does the next pass', async () => {
  const talos = fakeTalos();
  started(talos.connection);
  passInFlight = 1;
  await tick();
  passInFlight = null;
  await tick();
  passInFlight = 2;
  await tick();

  expect(talos.sent).toHaveLength(4);
});

test('the same pass at two ticks withholds the renewal, and the first tick after it ended renews', async () => {
  const talos = fakeTalos();
  started(talos.connection);
  passInFlight = 3;
  await tick();
  await tick();
  await tick();
  expect(talos.sent).toHaveLength(2);

  passInFlight = null;
  await tick();
  expect(talos.sent).toHaveLength(3);
});

test('a withheld streak logs once, and a new streak logs again', async () => {
  const talos = fakeTalos();
  started(talos.connection);
  passInFlight = 3;
  for (const _tick of [1, 2, 3, 4]) await tick();
  passInFlight = 4;
  for (const _tick of [1, 2, 3]) await tick();

  expect(logged).toEqual([
    'The lease renewal is withheld: pass 3 has run for more than one renewal interval.',
    'The lease renewal is withheld: pass 4 has run for more than one renewal interval.',
  ]);
});

test('a late tick renews though the same pass is in flight, and the comparison starts afresh from it', async () => {
  const talos = fakeTalos();
  started(talos.connection);
  passInFlight = 5;
  await tick();
  await tick(INTERVAL_MILLISECONDS + TICK_GAP_MILLISECONDS + 1);
  expect(talos.sent).toHaveLength(3);

  await tick();
  expect(talos.sent).toHaveLength(3);
});

test('a tick on a clock moved back is a gap and renews', async () => {
  const talos = fakeTalos();
  started(talos.connection);
  passInFlight = 6;
  await tick();
  await tick(-INTERVAL_MILLISECONDS);

  expect(talos.sent).toHaveLength(3);
});

test('no connection renews nothing and throws nothing; the renewal goes on once there is one', async () => {
  let connection: TalosConnection | null = null;
  started(null, { connection: () => connection });
  await renewalsSettled();
  await tick();
  expect(renewedAt).toEqual([]);
  expect(logged).toEqual(['The lease renewal found no connection to Talos.', 'The lease renewal found no connection to Talos.']);

  const talos = fakeTalos();
  ({ connection } = talos);
  await tick();
  expect(talos.sent).toHaveLength(1);
});

test('onRenewed runs only on done: an unanswered or refused renewal is logged and waits for the next tick', async () => {
  const talos = fakeTalos();
  talos.answer = 'no-answer';
  started(talos.connection);
  await renewalsSettled();
  talos.answer = {
    kind: 'done', frameId: 2, verdict: 'refused', reason: 'quitting'
  };
  await tick();
  expect(renewedAt).toEqual([]);
  expect(logged).toEqual(['Talos did not answer a lease renewal.', 'Talos refused a lease renewal: quitting.']);

  talos.answer = { kind: 'done', frameId: 3, verdict: 'done' };
  await tick();
  expect(renewedAt).toEqual([START_WALL_MILLISECONDS + 2 * INTERVAL_MILLISECONDS]);
});

test('a log or an onRenewed hook that throws stops no renewal', async () => {
  const talos = fakeTalos();
  started(talos.connection, {
    log: () => {
      throw new Error('the log refused');
    },
    onRenewed: () => {
      throw new Error('the hook refused');
    },
  });
  passInFlight = 7;
  await tick();
  await tick();
  passInFlight = null;
  await tick();

  expect(talos.sent).toHaveLength(3);
});

test('stop ends the renewals', async () => {
  const talos = fakeTalos();
  started(talos.connection);
  await renewalsSettled();
  stopRenewal();
  await tick();

  expect(talos.sent).toHaveLength(1);
});
