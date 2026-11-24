/**
 * Every call of the forge client answers a document or a verdict, never a throw, and each outcome of each call is proven against an answer
 * recorded for a forge at the version this client supports, or from a program that is no forge; the table below uses every such answer of
 * each situation of the forge, so none is left unproven. A monitor stream that ends inside an event hands on no half snapshot, and one
 * whose snapshot handler throws is closed all the same. The token travels as a bearer on the guarded routes only, and no answer carries
 * it. Every endpoint is called at its versioned path, at the version forge's compatibility registry serves the forge version this client
 * supports, and `/api/versions` at its one path, which a forge before system versions refuses.
 */
import { describe, expect, test } from 'bun:test';

import type { ForgeControlCommand } from 'forge-contracts/ForgeControlCommand';
import {
  BOARD_SITUATIONS,
  everyRecordedHephaestusAnswerOf,
  HEPHAESTUS_SITUATIONS,
  recordedBoardAnswersOf,
  recordedHephaestusAnswersOf,
  recordedHephaestusFetch,
  situationCallShapeOf,
  recordedTicketDocumentsAnswersOf,
  recordedVersionsAnswersOf,
  TICKET_DOCUMENTS_SITUATIONS,
  type BoardSituation,
  type HephaestusSituation,
  type RecordedHephaestusFetch,
  type TicketDocumentsSituation,
} from '../../testing/RecordedAnswers.ts';

import type { ForgeStreamEvent, HephaestusAccess, HephaestusAddress }         from './@types/ForgeClientAnswer.ts';
import { forgeClientOf, forgeEndpointVersionOf, type HephaestusEndpointName } from './ForgeClient.ts';
import { SUPPORTED_FORGE_VERSION }                                            from './constants/SupportedForgeVersions.ts';

const HEPHAESTUS_URL = 'http://127.0.0.1:4951/';
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';
const ADDRESS: HephaestusAddress = { hephaestusUrl: HEPHAESTUS_URL };
const ACCESS: HephaestusAccess = { ...ADDRESS, bearerToken: EXAMPLE_TOKEN };
const SHORT_BOUND_MILLISECONDS = 200;

function hephaestusFetchOf(situation: HephaestusSituation): RecordedHephaestusFetch {
  return recordedHephaestusFetch(recordedHephaestusAnswersOf(situation));
}

function clientOf(hephaestusFetch: RecordedHephaestusFetch) {
  return forgeClientOf({ hephaestusFetch, requestTimeoutMilliseconds: SHORT_BOUND_MILLISECONDS, streamOpenTimeoutMilliseconds: SHORT_BOUND_MILLISECONDS });
}

async function followedSnapshotsOf(hephaestusFetch: RecordedHephaestusFetch, stopAfterSnapshots: number | null = null) {
  const snapshots: unknown[] = [];
  const follow = clientOf(hephaestusFetch).followMonitor(ACCESS, (document) => {
    snapshots.push(document);
    if (snapshots.length === stopAfterSnapshots) follow.stop();
  });
  const end = await follow.ended;
  return { end, snapshots, hephaestusFetch };
}

const PAUSE_COMMAND: ForgeControlCommand = { kind: 'hephaestus-pause' };

/** The forge's refusal while it cannot read its board's files, as recorded. */
const READ_FAILED = {
  verdict: 'refused',
  refusal: 'read-failed',
  text:    'Hephaestus could not read the board\'s files: one of them is missing or cannot be read.',
} as const;

/** The machine limit the recorded forge was lowered to, and its CPU count. */
const LOWERED_MACHINE_LIMIT = 4;
const RECORDED_CPU_COUNT = 10;

interface OutcomeCase {
  readonly call:      string;
  readonly situation: HephaestusSituation;
  readonly callShape: string;
  readonly answerOf:  (hephaestusFetch: RecordedHephaestusFetch) => Promise<unknown>;
  readonly expected:  unknown;
}

/** What a forge at the version this client supports answers at `/api/versions`. */
const FIRST_OF_THE_SUPPORTED_MAJOR = { major: SUPPORTED_FORGE_VERSION.major, minor: 0 };
const SUPPORTED_FORGE_VERSIONS = { current: SUPPORTED_FORGE_VERSION, minimumSupported: FIRST_OF_THE_SUPPORTED_MAJOR };
/** The version the ahead forge was recorded at: one minor past the one this client supports. */
const ONE_MINOR_AHEAD = { major: SUPPORTED_FORGE_VERSION.major, minor: SUPPORTED_FORGE_VERSION.minor + 1 };

const OUTCOME_CASES: readonly OutcomeCase[] = [
  ...(['serving', 'serving-every-contract', 'starting'] as const).map((situation): OutcomeCase => ({
    call:      'versionsOf',
    situation,
    callShape: 'GET /api/versions',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).versionsOf(HEPHAESTUS_URL),
    expected:  { verdict: 'answered', document: SUPPORTED_FORGE_VERSIONS },
  })),
  ...(['stopped', 'not-answering'] as const).map((situation): OutcomeCase => ({
    call:      'versionsOf',
    situation,
    callShape: 'GET /api/versions',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).versionsOf(HEPHAESTUS_URL),
    expected:  { verdict: 'unreachable' },
  })),
  {
    call:      'versionsOf',
    situation: 'port-held-by-another-program',
    callShape: 'GET /api/versions',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).versionsOf(HEPHAESTUS_URL),
    expected:  { verdict: 'malformed' },
  },
  {
    call:      'identityOf',
    situation: 'serving',
    callShape: 'GET /api/v1/identity',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).identityOf(ADDRESS),
    expected:  { verdict: 'answered', document: expect.objectContaining({ application: 'forge', project: 'Example Project' }) },
  },
  {
    call:      'identityOf',
    situation: 'serving-every-contract',
    callShape: 'GET /api/v1/identity',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).identityOf(ADDRESS),
    expected:  {
      verdict:  'answered',
      document: expect.objectContaining({
        identityVersion: 1,
        contracts:       { summary: 3, monitor: 6, control: 3 }
      })
    },
  },
  {
    call:      'identityOf',
    situation: 'stopped',
    callShape: 'GET /api/v1/identity',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).identityOf(ADDRESS),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'identityOf',
    situation: 'not-answering',
    callShape: 'GET /api/v1/identity',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).identityOf(ADDRESS),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'identityOf',
    situation: 'starting',
    callShape: 'GET /api/v1/identity',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).identityOf(ADDRESS),
    expected:  { verdict: 'refused', refusal: 'starting', text: null },
  },
  {
    call:      'identityOf',
    situation: 'port-held-by-another-program',
    callShape: 'GET /api/v1/identity',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).identityOf(ADDRESS),
    expected:  { verdict: 'malformed' },
  },
  {
    call:      'summaryOf',
    situation: 'serving',
    callShape: 'GET /api/v3/summary',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).summaryOf(ADDRESS),
    expected:  { verdict: 'answered', document: expect.objectContaining({ summaryVersion: 3, project: 'Example Project' }) },
  },
  {
    call:      'summaryOf',
    situation: 'stopped',
    callShape: 'GET /api/v3/summary',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).summaryOf(ADDRESS),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'summaryOf',
    situation: 'board-unreadable',
    callShape: 'GET /api/v3/summary',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).summaryOf(ADDRESS),
    expected:  READ_FAILED,
  },
  {
    call:      'summaryOf',
    situation: 'port-held-by-another-program',
    callShape: 'GET /api/v3/summary',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).summaryOf(ADDRESS),
    expected:  { verdict: 'malformed' },
  },
  {
    call:      'monitorOf',
    situation: 'serving-every-contract',
    callShape: 'GET /api/v5/monitor with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).monitorOf(ACCESS),
    expected:  { verdict: 'answered', document: expect.objectContaining({ monitorVersion: 6, trackerId: 'example-storefront-7c41' }) },
  },
  {
    call:      'monitorOf',
    situation: 'stopped',
    callShape: 'GET /api/v5/monitor with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).monitorOf(ACCESS),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'monitorOf',
    situation: 'token-rejected',
    callShape: 'GET /api/v5/monitor with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).monitorOf(ACCESS),
    expected:  { verdict: 'unauthorized' },
  },
  {
    call:      'monitorOf',
    situation: 'board-unreadable',
    callShape: 'GET /api/v5/monitor with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).monitorOf(ACCESS),
    expected:  READ_FAILED,
  },
  {
    call:      'monitorOf',
    situation: 'port-held-by-another-program',
    callShape: 'GET /api/v5/monitor with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).monitorOf(ACCESS),
    expected:  { verdict: 'malformed' },
  },
  {
    call:      'send',
    situation: 'serving-every-contract',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).send(ACCESS, PAUSE_COMMAND),
    expected:  { verdict: 'answered', outcome: 'done' },
  },
  {
    call:      'send',
    situation: 'nothing-to-change',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).send(ACCESS, PAUSE_COMMAND),
    expected:  { verdict: 'answered', outcome: 'nothing-to-do' },
  },
  {
    call:      'send',
    situation: 'command-refused',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).send(ACCESS, { kind: 'machine-agent-limit-set', limit: 64 }),
    expected:  {
      verdict: 'refused',
      refusal: 'machine-agent-limit-above-cpus',
      text:    `A machine agent limit of 64 is above the ${RECORDED_CPU_COUNT} CPUs this machine has, so nothing was written.`,
    },
  },
  {
    call:      'send',
    situation: 'token-rejected',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).send(ACCESS, PAUSE_COMMAND),
    expected:  { verdict: 'unauthorized' },
  },
  {
    call:      'send',
    situation: 'stopped',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).send(ACCESS, PAUSE_COMMAND),
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'send',
    situation: 'port-held-by-another-program',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).send(ACCESS, PAUSE_COMMAND),
    expected:  { verdict: 'malformed' },
  },
  {
    call:      'followMonitor',
    situation: 'serving-every-contract',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch, 2)).end,
    expected:  { verdict: 'ended', ending: 'stopped' },
  },
  {
    call:      'followMonitor',
    situation: 'restart',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch)).end,
    expected:  { verdict: 'ended', ending: 'closed' },
  },
  {
    call:      'followMonitor',
    situation: 'snapshot-unreadable',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch)).end,
    expected:  { verdict: 'ended', ending: 'closed' },
  },
  {
    call:      'followMonitor',
    situation: 'stream-cut-inside-event',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch)).end,
    expected:  { verdict: 'ended', ending: 'closed' },
  },
  {
    call:      'followMonitor',
    situation: 'connection-broken',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch)).end,
    expected:  { verdict: 'ended', ending: 'broken' },
  },
  {
    call:      'followMonitor',
    situation: 'machine-limit-lowered',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch, 1)).snapshots,
    expected:  [expect.objectContaining({ concurrency: expect.objectContaining({ machineLimit: LOWERED_MACHINE_LIMIT, machineAgentsInFlight: 0 }) })],
  },
  {
    call:      'followMonitor',
    situation: 'token-rejected',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch)).end,
    expected:  { verdict: 'unauthorized' },
  },
  {
    call:      'followMonitor',
    situation: 'stopped',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch)).end,
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'followMonitor',
    situation: 'not-answering',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch)).end,
    expected:  { verdict: 'unreachable' },
  },
  {
    call:      'followMonitor',
    situation: 'board-unreadable',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch, 1)).snapshots,
    expected:  [expect.objectContaining({ monitorVersion: 6, trackerId: 'example-storefront-7c41' })],
  },
  {
    call:      'followMonitor',
    situation: 'port-held-by-another-program',
    callShape: 'STREAM /api/v5/monitor/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedSnapshotsOf(hephaestusFetch)).end,
    expected:  { verdict: 'malformed' },
  },
];

describe('each outcome of each call', () => {
  for (const outcomeCase of OUTCOME_CASES) {
    test(`${outcomeCase.call} answers ${JSON.stringify(outcomeCase.expected)} where the forge is ${outcomeCase.situation}`, async () => {
      expect(await outcomeCase.answerOf(hephaestusFetchOf(outcomeCase.situation))).toEqual(outcomeCase.expected);
    });
  }

  test('is proven by exactly the recorded answers of the forge\'s situations, each used once', () => {
    const provenCallShapes   = OUTCOME_CASES.map(({ situation, callShape }) => situationCallShapeOf(situation, callShape));
    const recordedCallShapes = everyRecordedHephaestusAnswerOf().map(({ callShape }) => callShape)
      .filter((callShape) => HEPHAESTUS_SITUATIONS.some((situation) => callShape.startsWith(situationCallShapeOf(situation, ''))));
    expect([...provenCallShapes].sort()).toEqual([...recordedCallShapes].sort());
  });
});

describe('following a monitor stream', () => {
  test('hands on each whole snapshot in order, passing over the heartbeat, and closes the stream when stopped', async () => {
    const { snapshots, hephaestusFetch } = await followedSnapshotsOf(hephaestusFetchOf('serving-every-contract'), 2);
    expect(snapshots).toEqual([
      expect.objectContaining({ monitorVersion: 6, concurrency: expect.objectContaining({ limit: 2 }) }),
      expect.objectContaining({ monitorVersion: 6, concurrency: expect.objectContaining({ limit: 3 }) }),
    ]);
    expect(hephaestusFetch.streamsLeftOpen()).toBe(0);
  });

  test('hands on no half snapshot when the stream ends inside an event', async () => {
    const { end, snapshots } = await followedSnapshotsOf(hephaestusFetchOf('stream-cut-inside-event'));
    expect(snapshots).toEqual([expect.objectContaining({ monitorVersion: 1, trackerId: 'example-storefront-7c41' })]);
    expect(end).toEqual({ verdict: 'ended', ending: 'closed' });
  });

  test('passes over an event whose snapshot cannot be read and hands on the next whole one', async () => {
    const { snapshots } = await followedSnapshotsOf(hephaestusFetchOf('snapshot-unreadable'));
    expect(snapshots).toEqual([expect.objectContaining({ monitorVersion: 1, trackerId: 'example-storefront-7c41' })]);
  });

  test('hands on the snapshots it read before the connection broke', async () => {
    const { snapshots, hephaestusFetch } = await followedSnapshotsOf(hephaestusFetchOf('connection-broken'));
    expect(snapshots).toHaveLength(1);
    expect(hephaestusFetch.streamsLeftOpen()).toBe(0);
  });

  test('ends stopped with no snapshot when stopped before the stream opens, and leaves no stream open', async () => {
    const hephaestusFetch = hephaestusFetchOf('serving-every-contract');
    const snapshots: unknown[] = [];
    const follow = clientOf(hephaestusFetch).followMonitor(ACCESS, (document) => snapshots.push(document));
    follow.stop();
    expect(await follow.ended).toEqual({ verdict: 'ended', ending: 'stopped' });
    expect(snapshots).toEqual([]);
    expect(hephaestusFetch.streamsLeftOpen()).toBe(0);
  });

  test('closes the stream and rejects with the handler\'s throw when the snapshot handler throws', async () => {
    const hephaestusFetch = hephaestusFetchOf('serving-every-contract');
    const handlerFailure = new Error('The snapshot handler failed.');
    const follow = clientOf(hephaestusFetch).followMonitor(ACCESS, () => {
      throw handlerFailure;
    });
    await expect(follow.ended).rejects.toBe(handlerFailure);
    expect(hephaestusFetch.streamsLeftOpen()).toBe(0);
  });

  test('ends stopped when stopped while the stream cannot be opened', async () => {
    const follow = clientOf(hephaestusFetchOf('stopped')).followMonitor(ACCESS, () => undefined);
    follow.stop();
    expect(await follow.ended).toEqual({ verdict: 'ended', ending: 'stopped' });
  });
});

describe('the paths a Hephaestus is called at', () => {
  test('are /api/versions for its versions, and each endpoint at the version this client knows, for a forge ahead of it too', async () => {
    const versionedFetch = recordedHephaestusFetch(recordedVersionsAnswersOf('versions-ahead'));
    const client = clientOf(versionedFetch);
    expect(await client.versionsOf(HEPHAESTUS_URL)).toEqual({ verdict: 'answered', document: { current: ONE_MINOR_AHEAD, minimumSupported: FIRST_OF_THE_SUPPORTED_MAJOR } });
    await client.identityOf(ADDRESS);
    await client.monitorOf(ACCESS);
    await client.send(ACCESS, PAUSE_COMMAND);
    const follow = client.followMonitor(ACCESS, () => undefined);
    follow.stop();
    await follow.ended;
    expect(versionedFetch.callsAnswered().map(({ callShape }) => callShape)).toEqual([
      'GET /api/versions',
      'GET /api/v1/identity',
      'GET /api/v5/monitor with bearer',
      'POST /api/v3/commands with bearer',
      'STREAM /api/v5/monitor/events with bearer',
    ]);
  });

  test('take each endpoint\'s version from forge\'s compatibility registry at the forge version this client supports, which serves every one', () => {
    const endpointNames: readonly HephaestusEndpointName[] = [
      'identity',
      'summary',
      'monitor',
      'monitorEvents',
      'commands',
      'board',
      'presence',
      'events',
      'jobStream',
      'profileStream',
      'pictures',
      'picture',
      'ticketDocuments',
    ];
    expect(endpointNames.map((endpointName) => forgeEndpointVersionOf(endpointName))).toEqual([1, 3, 5, 5, 3, 4, 1, 4, 1, 1, 1, 1, 1]);
  });

  test('answer the refusal a forge from before system versions gives its versions, as it gives any unknown path', async () => {
    const releasedForgeFetch = recordedHephaestusFetch(recordedVersionsAnswersOf('versions-absent'));
    expect(await clientOf(releasedForgeFetch).versionsOf(HEPHAESTUS_URL)).toEqual({ verdict: 'refused', refusal: 'not-found', text: null });
  });
});

describe('the token', () => {
  test('travels as a bearer on every guarded route and on no open one', async () => {
    const servingFetch = hephaestusFetchOf('serving-every-contract');
    const client       = clientOf(servingFetch);
    await client.identityOf(ADDRESS);
    await client.monitorOf(ACCESS);
    await client.send(ACCESS, PAUSE_COMMAND);
    const todaysFetch = hephaestusFetchOf('serving');
    await clientOf(todaysFetch).summaryOf(ADDRESS);
    expect([...servingFetch.callsAnswered(), ...todaysFetch.callsAnswered()].map(({ callShape, bearerToken }) => [callShape, bearerToken])).toEqual([
      ['GET /api/v1/identity', null],
      ['GET /api/v5/monitor with bearer', EXAMPLE_TOKEN],
      ['POST /api/v3/commands with bearer', EXAMPLE_TOKEN],
      ['GET /api/v3/summary', null],
    ]);
  });

  test('is carried by no answer of any outcome', async () => {
    const answers = await Promise.all(OUTCOME_CASES.map(async (outcomeCase) => outcomeCase.answerOf(hephaestusFetchOf(outcomeCase.situation))));
    expect(JSON.stringify(answers)).not.toContain(EXAMPLE_TOKEN);
  });
});

describe('a command', () => {
  test('is sent as the forge spells each kind of the control contract', async () => {
    const commands: readonly ForgeControlCommand[] = [
      { kind: 'hephaestus-pause' },
      { kind: 'hephaestus-unpause' },
      { kind: 'hephaestus-stop', now: false },
      { kind: 'hephaestus-restart', now: true },
      { kind: 'concurrency-set', limit: 4 },
      { kind: 'job-stop-all', mode: 'wind-down' },
      { kind: 'machine-agent-limit-set', limit: 8 },
    ];
    const hephaestusFetch = hephaestusFetchOf('serving-every-contract');
    for (const command of commands) await clientOf(hephaestusFetch).send(ACCESS, command);
    expect(hephaestusFetch.callsAnswered().map(({ jsonBody }) => jsonBody)).toEqual([
      '{"kind":"hephaestus-pause"}',
      '{"kind":"hephaestus-unpause"}',
      '{"kind":"hephaestus-stop","now":false}',
      '{"kind":"hephaestus-restart","now":true}',
      '{"kind":"concurrency-set","limit":4}',
      '{"kind":"job-stop-all","mode":"wind-down"}',
      '{"kind":"machine-agent-limit-set","limit":8}',
    ]);
  });
});

/** The ids the board's recording drew, read from the paths it was called at: the product owner's job, the profile run and the picture. */
function recordedPathSegmentOf(situation: BoardSituation, pattern: RegExp): string {
  for (const { callShape } of recordedBoardAnswersOf(situation)) {
    const segment = pattern.exec(callShape)?.[1];
    if (segment !== undefined) return segment;
  }
  throw new Error(`The ${situation} recording calls no path that matches ${String(pattern)}.`);
}

const RECORDED_JOB_ID = recordedPathSegmentOf('intake-conversation', /\/jobs\/([^/]+)\/stream/);
const RECORDED_PROFILE_RUN_ID = recordedPathSegmentOf('gate-profile-run', /\/profiles\/([^/]+)\/stream/);
const RECORDED_PICTURE_ID = recordedPathSegmentOf('picture-accepted', /\/pictures\/([0-9a-f]{64})/);
/** The one-pixel PNG the recording uploaded and read back. */
const RECORDED_PICTURE = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const EXAMPLE_COMMAND = { kind: 'ticket-hold', ticketReference: '002', reason: 'Waits for the example design' } as const;

function boardFetchOf(situation: BoardSituation): RecordedHephaestusFetch {
  return recordedHephaestusFetch(recordedBoardAnswersOf(situation));
}

/** Follows a stream until it answers `eventsWanted` events, then stops it; answers the events and how the follow ended. */
async function followedEventsOf(
  follow: (onEvent: (event: ForgeStreamEvent) => void) => { readonly ended: Promise<unknown>; readonly stop: () => void },
  eventsWanted: number,
): Promise<{ readonly events: readonly ForgeStreamEvent[]; readonly end: unknown }> {
  const events: ForgeStreamEvent[] = [];
  const following = follow((event) => {
    events.push(event);
    if (events.length === eventsWanted) following.stop();
  });
  return { events, end: await following.ended };
}

interface BoardOutcomeCase {
  readonly call:      string;
  readonly situation: BoardSituation;
  readonly callShape: string;
  readonly answerOf:  (hephaestusFetch: RecordedHephaestusFetch) => Promise<unknown>;
  readonly expected:  unknown;
}

const BOARD_STREAM_EVENT_OF_THE_HANDSHAKE = { id: null, eventName: 'handshake', data: JSON.stringify({ systemVersion: SUPPORTED_FORGE_VERSION }) };

const STANDING_REFUSAL_WITH_ITS_FIX = expect.objectContaining({ reason: 'equal-homes', shownOn: 'api', fix: expect.objectContaining({ edits: expect.any(Array) }) });

const APPLIED_PIPELINE_OVER_BOTH_APPS = expect.objectContaining({
  readingVerdict:  'readable',
  contentHash:     expect.any(String),
  fileText:        expect.any(String),
  application:     expect.objectContaining({ appliedRevision: 1, appliedBy: 'user' }),
  entityPipelines: { web: expect.any(Object), api: expect.any(Object) },
});

const BOARD_OUTCOME_CASES: readonly BoardOutcomeCase[] = [
  {
    call:      'boardOf',
    situation: 'board-at-work',
    callShape: 'GET /api/v4/board with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).boardOf(ACCESS),
    expected:  {
      verdict:  'answered',
      document: expect.objectContaining({
        project:              'Example Storefront',
        openDecisionIds:      ['E2'],
        escalatedDecisionIds: ['E2'],
        incidents:            [expect.objectContaining({ id: 'I1', kind: 'system-question' })],
        notices:              [expect.objectContaining({ kind: 'incident-defaulted', causeSentence: expect.any(String) })],
        pipeline:             APPLIED_PIPELINE_OVER_BOTH_APPS,
        pipelineSetup:        expect.objectContaining({
          draftEntities:  { web: expect.any(Object), api: expect.any(Object) },
          entityRefusals: [STANDING_REFUSAL_WITH_ITS_FIX],
          applyRefusal:   expect.objectContaining({ code: 'entity-refusals-stand', fields: { setupId: 'S2', reasons: ['equal-homes'] } }),
        }),
      }),
    },
  },
  {
    call:      'boardOf',
    situation: 'board-token-rejected',
    callShape: 'GET /api/v4/board with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).boardOf(ACCESS),
    expected:  { verdict: 'unauthorized' },
  },
  {
    call:      'boardOf',
    situation: 'board-install-held',
    callShape: 'GET /api/v4/board with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).boardOf(ACCESS),
    expected:  {
      verdict:  'answered',
      document: expect.objectContaining({
        hephaestus: expect.objectContaining({ state: 'held-by-install-change' }),
        notices:    [expect.objectContaining({ kind: 'install-version-changed', sentence: expect.any(String) }), expect.objectContaining({ kind: 'incident-defaulted' })],
      }),
    },
  },
  {
    call:      'boardOf',
    situation: 'assistant-switched-off',
    callShape: 'GET /api/v4/board with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).boardOf(ACCESS),
    expected:  {
      verdict:  'answered',
      document: expect.objectContaining({ pipeline: expect.objectContaining({ pipeline: expect.not.objectContaining({ assistant: expect.anything() }) }) }),
    },
  },
  {
    call:      'boardOf',
    situation: 'assistant-switched-on',
    callShape: 'GET /api/v4/board with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).boardOf(ACCESS),
    expected:  {
      verdict:  'answered',
      document: expect.objectContaining({ pipeline: expect.objectContaining({ pipeline: expect.objectContaining({ assistant: true }) }) }),
    },
  },
  {
    call:      'sendBoardCommand',
    situation: 'assistant-switched-off',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).sendBoardCommand(ACCESS, { kind: 'pipeline-assistant-set', on: false }),
    expected:  {
      verdict: 'answered',
      status:  200,
      body:    expect.objectContaining({
        outcome: 'done',
        result:  expect.objectContaining({ logged: expect.arrayContaining([expect.objectContaining({ kind: 'pipeline-assistant-set', fields: { state: 'off' } })]) }),
      }),
    },
  },
  {
    call:      'sendBoardCommand',
    situation: 'assistant-switched-on',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).sendBoardCommand(ACCESS, { kind: 'pipeline-assistant-set', on: true }),
    expected:  {
      verdict: 'answered',
      status:  200,
      body:    expect.objectContaining({
        outcome: 'done',
        result:  expect.objectContaining({ logged: [expect.objectContaining({ kind: 'pipeline-assistant-set', fields: { state: 'on' } })] }),
      }),
    },
  },
  {
    call:      'followEvents',
    situation: 'board-at-work',
    callShape: 'STREAM /api/v4/events with bearer',
    answerOf:  async (hephaestusFetch) => {
      const { events, end } = await followedEventsOf((onEvent) => clientOf(hephaestusFetch).followEvents(ACCESS, null, onEvent), 2);
      return [events.map(({ id, eventName }) => [id === null, eventName]), end];
    },
    expected: [[[true, 'handshake'], [false, 'board']], { verdict: 'ended', ending: 'stopped' }],
  },
  {
    call:      'followEvents',
    situation: 'board-at-work',
    callShape: 'STREAM /api/v4/events with bearer from a last event id',
    answerOf:  async (hephaestusFetch) => {
      const { events } = await followedEventsOf((onEvent) => clientOf(hephaestusFetch).followEvents(ACCESS, '1-35', onEvent), 2);
      return [events[0], hephaestusFetch.callsAnswered().map(({ lastEventId }) => lastEventId)];
    },
    expected: [BOARD_STREAM_EVENT_OF_THE_HANDSHAKE, ['1-35']],
  },
  {
    call:      'followEvents',
    situation: 'board-token-rejected',
    callShape: 'STREAM /api/v4/events with bearer',
    answerOf:  async (hephaestusFetch) => (await followedEventsOf((onEvent) => clientOf(hephaestusFetch).followEvents(ACCESS, null, onEvent), 1)).end,
    expected:  { verdict: 'unauthorized' },
  },
  {
    call:      'sendBoardCommand',
    situation: 'board-command-applied',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).sendBoardCommand(ACCESS, EXAMPLE_COMMAND),
    expected:  { verdict: 'answered', status: 200, body: expect.objectContaining({ controlVersion: 3, outcome: 'done' }) },
  },
  {
    call:      'sendBoardCommand',
    situation: 'board-command-refused',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).sendBoardCommand(ACCESS, EXAMPLE_COMMAND),
    expected:  {
      verdict: 'answered',
      status:  409,
      body:    {
        controlVersion: 3,
        refusal:        'no-readable-ticket',
        fields:         { reference: '999' },
        text:           expect.stringContaining('There is no readable ticket 999.'),
      },
    },
  },
  {
    call:      'sendBoardCommand',
    situation: 'board-command-unknown-kind',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).sendBoardCommand(ACCESS, { kind: 'example-unknown-kind' }),
    expected:  { verdict: 'answered', status: 400, body: expect.objectContaining({ refusal: 'malformed-body', fields: {} }) },
  },
  {
    call:      'sendBoardCommand',
    situation: 'board-install-held',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).sendBoardCommand(ACCESS, EXAMPLE_COMMAND),
    expected:  { verdict: 'answered', status: 423, body: expect.objectContaining({ refusal: 'launches-held-by-install-change', fields: {} }) },
  },
  {
    call:      'uploadPicture',
    situation: 'picture-accepted',
    callShape: 'POST /api/v1/pictures with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).uploadPicture(ACCESS, RECORDED_PICTURE, 'image/png'),
    expected:  { verdict: 'answered', status: 200, body: { pictureId: RECORDED_PICTURE_ID, bytes: RECORDED_PICTURE.length, mediaType: 'image/png' } },
  },
  {
    call:      'pictureOf',
    situation: 'picture-accepted',
    callShape: `GET /api/v1/pictures/${RECORDED_PICTURE_ID} with bearer`,
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).pictureOf(ACCESS, RECORDED_PICTURE_ID),
    expected:  {
      verdict: 'answered', status: 200, contentType: 'image/png', bytes: RECORDED_PICTURE,
    },
  },
  {
    call:      'uploadPicture',
    situation: 'picture-too-large',
    callShape: 'POST /api/v1/pictures with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).uploadPicture(ACCESS, RECORDED_PICTURE, 'image/png'),
    expected:  { verdict: 'answered', status: 413, body: expect.objectContaining({ refusal: 'picture-too-large', fields: { bytes: 3_932_161, sizeLimitBytes: 3_932_160 } }) },
  },
  {
    call:      'uploadPicture',
    situation: 'picture-not-a-picture',
    callShape: 'POST /api/v1/pictures with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).uploadPicture(ACCESS, RECORDED_PICTURE, 'text/plain'),
    expected:  { verdict: 'answered', status: 415, body: expect.objectContaining({ refusal: 'picture-type-unsupported' }) },
  },
  {
    call:      'uploadPicture',
    situation: 'intake-conversation',
    callShape: 'POST /api/v1/pictures with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).uploadPicture(ACCESS, RECORDED_PICTURE, 'image/png'),
    expected:  { verdict: 'answered', status: 200, body: expect.objectContaining({ pictureId: RECORDED_PICTURE_ID }) },
  },
  {
    call:      'sendBoardCommand',
    situation: 'intake-conversation',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).sendBoardCommand(ACCESS, { kind: 'intake-start', text: 'Example: suggest searches.' }),
    expected:  { verdict: 'answered', status: 200, body: expect.objectContaining({ outcome: 'done' }) },
  },
  {
    call:      'followJobStream',
    situation: 'intake-conversation',
    callShape: `STREAM /api/v1/jobs/${RECORDED_JOB_ID}/stream with bearer`,
    answerOf:  async (hephaestusFetch) => {
      const follow = (onEvent: (event: ForgeStreamEvent) => void) => clientOf(hephaestusFetch).followJobStream(ACCESS, RECORDED_JOB_ID, null, null, onEvent);
      return (await followedEventsOf(follow, 2)).events.map(({ eventName }) => eventName);
    },
    expected: ['handshake', 'history'],
  },
  {
    call:      'sendBoardCommand',
    situation: 'gate-profile-run',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).sendBoardCommand(ACCESS, {
      kind: 'gate-profile-start', setupId: 'S1', gateName: 'unit', phase: 'build'
    }),
    expected: { verdict: 'answered', status: 200, body: expect.objectContaining({ outcome: 'done' }) },
  },
  {
    call:      'followProfileStream',
    situation: 'gate-profile-run',
    callShape: `STREAM /api/v1/profiles/${RECORDED_PROFILE_RUN_ID}/stream with bearer`,
    answerOf:  async (hephaestusFetch) => {
      const follow = (onEvent: (event: ForgeStreamEvent) => void) => clientOf(hephaestusFetch).followProfileStream(ACCESS, RECORDED_PROFILE_RUN_ID, null, null, onEvent);
      return (await followedEventsOf(follow, 2)).events;
    },
    expected: [BOARD_STREAM_EVENT_OF_THE_HANDSHAKE, { id: '1', eventName: 'line', data: JSON.stringify({ text: 'Example gate passed\n' }) }],
  },
];

describe('each outcome of each board call', () => {
  for (const outcomeCase of BOARD_OUTCOME_CASES) {
    test(`${outcomeCase.call} answers ${JSON.stringify(outcomeCase.expected)} where the board is ${outcomeCase.situation}`, async () => {
      expect(await outcomeCase.answerOf(boardFetchOf(outcomeCase.situation))).toEqual(outcomeCase.expected);
    });
  }

  test('is proven by exactly the recorded answers of the board\'s situations, each used once', () => {
    const provenCallShapes   = BOARD_OUTCOME_CASES.map(({ situation, callShape }) => situationCallShapeOf(situation, callShape));
    const recordedCallShapes = everyRecordedHephaestusAnswerOf().map(({ callShape }) => callShape)
      .filter((callShape) => BOARD_SITUATIONS.some((situation) => callShape.startsWith(situationCallShapeOf(situation, ''))));
    expect([...provenCallShapes].sort()).toEqual([...recordedCallShapes].sort());
  });

  test('keep a refused token, a Hephaestus that is down and an answer that is no JSON as the verdicts a document call gives', async () => {
    const outcomes = await Promise.all((['token-rejected', 'stopped', 'port-held-by-another-program'] as const).map(async (situation) => [
      await clientOf(hephaestusFetchOf(situation)).sendBoardCommand(ACCESS, EXAMPLE_COMMAND),
    ]));
    expect(outcomes).toEqual([[{ verdict: 'unauthorized' }], [{ verdict: 'unreachable' }], [{ verdict: 'malformed' }]]);
  });

  test('fail on a call with no recorded answer, such as a board read where only a picture was recorded', async () => {
    await expect(clientOf(boardFetchOf('picture-too-large')).boardOf(ACCESS)).rejects.toThrow('No recorded answer for GET /api/v4/board with bearer');
  });
});

describe('following a board stream', () => {
  test('hands on each whole event with its id, the handshake with none, and never one the stream left unfinished', async () => {
    // The program that is no forge answers every path alike, so its stream cut inside an event stands for the board's stream too.
    const cutStream = recordedHephaestusAnswersOf('stream-cut-inside-event').map(({ answer }) => ({ callShape: 'STREAM /api/v4/events with bearer', answer }));
    const events: ForgeStreamEvent[] = [];
    const end = await clientOf(recordedHephaestusFetch(cutStream)).followEvents(ACCESS, null, (event) => events.push(event)).ended;
    expect([events.map(({ id, eventName }) => [id, eventName]), end]).toEqual([[[null, 'monitor']], { verdict: 'ended', ending: 'closed' }]);
    const { events: boardEvents } = await followedEventsOf((onEvent) => clientOf(boardFetchOf('board-at-work')).followEvents(ACCESS, null, onEvent), 2);
    const boardEventData = boardEvents.map((event) => JSON.parse(event.data) as unknown);
    expect(boardEventData).toEqual([{ systemVersion: SUPPORTED_FORGE_VERSION }, expect.objectContaining({ project: 'Example Storefront' })]);
  });

  test('sends the cursor as after= in the query and the last event id as its header', async () => {
    const hephaestusFetch = recordedHephaestusFetch([]);
    const follow = clientOf(hephaestusFetch).followJobStream(ACCESS, RECORDED_JOB_ID, '7', '7', () => undefined);
    await expect(follow.ended).rejects.toThrow(`No recorded answer for STREAM /api/v1/jobs/${RECORDED_JOB_ID}/stream?after=7 with bearer from a last event id`);
  });

  test('ends stopped and leaves no stream open when stopped', async () => {
    const hephaestusFetch = boardFetchOf('gate-profile-run');
    const { end } = await followedEventsOf((onEvent) => clientOf(hephaestusFetch).followProfileStream(ACCESS, RECORDED_PROFILE_RUN_ID, null, null, onEvent), 1);
    expect([end, hephaestusFetch.streamsLeftOpen()]).toEqual([{ verdict: 'ended', ending: 'stopped' }, 0]);
  });
});

describe('the token on the board\'s calls', () => {
  test('travels as the bearer of every board request and stream', async () => {
    const answered = await Promise.all(BOARD_OUTCOME_CASES.map(async (outcomeCase) => {
      const hephaestusFetch = boardFetchOf(outcomeCase.situation);
      await outcomeCase.answerOf(hephaestusFetch);
      return hephaestusFetch.callsAnswered().map(({ bearerToken }) => bearerToken);
    }));
    expect(new Set(answered.flat())).toEqual(new Set([EXAMPLE_TOKEN]));
  });

  test('is carried by no answer of any board outcome', async () => {
    const answers = await Promise.all(BOARD_OUTCOME_CASES.map(async (outcomeCase) => outcomeCase.answerOf(boardFetchOf(outcomeCase.situation))));
    expect(JSON.stringify(answers)).not.toContain(EXAMPLE_TOKEN);
  });
});

interface TicketDocumentsOutcomeCase {
  readonly call:      string;
  readonly situation: TicketDocumentsSituation;
  readonly callShape: string;
  readonly answerOf:  (hephaestusFetch: RecordedHephaestusFetch) => Promise<unknown>;
  readonly expected:  unknown;
}

const SPEC_TICKET_ID = '001';
const TICKET_WITHOUT_DOCUMENTS_ID = '002';
const UNKNOWN_TICKET_ID = '999';

const TICKET_DOCUMENTS_OUTCOME_CASES: readonly TicketDocumentsOutcomeCase[] = [
  {
    call:      'sendBoardCommand',
    situation: 'ticket-documents-saved',
    callShape: 'POST /api/v3/commands with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).sendBoardCommand(ACCESS, {
      kind: 'ticket-document-save', ticketReference: SPEC_TICKET_ID, document: 'spec', baseVersion: null, markdown: '# Example',
    }),
    expected: { verdict: 'answered', status: 200, body: expect.objectContaining({ controlVersion: 3, outcome: 'done', result: expect.objectContaining({ versionNumber: 1 }) }) },
  },
  {
    call:      'followEvents',
    situation: 'ticket-documents-saved',
    callShape: 'STREAM /api/v4/events with bearer',
    answerOf:  async (hephaestusFetch) => {
      const { events } = await followedEventsOf((onEvent) => clientOf(hephaestusFetch).followEvents(ACCESS, null, onEvent), 4);
      return events.map(({ eventName, data }) => (eventName === 'documents' ? [eventName, JSON.parse(data) as unknown] : [eventName]));
    },
    expected: [['handshake'], ['board'], ['documents', { ticketId: SPEC_TICKET_ID }], ['board']],
  },
  {
    call:      'ticketDocumentsOf',
    situation: 'ticket-documents-saved',
    callShape: `GET /api/v1/tickets/${SPEC_TICKET_ID}/documents with bearer`,
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).ticketDocumentsOf(ACCESS, SPEC_TICKET_ID),
    expected:  {
      verdict: 'answered',
      status:  200,
      body:    expect.objectContaining({ ticketId: SPEC_TICKET_ID, documents: [expect.objectContaining({ document: 'spec' }), expect.objectContaining({ document: 'plan' })] }),
    },
  },
  {
    call:      'boardOf',
    situation: 'ticket-documents-saved',
    callShape: 'GET /api/v4/board with bearer',
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).boardOf(ACCESS),
    expected:  { verdict: 'answered', document: expect.objectContaining({ project: 'Example Bookshop' }) },
  },
  {
    call:      'ticketDocumentsOf',
    situation: 'ticket-documents-absent',
    callShape: `GET /api/v1/tickets/${TICKET_WITHOUT_DOCUMENTS_ID}/documents with bearer`,
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).ticketDocumentsOf(ACCESS, TICKET_WITHOUT_DOCUMENTS_ID),
    expected:  {
      verdict: 'answered',
      status:  404,
      body:    { refusal: 'ticket-has-no-documents', fields: { ticketId: TICKET_WITHOUT_DOCUMENTS_ID }, text: expect.stringContaining('#002') },
    },
  },
  {
    call:      'ticketDocumentsOf',
    situation: 'ticket-documents-unknown-ticket',
    callShape: `GET /api/v1/tickets/${UNKNOWN_TICKET_ID}/documents with bearer`,
    answerOf:  (hephaestusFetch) => clientOf(hephaestusFetch).ticketDocumentsOf(ACCESS, UNKNOWN_TICKET_ID),
    expected:  {
      verdict: 'answered',
      status:  404,
      body:    { refusal: 'no-readable-ticket', fields: { reference: UNKNOWN_TICKET_ID }, text: expect.stringContaining('There is no readable ticket 999.') },
    },
  },
];

function ticketDocumentsFetchOf(situation: TicketDocumentsSituation): RecordedHephaestusFetch {
  return recordedHephaestusFetch(recordedTicketDocumentsAnswersOf(situation));
}

describe('each outcome of each ticket documents call', () => {
  for (const outcomeCase of TICKET_DOCUMENTS_OUTCOME_CASES) {
    test(`${outcomeCase.call} answers ${JSON.stringify(outcomeCase.expected)} where the documents are ${outcomeCase.situation}`, async () => {
      expect(await outcomeCase.answerOf(ticketDocumentsFetchOf(outcomeCase.situation))).toEqual(outcomeCase.expected);
    });
  }

  test('is proven by exactly the recorded answers of the documents\' situations, each used once', () => {
    const provenCallShapes   = TICKET_DOCUMENTS_OUTCOME_CASES.map(({ situation, callShape }) => situationCallShapeOf(situation, callShape));
    const recordedCallShapes = everyRecordedHephaestusAnswerOf().map(({ callShape }) => callShape)
      .filter((callShape) => TICKET_DOCUMENTS_SITUATIONS.some((situation) => callShape.startsWith(situationCallShapeOf(situation, ''))));
    expect([...provenCallShapes].sort()).toEqual([...recordedCallShapes].sort());
  });

  test('sends the token as the bearer of the documents\' read', async () => {
    const hephaestusFetch = ticketDocumentsFetchOf('ticket-documents-absent');
    await clientOf(hephaestusFetch).ticketDocumentsOf(ACCESS, TICKET_WITHOUT_DOCUMENTS_ID);
    expect(hephaestusFetch.callsAnswered().map(({ bearerToken }) => bearerToken)).toEqual([EXAMPLE_TOKEN]);
  });
});
