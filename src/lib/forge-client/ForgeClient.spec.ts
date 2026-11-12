/**
 * Every call of the forge client answers a document or a verdict, never a throw, and each outcome of each call is proven against an answer
 * recorded from a real forge or authored from FORGE_REQUIREMENTS.md; the table below uses every such answer, so none is left unproven. A
 * monitor stream that ends inside an event hands on no half snapshot. The token travels as a bearer on the guarded routes only, and no
 * answer carries it.
 */
import { describe, expect, test } from 'bun:test';

import {
  everyRecordedOverseerAnswerOf,
  recordedOverseerAnswersOf,
  recordedOverseerFetch,
  situationCallShapeOf,
  type OverseerSituation,
  type RecordedOverseerFetch,
} from '../../testing/RecordedAnswers.ts';

import type { OverseerAccess }      from './@types/ForgeClientAnswer.ts';
import type { ForgeControlCommand } from './@types/ForgeControlCommand.ts';
import { forgeClientOf }            from './ForgeClient.ts';

const OVERSEER_URL = 'http://127.0.0.1:4951/';
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';
const ACCESS: OverseerAccess = { overseerUrl: OVERSEER_URL, bearerToken: EXAMPLE_TOKEN };
const SHORT_BOUND_MILLISECONDS = 200;

function overseerFetchOf(situation: OverseerSituation): RecordedOverseerFetch {
  return recordedOverseerFetch(recordedOverseerAnswersOf(situation));
}

function clientOf(overseerFetch: RecordedOverseerFetch) {
  return forgeClientOf({ overseerFetch, requestTimeoutMilliseconds: SHORT_BOUND_MILLISECONDS, streamOpenTimeoutMilliseconds: SHORT_BOUND_MILLISECONDS });
}

async function followedSnapshotsOf(overseerFetch: RecordedOverseerFetch, stopAfterSnapshots: number | null = null) {
  const snapshots: unknown[] = [];
  const follow = clientOf(overseerFetch).followMonitor(ACCESS, (document) => {
    snapshots.push(document);
    if (snapshots.length === stopAfterSnapshots) follow.stop();
  });
  const end = await follow.ended;
  return { end, snapshots, overseerFetch };
}

const PAUSE_COMMAND: ForgeControlCommand = { kind: 'overseer-pause' };

interface OutcomeCase {
  readonly call:      string;
  readonly situation: OverseerSituation;
  readonly callShape: string;
  readonly answerOf:  (overseerFetch: RecordedOverseerFetch) => Promise<unknown>;
  readonly expected:  unknown;
}

const OUTCOME_CASES: readonly OutcomeCase[] = [
  {
    call:      'identityOf',
    situation: 'serving',
    callShape: 'GET /api/identity',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).identityOf(OVERSEER_URL),
    expected:  { verdict: 'answered', document: expect.objectContaining({ application: 'forge', project: 'Example Project' }) },
  },
  {
    call:      'identityOf',
    situation: 'serving-every-contract',
    callShape: 'GET /api/identity',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).identityOf(OVERSEER_URL),
    expected:  {
      verdict:  'answered',
      document: expect.objectContaining({
        identityVersion: 1,
        contracts:       {
          summary: 1, monitor: 1, control: 1, embed: 1
        }
      })
    },
  },
  {
    call:      'identityOf',
    situation: 'stopped',
    callShape: 'GET /api/identity',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).identityOf(OVERSEER_URL),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'identityOf',
    situation: 'starting',
    callShape: 'GET /api/identity',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).identityOf(OVERSEER_URL),
    expected:  { verdict: 'refused', refusal: 'starting', text: null },
  },
  {
    call:      'identityOf',
    situation: 'port-held-by-another-program',
    callShape: 'GET /api/identity',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).identityOf(OVERSEER_URL),
    expected:  { verdict: 'malformed' },
  },
  {
    call:      'summaryOf',
    situation: 'serving',
    callShape: 'GET /api/summary',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).summaryOf(OVERSEER_URL),
    expected:  { verdict: 'answered', document: expect.objectContaining({ summaryVersion: 1, project: 'Example Project' }) },
  },
  {
    call:      'summaryOf',
    situation: 'stopped',
    callShape: 'GET /api/summary',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).summaryOf(OVERSEER_URL),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'summaryOf',
    situation: 'board-unreadable',
    callShape: 'GET /api/summary',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).summaryOf(OVERSEER_URL),
    expected:  { verdict: 'refused', refusal: null, text: null },
  },
  {
    call:      'monitorOf',
    situation: 'serving-every-contract',
    callShape: 'GET /api/monitor with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).monitorOf(ACCESS),
    expected:  { verdict: 'answered', document: expect.objectContaining({ monitorVersion: 1, trackerId: 'example-storefront-7c41' }) },
  },
  {
    call:      'monitorOf',
    situation: 'stopped',
    callShape: 'GET /api/monitor with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).monitorOf(ACCESS),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'monitorOf',
    situation: 'token-rejected',
    callShape: 'GET /api/monitor with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).monitorOf(ACCESS),
    expected:  { verdict: 'unauthorized' },
  },
  {
    call:      'send',
    situation: 'serving-every-contract',
    callShape: 'POST /api/commands with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).send(ACCESS, PAUSE_COMMAND),
    expected:  { verdict: 'answered', outcome: 'done' },
  },
  {
    call:      'send',
    situation: 'nothing-to-change',
    callShape: 'POST /api/commands with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).send(ACCESS, PAUSE_COMMAND),
    expected:  { verdict: 'answered', outcome: 'nothing-to-do' },
  },
  {
    call:      'send',
    situation: 'command-refused',
    callShape: 'POST /api/commands with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).send(ACCESS, { kind: 'machine-agent-limit-set', limit: 64 }),
    expected:  { verdict: 'refused', refusal: 'machine-agent-limit-above-cpus', text: 'The machine agent limit cannot be above the 12 CPUs of this machine.' },
  },
  {
    call:      'send',
    situation: 'token-rejected',
    callShape: 'POST /api/commands with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).send(ACCESS, PAUSE_COMMAND),
    expected:  { verdict: 'unauthorized' },
  },
  {
    call:      'send',
    situation: 'stopped',
    callShape: 'POST /api/commands with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).send(ACCESS, PAUSE_COMMAND),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'sessionCodeOf',
    situation: 'serving-every-contract',
    callShape: 'POST /api/session-codes with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).sessionCodeOf(ACCESS),
    expected:  { verdict: 'answered', code: expect.stringMatching(/^[0-9a-f]{64}$/) },
  },
  {
    call:      'sessionCodeOf',
    situation: 'token-rejected',
    callShape: 'POST /api/session-codes with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).sessionCodeOf(ACCESS),
    expected:  { verdict: 'unauthorized' },
  },
  {
    call:      'sessionCodeOf',
    situation: 'stopped',
    callShape: 'POST /api/session-codes with bearer',
    answerOf:  (overseerFetch) => clientOf(overseerFetch).sessionCodeOf(ACCESS),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'followMonitor',
    situation: 'serving-every-contract',
    callShape: 'STREAM /api/monitor/events with bearer',
    answerOf:  async (overseerFetch) => (await followedSnapshotsOf(overseerFetch, 2)).end,
    expected:  { verdict: 'ended', ending: 'stopped' },
  },
  {
    call:      'followMonitor',
    situation: 'baton-pass',
    callShape: 'STREAM /api/monitor/events with bearer',
    answerOf:  async (overseerFetch) => (await followedSnapshotsOf(overseerFetch)).end,
    expected:  { verdict: 'ended', ending: 'closed' },
  },
  {
    call:      'followMonitor',
    situation: 'snapshot-unreadable',
    callShape: 'STREAM /api/monitor/events with bearer',
    answerOf:  async (overseerFetch) => (await followedSnapshotsOf(overseerFetch)).end,
    expected:  { verdict: 'ended', ending: 'closed' },
  },
  {
    call:      'followMonitor',
    situation: 'connection-broken',
    callShape: 'STREAM /api/monitor/events with bearer',
    answerOf:  async (overseerFetch) => (await followedSnapshotsOf(overseerFetch)).end,
    expected:  { verdict: 'ended', ending: 'broken' },
  },
  {
    call:      'followMonitor',
    situation: 'token-rejected',
    callShape: 'STREAM /api/monitor/events with bearer',
    answerOf:  async (overseerFetch) => (await followedSnapshotsOf(overseerFetch)).end,
    expected:  { verdict: 'unauthorized' },
  },
  {
    call:      'followMonitor',
    situation: 'stopped',
    callShape: 'STREAM /api/monitor/events with bearer',
    answerOf:  async (overseerFetch) => (await followedSnapshotsOf(overseerFetch)).end,
    expected:  { verdict: 'unreachable' },
  },
];

describe('each outcome of each call', () => {
  for (const outcomeCase of OUTCOME_CASES) {
    test(`${outcomeCase.call} answers ${JSON.stringify(outcomeCase.expected)} where the forge is ${outcomeCase.situation}`, async () => {
      expect(await outcomeCase.answerOf(overseerFetchOf(outcomeCase.situation))).toEqual(outcomeCase.expected);
    });
  }

  test('is proven by exactly the recorded and authored answers, each used once', () => {
    const provenCallShapes   = OUTCOME_CASES.map(({ situation, callShape }) => situationCallShapeOf(situation, callShape));
    const recordedCallShapes = everyRecordedOverseerAnswerOf().map(({ callShape }) => callShape);
    expect([...provenCallShapes].sort()).toEqual([...recordedCallShapes].sort());
  });
});

describe('following a monitor stream', () => {
  test('hands on each whole snapshot in order, passing over the heartbeat, and closes the stream when stopped', async () => {
    const { snapshots, overseerFetch } = await followedSnapshotsOf(overseerFetchOf('serving-every-contract'), 2);
    expect(snapshots).toEqual([
      expect.objectContaining({ monitorVersion: 1, attention: [expect.objectContaining({ idText: '#015' }), expect.objectContaining({ idText: 'E2' })] }),
      expect.objectContaining({ monitorVersion: 1, attention: [expect.objectContaining({ idText: '#015' })] }),
    ]);
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });

  test('hands on no half snapshot when the stream ends inside an event', async () => {
    const { end, snapshots } = await followedSnapshotsOf(overseerFetchOf('baton-pass'));
    expect(snapshots).toEqual([expect.objectContaining({ monitorVersion: 1, trackerId: 'example-storefront-7c41' })]);
    expect(end).toEqual({ verdict: 'ended', ending: 'closed' });
  });

  test('passes over an event whose snapshot cannot be read and hands on the next whole one', async () => {
    const { snapshots } = await followedSnapshotsOf(overseerFetchOf('snapshot-unreadable'));
    expect(snapshots).toEqual([expect.objectContaining({ monitorVersion: 1, trackerId: 'example-storefront-7c41' })]);
  });

  test('hands on the snapshots it read before the connection broke', async () => {
    const { snapshots, overseerFetch } = await followedSnapshotsOf(overseerFetchOf('connection-broken'));
    expect(snapshots).toHaveLength(1);
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });

  test('ends stopped with no snapshot when stopped before the stream opens, and leaves no stream open', async () => {
    const overseerFetch = overseerFetchOf('serving-every-contract');
    const snapshots: unknown[] = [];
    const follow = clientOf(overseerFetch).followMonitor(ACCESS, (document) => snapshots.push(document));
    follow.stop();
    expect(await follow.ended).toEqual({ verdict: 'ended', ending: 'stopped' });
    expect(snapshots).toEqual([]);
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });

  test('ends stopped when stopped while the stream cannot be opened', async () => {
    const follow = clientOf(overseerFetchOf('stopped')).followMonitor(ACCESS, () => undefined);
    follow.stop();
    expect(await follow.ended).toEqual({ verdict: 'ended', ending: 'stopped' });
  });
});

describe('the token', () => {
  test('travels as a bearer on every guarded route and on no open one', async () => {
    const servingFetch = overseerFetchOf('serving-every-contract');
    const client       = clientOf(servingFetch);
    await client.identityOf(OVERSEER_URL);
    await client.monitorOf(ACCESS);
    await client.sessionCodeOf(ACCESS);
    await client.send(ACCESS, PAUSE_COMMAND);
    const todaysFetch = overseerFetchOf('serving');
    await clientOf(todaysFetch).summaryOf(OVERSEER_URL);
    expect([...servingFetch.callsAnswered(), ...todaysFetch.callsAnswered()].map(({ callShape, bearerToken }) => [callShape, bearerToken])).toEqual([
      ['GET /api/identity', null],
      ['GET /api/monitor with bearer', EXAMPLE_TOKEN],
      ['POST /api/session-codes with bearer', EXAMPLE_TOKEN],
      ['POST /api/commands with bearer', EXAMPLE_TOKEN],
      ['GET /api/summary', null],
    ]);
  });

  test('is carried by no answer of any outcome', async () => {
    const answers = await Promise.all(OUTCOME_CASES.map(async (outcomeCase) => outcomeCase.answerOf(overseerFetchOf(outcomeCase.situation))));
    expect(JSON.stringify(answers)).not.toContain(EXAMPLE_TOKEN);
  });
});

describe('a command', () => {
  test('is sent as the forge spells each kind of control contract 1', async () => {
    const commands: readonly ForgeControlCommand[] = [
      { kind: 'overseer-pause' },
      { kind: 'overseer-resume' },
      { kind: 'overseer-stop', now: false },
      { kind: 'overseer-restart', now: true },
      { kind: 'concurrency-set', limit: 4 },
      { kind: 'job-stop-all', mode: 'wind-down' },
      { kind: 'machine-agent-limit-set', limit: 8 },
    ];
    const overseerFetch = overseerFetchOf('serving-every-contract');
    for (const command of commands) await clientOf(overseerFetch).send(ACCESS, command);
    expect(overseerFetch.callsAnswered().map(({ jsonBody }) => jsonBody)).toEqual([
      '{"kind":"overseer-pause"}',
      '{"kind":"overseer-resume"}',
      '{"kind":"overseer-stop","now":false}',
      '{"kind":"overseer-restart","now":true}',
      '{"kind":"concurrency-set","limit":4}',
      '{"kind":"job-stop-all","mode":"wind-down"}',
      '{"kind":"machine-agent-limit-set","limit":8}',
    ]);
  });
});
