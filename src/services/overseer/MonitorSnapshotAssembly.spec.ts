/**
 * The `GET /api/monitor` document. What matters: for a board with one entry of every attention kind and one job of every role, plus a merge
 * job with none, `monitorSnapshotOf` answers `monitorVersion: 1` exactly as `testing/fixtures/monitor-v1.json` holds it, so a change to the
 * shape a monitor reads fails here; a new shape is a new version and a new fixture, never an edit of this one. Beside it: `activity` keeps
 * only the kinds a person cares about, newest last, each at its log position, and holds at most the newest fifty.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { LogRecord }                                                                 from '../../lib/tracker-model/@types/LogRecord.ts';
import type { BoardState, JobLiveFactsWithSilence, JobWithLiveFacts }                     from './BoardState.ts';
import { MonitorSnapshotAssembly, type MonitorOverseerFacts, type MonitorSnapshotSource } from './MonitorSnapshotAssembly.ts';
import { liveJobFixture }                                                                 from './testing/LiveJobFixture.ts';

const MONITOR_FIXTURE_PATH = join(import.meta.dir, 'testing', 'fixtures', 'monitor-v1.json');

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
  watcherProtocol:        2,
  watchOnly:              false,
  turn:                   null,
  messagesWaiting:        0,
  lastLine:               null,
  silentSweeps:           0,
};

function jobWith(job: Parameters<typeof liveJobFixture>[0], live: Partial<JobLiveFactsWithSilence>, launchedAt: string | null): JobWithLiveFacts {
  return { ...liveJobFixture(job), launchedAt, live: { ...IDLE_LIVE_FACTS, jobId: job.id, ...live } };
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
  }, '2026-11-12T11:00:00+01:00'),
  jobWith({
    id: 'J2', kind: 'review', role: 'reviewer', ticketIds: ['006'], attempt: 2
  }, { silentSweeps: 4, turn: 'between-turns' }, '2026-11-12T11:30:00+01:00'),
  jobWith({
    id: 'J3', kind: 'assistant', role: 'assistant', target: null
  }, { lastLine: { role: 'assistant', text: 'Example Assistant line', at: null }, messagesWaiting: 1 }, null),
  jobWith({
    id: 'J4', kind: 'product-owner', role: 'product-owner', target: null
  }, { lastLine: { role: 'user', text: 'Example request', at: null } }, '2026-11-12T10:00:00+01:00'),
  jobWith({
    id: 'J5', kind: 'onboarder', role: 'onboarder', target: null
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
};

const BOARD = {
  concurrency:         () => ({ limit: 3, agentsInFlight: 2, freeSlots: 1 }),
  readyTicketEntries:  () => [{ id: '003' }, { id: '004' }],
  ticketCountByStatus: () => ({
    'draft': 1, 'ready-for-review': 1, 'pending': 2, 'in-progress': 1, 'in-review': 0, 'reviewed': 1, 'delivered': 1, 'abandoned': 0,
  }),
} as unknown as MonitorSnapshotSource['board'];

const SOURCE: MonitorSnapshotSource = {
  state: STATE, project: 'Example Agency', board: BOARD, logRecords: LOG_RECORDS, overseer: OVERSEER, now: NOW
};

describe('MonitorSnapshotAssembly.monitorSnapshotOf', () => {
  test('answers monitorVersion 1 exactly as the fixture holds it, for every attention kind and every job role', () => {
    const fixture: unknown = JSON.parse(readFileSync(MONITOR_FIXTURE_PATH, 'utf8'));
    expect(JSON.parse(JSON.stringify(MonitorSnapshotAssembly.monitorSnapshotOf(SOURCE)))).toEqual(fixture);
  });

  test('the attention list holds every kind once', () => {
    expect(MonitorSnapshotAssembly.monitorSnapshotOf(SOURCE).attention.map((entry) => entry.kind).toSorted()).toEqual([
      'draft-ticket', 'escalated-question', 'filing-draft', 'merge-accept', 'question', 'review',
    ]);
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
