/**
 * The `GET /api/monitor` document. What matters: for a board with one entry of every attention kind and one job of every role, plus a merge
 * job with none, `monitorSnapshotOf` answers `monitorVersion: 3` exactly as `testing/fixtures/monitor-v3.json` holds it, so a change to the
 * shape a monitor reads fails here; a new shape is a new version and a new fixture, never an edit of this one, and `monitor-v1.json` and
 * `monitor-v2.json` stay as versions 1 and 2 froze them. Beside it: `activity` keeps only the kinds a person cares about, newest last, each
 * at its log position, and holds at most the newest fifty. The current usage window is the newest report across the board's jobs by the
 * instant its stamp names, an unstamped or unreadable stamp the oldest, and its reset is passed on as reported, also once it is past: a
 * clock decides nothing. Flint's brain is the Overseer's reading as it stands, in each state, and none for a forge that cannot run it
 * confined; it is never in `jobs`. With a brain, `testing/fixtures/monitor-v3-flint-brain.json` holds the snapshot: the ended run's activity
 * entry, of the category `agent` with its kind and tokens, and today's tokens counting the running run and the ended one. On a forge with
 * entities the snapshot adds its entities in the pipeline's order, each open ticket's entity and stage in board order (a delivered or
 * abandoned ticket left out, an unassigned or uncrossed one `null`), and each job's entity with its stage's name only where set; a forge
 * without entities gets none of these keys, so its snapshot stays exactly the frozen fixture. A job's `interruption` is its cause, spelt as the
 * contract spells it, only while it is `interrupted`: a job that runs again after one serves `null`.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';

import type { JobLiveFactsWithSilence, JobWithLiveFacts }                                 from '../../adapters/@types/BoardStateParts.ts';
import type { LogRecord }                                                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                                                                  from '../../lib/tracker-model/@types/Pipeline.ts';
import type { TicketStage }                                                               from '../../lib/tracker-model/@types/Task.ts';
import type { Ticket }                                                                    from '../../lib/tracker-model/@types/Ticket.ts';
import type { MonitorSnapshot }                                                           from '../../shared/monitor/@types/MonitorSnapshot.ts';
import type { BoardState }                                                                from './BoardState.ts';
import { MonitorSnapshotAssembly, type MonitorOverseerFacts, type MonitorSnapshotSource } from './MonitorSnapshotAssembly.ts';
import { liveJobFixture }                                                                 from './testing/LiveJobFixture.ts';

const MONITOR_FIXTURE_PATH = join(import.meta.dir, 'testing', 'fixtures', 'monitor-v3.json');

const FLINT_BRAIN_MONITOR_FIXTURE_PATH = join(import.meta.dir, 'testing', 'fixtures', 'monitor-v3-flint-brain.json');

/** Midday, so today's local calendar date is the stamps' date in any zone a spec runs in. */
const NOW = new Date(2026, 10, 12, 12, 0, 0);

const IDLE_LIVE_FACTS: JobLiveFactsWithSilence = {
  jobId:                  '',
  calls:                  0,
  callBudget:             null,
  tokens:                 0,
  toolCalls:              0,
  lastToolCall:           null,
  subagents:              [],
  toolCallsWithSubagents: 0,
  turn:                   null,
  messagesWaiting:        0,
  lastLine:               null,
  usageWindow:            null,
  silentSweeps:           0,
};

function jobWith(job: Parameters<typeof liveJobFixture>[0], live: Partial<JobLiveFactsWithSilence>, launchedAt: string | null): JobWithLiveFacts {
  return {
    ...liveJobFixture(job), launchedAt, live: { ...IDLE_LIVE_FACTS, jobId: job.id, ...live }, lostLine: null
  };
}

const JOBS: JobWithLiveFacts[] = [
  jobWith({ id: 'J1', ticketIds: ['001'], state: 'waiting-for-answer' }, {
    calls:        12,
    callBudget:   200,
    tokens:       48_000,
    toolCalls:    30,
    lastToolCall: { toolName: 'Edit', startedAt: '2026-11-12T11:58:00+01:00', running: false } as JobLiveFactsWithSilence['lastToolCall'],
    subagents:    [{ state: 'running' }, { state: 'ended' }] as unknown as JobLiveFactsWithSilence['subagents'],
    turn:         'mid-turn',
    usageWindow:  {
      window: 'five_hour', lengthHours: 5, resetsAt: '2026-11-12T15:00:00.000Z', reportedAt: '2026-11-12T10:58:00.000Z'
    },
  }, '2026-11-12T11:00:00+01:00'),
  jobWith({
    id: 'J2', kind: 'review', role: 'reviewer', ticketIds: ['006'], attempt: 2
  }, { silentSweeps: 4, turn: 'between-turns' }, '2026-11-12T11:30:00+01:00'),
  jobWith({
    id: 'J3', kind: 'assistant', role: 'assistant', target: null
  }, {
    lastLine:        { role: 'assistant', text: 'Example Assistant line', at: null },
    messagesWaiting: 1,
    usageWindow:     {
      window: 'five_hour', lengthHours: 5, resetsAt: '2026-11-12T10:00:00.000Z', reportedAt: '2026-11-12T09:30:00.000Z'
    },
  }, null),
  jobWith({
    id: 'J4', kind: 'product-owner', role: 'product-owner', target: null
  }, { lastLine: { role: 'user', text: 'Example request', at: null } }, '2026-11-12T10:00:00+01:00'),
  jobWith({
    id: 'J5', kind: 'pipeline-agent', role: 'pipeline-agent', target: null
  }, {}, '2026-11-12T10:05:00+01:00'),
  jobWith({
    id: 'J6', kind: 'merge', role: null, ticketIds: ['007'], state: 'merging'
  }, {}, '2026-11-12T11:45:00+01:00'),
];

const STATE = {
  page: {
    tickets: [
      {
        id: '001', title: 'Example build', status: 'in-progress', filed: '2026-11-12T08:00:00+01:00', updated: '2026-11-12T11:00:00+01:00', delivered: null
      },
      {
        id: '009', title: 'Example draft ticket', status: 'draft', filed: '2026-11-12T09:00:00+01:00', updated: '2026-11-12T09:00:00+01:00', delivered: null
      },
      {
        id: '006', title: 'Example review', status: 'ready-for-review', filed: '2026-11-12T07:00:00+01:00', updated: '2026-11-12T10:30:00+01:00', delivered: null
      },
      {
        id: '005', title: 'Example reviewed change', status: 'reviewed', filed: '2026-11-11T07:00:00+01:00', updated: '2026-11-12T08:30:00+01:00', delivered: null
      },
      {
        id: '002', title: 'Example delivered', status: 'delivered', filed: '2026-11-11T07:00:00+01:00', updated: '2026-11-12T09:30:00+01:00', delivered: '2026-11-12T09:30:00+01:00'
      },
    ],
    payload: {
      progress:   { tasks: [{ status: 'in-progress', end: null, tokens: 48_000 }, { status: 'done', end: '2026-11-12T09:30:00+01:00', tokens: 2000 }] },
      boardFacts: {
        drafts: [{
          id: 'D2', title: 'Example filing draft', state: 'waiting', openQuestionCount: 2, openedAt: '2026-11-12T10:45:00+01:00'
        }],
      },
    },
  },
  jobs:      JOBS,
  decisions: [
    {
      id:        'E1',
      kind:      'agent-question',
      ticketIds: ['001'],
      jobId:     'J1',
      askedBy:   'builder',
      requestId: 'request-1',
      questions: [{
        question: 'Example: per customer or per address?', header: 'Window', multiSelect: false, options: []
      }],
      context:  'Example context',
      openedAt: '2026-11-12T11:50:00+01:00',
    },
    {
      id:        'E2',
      kind:      'target-moved',
      ticketIds: ['005'],
      jobId:     null,
      askedBy:   'overseer',
      requestId: null,
      questions: [],
      context:   'Example: main moved under ticket 005',
      openedAt:  '2026-11-12T09:15:00+01:00',
    },
  ],
  incidents: [{
    id:              'I3',
    kind:            'quiet-job',
    ticketIds:       ['006'],
    jobId:           'J2',
    facts:           { sweeps: '4' },
    defaultMove:     'open-quiet-job-decision',
    deliveredInTurn: null,
    openedAt:        '2026-11-12T11:55:00+01:00',
  }],
  notices: [{ kind: 'new-code' }, {
    kind: 'incident-defaulted', incidentId: 'I1', move: 'job-fresh', cause: 'no-assistant'
  }],
  questionHistory: [{
    kind: 'incident-escalated', at: '2026-11-12T11:50:00+01:00', incidentId: 'I2', fields: { decisionId: 'E1' }
  }],
  mergeQueue: { queuedTicketIds: [], slots: [], targets: [{ target: 'main', waitingForMerge: [{ ticketId: '005' }] }] },
  overseer:   {
    state:            'serving',
    paused:           false,
    url:              'http://127.0.0.1:4100/',
    generation:       3,
    codeVersion:      'code-example',
    installVersion:   17,
    batonPassWarning: { successorCodeVersion: 'code-newer', step: 'take-baton', error: 'Example error' },
  },
  usage: { resetsAt: null, window: null },
} as unknown as BoardState;

const LOG_RECORDS = [
  { kind: 'overseer-started', at: '2026-11-12T08:00:00+01:00', fields: { codeVersion: 'code-example', installVersion: 17 } },
  {
    kind: 'ticket-filed', at: '2026-11-12T09:00:00+01:00', ticketId: '009', fields: { title: 'Example draft ticket' }
  },
  {
    kind: 'ticket-priority-changed', at: '2026-11-12T09:05:00+01:00', ticketId: '009', fields: { from: 'normal', to: 'high' }
  },
  {
    kind: 'ticket-delivered', at: '2026-11-12T09:30:00+01:00', ticketId: '002', fields: {}
  },
  {
    kind:   'job-launched',
    at:     '2026-11-12T11:00:00+01:00',
    jobId:  'J1',
    fields: {
      kind: 'build', role: 'builder', ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
    },
  },
  {
    kind: 'decision-opened', at: '2026-11-12T11:50:00+01:00', decisionId: 'E1', fields: { kind: 'agent-question', ticketIds: ['001'] }
  },
  { kind: 'note', at: '2026-11-12T11:55:00+01:00', fields: { text: 'Example milestone' } },
] as unknown as LogRecord[];

const OVERSEER: MonitorOverseerFacts = {
  trackerId:         'tracker-example',
  root:              '/example/repository',
  state:             'serving',
  url:               'http://127.0.0.1:4100/',
  processId:         4242,
  startedAt:         '2026-11-12T08:00:00+01:00',
  generation:        3,
  codeVersion:       'code-example',
  codeVersionOnDisk: 'code-newer',
  installVersion:    17,
  machine:           { limit: 4, agentsInFlight: 3, ticketsWaitingForMachineSlot: 1 },
};

const BOARD = {
  pipeline:            () => null,
  concurrency:         () => ({ limit: 3, agentsInFlight: 2, freeSlots: 1 }),
  readyTicketEntries:  () => [{ id: '003' }, { id: '004' }],
  ticketCountByStatus: () => ({
    'draft': 1, 'ready-for-review': 1, 'pending': 2, 'in-progress': 1, 'in-review': 0, 'reviewed': 1, 'delivered': 1, 'abandoned': 0,
  }),
} as unknown as MonitorSnapshotSource['board'];

const SOURCE: MonitorSnapshotSource = {
  state: STATE, project: 'Example Agency', board: BOARD, logRecords: LOG_RECORDS, overseer: OVERSEER, flintBrain: null, now: NOW
};

const BRAIN_OFF: MonitorFlintBrainDocument = {
  state:       'off',
  startedAt:   null,
  endsAt:      null,
  startedBy:   null,
  model:       null,
  effort:      null,
  tokens:      null,
  calls:       null,
  recentMoves: [],
  endedAt:     null,
  endedReason: null,
  sentence:    null,
  refusal:     null,
};

const BRAIN_RUNNING: MonitorFlintBrainDocument = {
  ...BRAIN_OFF,
  state:       'running',
  startedAt:   '2026-11-12T10:59:00.000Z',
  endsAt:      '2026-11-12T11:01:00.000Z',
  startedBy:   'api',
  model:       'haiku',
  effort:      'low',
  tokens:      900,
  calls:       2,
  recentMoves: [{ at: '2026-11-12T10:59:40.000Z', intent: 'wave', emote: 'happy' }, { at: '2026-11-12T10:59:20.000Z', intent: 'wander', emote: null }],
  sentence:    'Flint\'s brain chooses Flint\'s moves.',
};

const BRAIN_STATES: Readonly<Record<MonitorFlintBrainDocument['state'], MonitorFlintBrainDocument>> = {
  off:      BRAIN_OFF,
  starting: {
    ...BRAIN_RUNNING, state: 'starting', tokens: 0, calls: 0, recentMoves: [], sentence: 'Flint\'s brain is starting.'
  },
  running: BRAIN_RUNNING,
  ended:   {
    ...BRAIN_RUNNING, state: 'ended', endedAt: '2026-11-12T11:00:00.000Z', endedReason: 'stopped', sentence: 'Flint\'s brain was stopped after 1:00.'
  },
  refused: {
    ...BRAIN_OFF,
    state:    'refused',
    sentence: 'The Overseer is paused, so Flint\'s brain does not start.',
    refusal:  { code: 'overseer-paused', sentence: 'The Overseer is paused, so Flint\'s brain does not start.' },
  },
};

const FLINT_BRAIN_ENDED_RECORD = {
  kind:   'flint-brain-ended',
  at:     '2026-11-12T11:30:00+01:00',
  fields: {
    startedBy: 'bridge', startedAt: '2026-11-12T10:27:00.000Z', endedAt: '2026-11-12T10:29:00.000Z', endedReason: 'time', tokens: 4200, calls: 6
  },
} as unknown as LogRecord;

const FLINT_BRAIN_SOURCE: MonitorSnapshotSource = { ...SOURCE, logRecords: [...LOG_RECORDS, FLINT_BRAIN_ENDED_RECORD], flintBrain: BRAIN_RUNNING };

describe('MonitorSnapshotAssembly.monitorSnapshotOf', () => {
  test('answers monitorVersion 3 exactly as the fixture holds it, for every attention kind and every job role', () => {
    const fixture: unknown = JSON.parse(readFileSync(MONITOR_FIXTURE_PATH, 'utf8'));
    expect(JSON.parse(JSON.stringify(MonitorSnapshotAssembly.monitorSnapshotOf(SOURCE)))).toEqual(fixture);
  });

  test('the attention list holds every kind once', () => {
    expect(MonitorSnapshotAssembly.monitorSnapshotOf(SOURCE).attention.map((entry) => entry.kind).toSorted()).toEqual([
      'draft-ticket', 'escalated-question', 'filing-draft', 'merge-accept', 'question', 'review',
    ]);
  });
});

const INTERRUPTION_JOBS: JobWithLiveFacts[] = [
  jobWith({
    id: 'J1', ticketIds: ['001'], state: 'interrupted', interruption: 'network-outage'
  }, {}, '2026-11-12T10:00:00+01:00'),
  jobWith({
    id: 'J2', ticketIds: ['002'], state: 'interrupted', interruption: 'lease-ended'
  }, {}, '2026-11-12T10:00:00+01:00'),
  jobWith({
    id: 'J3', ticketIds: ['003'], state: 'interrupted', interruption: 'watcher-lost'
  }, {}, '2026-11-12T10:00:00+01:00'),
  jobWith({
    id: 'J4', ticketIds: ['004'], state: 'running', interruption: 'network-outage'
  }, {}, '2026-11-12T10:00:00+01:00'),
];

const INTERRUPTION_SOURCE: MonitorSnapshotSource = { ...SOURCE, state: { ...STATE, jobs: INTERRUPTION_JOBS } as unknown as BoardState };

describe('a job\'s interruption in the monitor snapshot', () => {
  test('is the cause of an interrupted job as the contract spells it, and null once the job runs again', () => {
    const { jobs } = MonitorSnapshotAssembly.monitorSnapshotOf(INTERRUPTION_SOURCE);
    expect(jobs.map(({ id, interruption }) => ({ id, interruption }))).toEqual([
      { id: 'J1', interruption: 'network-outage' },
      { id: 'J2', interruption: 'lease-ended' },
      { id: 'J3', interruption: 'child-lost' },
      { id: 'J4', interruption: null },
    ]);
  });
});

describe('Flint\'s brain in the monitor snapshot', () => {
  test('answers monitorVersion 3 with a running brain and an ended run exactly as its fixture holds it', () => {
    const fixture: unknown = JSON.parse(readFileSync(FLINT_BRAIN_MONITOR_FIXTURE_PATH, 'utf8'));
    expect(JSON.parse(JSON.stringify(MonitorSnapshotAssembly.monitorSnapshotOf(FLINT_BRAIN_SOURCE)))).toEqual(fixture);
  });

  test('is the Overseer\'s reading in each state, and none where the forge cannot run it confined', () => {
    for (const reading of Object.values(BRAIN_STATES)) {
      expect(MonitorSnapshotAssembly.monitorSnapshotOf({ ...SOURCE, flintBrain: reading }).flintBrain, reading.state).toEqual(reading);
    }
    expect(MonitorSnapshotAssembly.monitorSnapshotOf(SOURCE).flintBrain).toBeNull();
  });

  test('is never one of the jobs', () => {
    const withoutBrain = MonitorSnapshotAssembly.monitorSnapshotOf(SOURCE);
    for (const reading of Object.values(BRAIN_STATES)) {
      const snapshot = MonitorSnapshotAssembly.monitorSnapshotOf({ ...SOURCE, flintBrain: reading });
      expect([snapshot.jobs, snapshot.concurrency]).toEqual([withoutBrain.jobs, withoutBrain.concurrency]);
    }
  });

  test('leaves an ended run as an agent entry of the kind flint-brain with its tokens, which no other entry has', () => {
    const activity = MonitorSnapshotAssembly.activityOf([...LOG_RECORDS, FLINT_BRAIN_ENDED_RECORD]);
    expect(activity.at(-1)).toEqual({
      logPosition: LOG_RECORDS.length,
      at:          '2026-11-12T11:30:00+01:00',
      category:    'agent',
      text:        'Flint\'s brain stopped after its whole time, after 6 model calls and 4.2k tokens',
      route:       null,
      kind:        'flint-brain',
      tokens:      4200,
    });
    expect(activity.slice(0, -1).filter((entry) => 'kind' in entry || 'tokens' in entry)).toEqual([]);
  });

  test('adds the running run\'s tokens and today\'s ended runs to today\'s tokens, a run both logged and read once', () => {
    const tokensWith = (flintBrain: MonitorFlintBrainDocument | null, logRecords: readonly LogRecord[]) => (
      MonitorSnapshotAssembly.monitorSnapshotOf({ ...SOURCE, flintBrain, logRecords }).today.tokens
    );
    const withoutBrain = tokensWith(null, LOG_RECORDS);
    expect(tokensWith(BRAIN_RUNNING, LOG_RECORDS) - withoutBrain).toBe(900);
    expect(tokensWith(BRAIN_RUNNING, [...LOG_RECORDS, FLINT_BRAIN_ENDED_RECORD]) - withoutBrain).toBe(5100);
    const loggedEndedRun = {
      ...FLINT_BRAIN_ENDED_RECORD,
      fields: {
        startedBy: 'api', startedAt: BRAIN_RUNNING.startedAt, endedAt: '2026-11-12T11:00:00.000Z', endedReason: 'stopped', tokens: 900, calls: 2
      },
    } as unknown as LogRecord;
    expect(tokensWith(BRAIN_STATES.ended, [...LOG_RECORDS, loggedEndedRun]) - withoutBrain).toBe(900);
  });
});

function usageOfJobsReporting(reports: readonly (JobLiveFactsWithSilence['usageWindow'])[]): MonitorSnapshot['usage'] {
  const jobs = reports.map((usageWindow, index) => jobWith({ id: `J${index + 1}` }, { usageWindow }, null));
  return MonitorSnapshotAssembly.monitorSnapshotOf({ ...SOURCE, state: { ...STATE, jobs } }).usage;
}

describe('the current usage window', () => {
  test('is the newest report across the board\'s jobs, beside the limit the usage marker holds', () => {
    expect(usageOfJobsReporting([
      {
        window: 'five_hour', lengthHours: 5, resetsAt: '2026-11-12T15:00:00.000Z', reportedAt: '2026-11-12T11:00:00.000Z'
      },
      {
        window: 'seven_day', lengthHours: 168, resetsAt: '2026-11-15T09:00:00.000Z', reportedAt: '2026-11-12T11:30:00.000Z'
      },
      null,
    ])).toEqual({
      resetsAt: null, window: null, currentWindow: 'seven_day', currentWindowResetsAt: '2026-11-15T09:00:00.000Z'
    });
  });

  test('an unstamped report, from a log written before stamps, loses to a stamped one', () => {
    expect(usageOfJobsReporting([
      {
        window: 'seven_day', lengthHours: 168, resetsAt: '2026-11-15T09:00:00.000Z', reportedAt: null
      },
      {
        window: 'five_hour', lengthHours: 5, resetsAt: '2026-11-12T15:00:00.000Z', reportedAt: '2026-11-12T11:00:00.000Z'
      },
    ])).toMatchObject({ currentWindow: 'five_hour', currentWindowResetsAt: '2026-11-12T15:00:00.000Z' });
  });

  test('a report whose stamp does not read loses to a stamped one, in whichever order the jobs come', () => {
    const unreadable = {
      window: 'seven_day', lengthHours: 168, resetsAt: '2026-11-15T09:00:00.000Z', reportedAt: 'not a stamp'
    };
    const stamped    = {
      window: 'five_hour', lengthHours: 5, resetsAt: '2026-11-12T15:00:00.000Z', reportedAt: '2026-11-12T11:00:00.000Z'
    };
    expect(usageOfJobsReporting([unreadable, stamped])).toMatchObject({ currentWindow: 'five_hour' });
    expect(usageOfJobsReporting([stamped, unreadable])).toMatchObject({ currentWindow: 'five_hour' });
  });

  test('stamps with different offsets are ordered by the instant they name, not their text', () => {
    expect(usageOfJobsReporting([
      {
        window: 'five_hour', lengthHours: 5, resetsAt: '2026-11-12T15:00:00.000Z', reportedAt: '2026-11-12T12:30:00+01:00'
      },
      {
        window: 'seven_day', lengthHours: 168, resetsAt: '2026-11-15T09:00:00.000Z', reportedAt: '2026-11-12T11:45:00Z'
      },
    ])).toMatchObject({ currentWindow: 'seven_day' });
  });

  test('a reset before now is passed on as reported, since a clock decides nothing', () => {
    expect(usageOfJobsReporting([{
      window: 'five_hour', lengthHours: 5, resetsAt: '2026-11-12T06:00:00.000Z', reportedAt: '2026-11-12T05:00:00.000Z'
    }]))
      .toMatchObject({ currentWindow: 'five_hour', currentWindowResetsAt: '2026-11-12T06:00:00.000Z' });
  });

  test('is null while no job on the board reported one', () => {
    expect(usageOfJobsReporting([null, null])).toMatchObject({ currentWindow: null, currentWindowResetsAt: null });
  });
});

describe('MonitorSnapshotAssembly.activityOf', () => {
  test('keeps the kinds a person cares about, oldest first, each at its position in the log', () => {
    expect(MonitorSnapshotAssembly.activityOf(LOG_RECORDS).map((entry) => [entry.logPosition, entry.category])).toEqual([
      [0, 'forge'], [1, 'needs-user'], [3, 'landed'], [4, 'agent'], [5, 'needs-user'], [6, 'forge'],
    ]);
  });

  test('holds the newest fifty entries and no more', () => {
    const notes = Array.from({ length: 60 }, (_unused, index) => ({ kind: 'note', at: '2026-11-12T08:00:00+01:00', fields: { text: `Example note ${index}` } }));
    const activity = MonitorSnapshotAssembly.activityOf(notes as unknown as LogRecord[]);
    expect([activity.length, activity[0]?.logPosition, activity.at(-1)?.logPosition]).toEqual([50, 10, 59]);
  });
});

const ENTITY_PIPELINE = {
  entities: {
    'forge':     { kind: 'app', home: ['/apps/forge'] },
    'contracts': { kind: 'package', home: ['/packages/contracts'] },
    'root':      { kind: 'root', home: ['/'] },
  },
} as unknown as Pipeline;

const ENTITY_TICKETS = [
  { frontmatter: { id: '001', status: 'in-progress', entity: 'forge' } },
  { frontmatter: { id: '002', status: 'delivered', entity: 'forge' } },
  { frontmatter: { id: '003', status: 'pending', entity: 'contracts' } },
  { frontmatter: { id: '008', status: 'abandoned' } },
  { frontmatter: { id: '009', status: 'draft' } },
] as unknown as Ticket[];

const TICKET_STAGES: Readonly<Record<string, TicketStage>> = { '001': { name: 'package-build', entity: 'contracts' } };

const ENTITY_BOARD = {
  ...BOARD,
  pipeline:      () => ENTITY_PIPELINE,
  tickets:       () => ENTITY_TICKETS,
  ticketStageOf: (ticketId: string) => TICKET_STAGES[ticketId] ?? null,
} as unknown as MonitorSnapshotSource['board'];

const ENTITY_JOBS: JobWithLiveFacts[] = [
  jobWith({
    id: 'J1', ticketIds: ['001'], entity: 'contracts', stage: 2
  }, {}, '2026-11-12T11:00:00+01:00'),
  jobWith({
    id: 'J5', kind: 'pipeline-agent', role: 'pipeline-agent', target: null, entity: 'forge'
  }, {}, '2026-11-12T10:05:00+01:00'),
  jobWith({
    id: 'J6', kind: 'merge', role: null, ticketIds: ['007'], state: 'merging'
  }, {}, '2026-11-12T11:45:00+01:00'),
];

const ENTITY_SOURCE: MonitorSnapshotSource = { ...SOURCE, board: ENTITY_BOARD, state: { ...STATE, jobs: ENTITY_JOBS } as unknown as BoardState };

describe('entities in the monitor snapshot', () => {
  test('a forge without entities gets no entity key on the snapshot or on any job', () => {
    const snapshot = MonitorSnapshotAssembly.monitorSnapshotOf(SOURCE);
    expect(Object.keys(snapshot)).not.toContain('entities');
    expect(Object.keys(snapshot)).not.toContain('openTickets');
    for (const job of snapshot.jobs) expect(Object.keys(job).filter((key) => key === 'entity' || key === 'stage'), job.id).toEqual([]);
  });

  test('lists each entity in the pipeline\'s order with its kind and home', () => {
    expect(MonitorSnapshotAssembly.monitorSnapshotOf(ENTITY_SOURCE).entities).toEqual([
      { key: 'forge', kind: 'app', home: ['/apps/forge'] },
      { key: 'contracts', kind: 'package', home: ['/packages/contracts'] },
      { key: 'root', kind: 'root', home: ['/'] },
    ]);
  });

  test('lists each open ticket in board order with its entity and stage, null where unassigned or uncrossed', () => {
    expect(MonitorSnapshotAssembly.monitorSnapshotOf(ENTITY_SOURCE).openTickets).toEqual([
      { id: '001', entity: 'forge', stage: { name: 'package-build', entity: 'contracts' } },
      { id: '003', entity: 'contracts', stage: null },
      { id: '009', entity: null, stage: null },
    ]);
  });

  test('gives a job its entity, and its stage\'s name only where it runs a stage', () => {
    const { jobs } = MonitorSnapshotAssembly.monitorSnapshotOf(ENTITY_SOURCE);
    expect(jobs.map(({ id, entity, stage }) => ({ id, entity, stage }))).toEqual([
      { id: 'J1', entity: 'contracts', stage: 'package-build' },
      { id: 'J5', entity: 'forge', stage: undefined },
      { id: 'J6', entity: undefined, stage: undefined },
    ]);
    expect(Object.keys(jobs[1] ?? {})).not.toContain('stage');
    expect(Object.keys(jobs[2] ?? {})).not.toContain('entity');
  });
});
