/**
 * agent-dashboard's `GET /api/summary` document. What matters: `summaryOf` answers `summaryVersion: 1` in exactly the shape
 * `testing/fixtures/summary-v1.json` holds, so a change to the shape agent-dashboard reads fails here. A new shape is a new version and a
 * new fixture, never an edit of this one. The state carries each open ticket's forecast, its targets named by the reading's merge
 * forecasting and `null` without one; the launch slots, as many as the concurrency counts; and each job's newest launch stamp, `null`
 * when the log lost it.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { LogRecord }              from '../../lib/tracker-model/@types/LogRecord.ts';
import type { MergeTargetOf }          from '../../lib/tracker-model/AirlockClaims.ts';
import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import {
  BoardStateAssembly,
  type BoardState,
  type BoardStateReading,
  type JobLiveFactsWithSilence,
  type MergeForecasting
} from './BoardState.ts';
import { liveJobFixture } from './testing/LiveJobFixture.ts';

const SUMMARY_FIXTURE_PATH = join(import.meta.dir, 'testing', 'fixtures', 'summary-v1.json');

const EXAMPLE_STATE = {
  ticketCountByStatus: { pending: 1, 'in-progress': 1 },
  page:                { payload: {}, tickets: [] },
  jobs:                [{
    id: 'J1', kind: 'build', ticketIds: ['001'], state: 'running', role: 'builder', attempt: 1, live: { tokens: 1200, toolCalls: 4 }
  }],
  decisions:  [{ id: 'D1' }],
  incidents:  [],
  notices:    [{ kind: 'new-code' }],
  mergeQueue: { queuedTicketIds: [], slots: [] },
  overseer:   {
    state: 'serving', paused: false, url: 'http://127.0.0.1:4100/', generation: 2, codeVersion: 'code-example', installVersion: 17, batonPassWarning: null
  },
  usage: { resetsAt: null, window: null },
} as unknown as BoardState;

describe('BoardStateAssembly.questionHistoryOf', () => {
  test('keeps every decision and incident record and the records of session jobs alone', () => {
    const at = '2026-10-29T20:00:00+01:00';
    const records = [
      {
        kind:   'job-launched',
        at,
        jobId:  'J1',
        fields: {
          kind: 'build', role: 'builder', ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
        }
      },
      {
        kind:   'job-launched',
        at,
        jobId:  'J2',
        fields: {
          kind: 'product-owner', role: 'product-owner', ticketIds: [], attempt: 1, target: null, parentJobId: null
        }
      },
      {
        kind: 'job-ended', at, jobId: 'J1', fields: { outcome: 'built' }
      },
      {
        kind: 'job-ended', at, jobId: 'J2', fields: { outcome: 'closed' }
      },
      {
        kind: 'decision-answered', at, decisionId: 'E1', fields: { answer: { 'Which?': 'Both' } }
      },
      {
        kind: 'incident-defaulted', at, incidentId: 'I1', fields: { move: 'ticket-park', cause: 'turn-closed' }
      },
      {
        kind: 'ticket-readied', at, ticketId: '005', fields: {}
      },
    ] as unknown as Parameters<typeof BoardStateAssembly.questionHistoryOf>[0];
    expect(BoardStateAssembly.questionHistoryOf(records).map((record) => record.kind)).toEqual([
      'job-launched', 'job-ended', 'decision-answered', 'incident-defaulted'
    ]);
  });
});

describe('BoardStateAssembly.endedJobsOf', () => {
  test('answers each ended job with its launch and newest ending, oldest first, a reopened job once in its newest ending\'s place', () => {
    const records = [
      {
        kind:   'job-launched',
        at:     '2026-10-29T20:00:00+01:00',
        jobId:  'J1',
        fields: {
          kind: 'assistant', role: 'assistant', ticketIds: [], attempt: 1, target: null, parentJobId: null
        }
      },
      {
        kind:   'job-launched',
        at:     '2026-10-29T20:00:01+01:00',
        jobId:  'J5',
        fields: {
          kind: 'merge', role: null, ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
        }
      },
      {
        kind: 'job-ended', at: '2026-10-29T20:00:02+01:00', jobId: 'J1', fields: { outcome: 'stopped', cause: 'overseer-stopped' }
      },
      {
        kind: 'job-ended', at: '2026-10-29T20:00:03+01:00', jobId: 'J5', fields: { outcome: 'landed', commit: 'c0ffee' }
      },
      {
        kind: 'job-ended', at: '2026-10-29T20:00:04+01:00', jobId: 'J1', fields: { outcome: 'stopped' }
      },
    ] as unknown as Parameters<typeof BoardStateAssembly.endedJobsOf>[0];
    expect(BoardStateAssembly.endedJobsOf(records)).toEqual([
      {
        id: 'J5', kind: 'merge', role: null, ticketIds: ['001'], target: 'main', attempt: 1, state: 'ended', outcome: 'landed', cause: null, endedAt: '2026-10-29T20:00:03+01:00'
      },
      {
        id:        'J1',
        kind:      'assistant',
        role:      'assistant',
        ticketIds: [],
        target:    null,
        attempt:   1,
        state:     'ended',
        outcome:   'stopped',
        cause:     null,
        endedAt:   '2026-10-29T20:00:04+01:00'
      },
    ]);
  });
});

describe('BoardStateAssembly.summaryOf', () => {
  test('answers summaryVersion 1 exactly as the fixture holds it', () => {
    const fixture: unknown = JSON.parse(readFileSync(SUMMARY_FIXTURE_PATH, 'utf8'));
    expect(BoardStateAssembly.summaryOf(EXAMPLE_STATE, 'Example Agency', ['002'])).toEqual(fixture as ReturnType<typeof BoardStateAssembly.summaryOf>);
  });
});

describe('BoardStateAssembly.boardStateOf', () => {
  const targetOf: MergeTargetOf = (ticket) => (ticket.group === undefined ? 'main' : `group-${ticket.group}`);

  function readingOf(mergeForecasting: MergeForecasting | null, logRecords: readonly LogRecord[] = []): BoardStateReading {
    const { board, progress, tickets } = boardFixture({
      tickets:  [ticketFixture({ id: '001', status: 'pending' }), ticketFixture({ id: '002', status: 'pending', dependsOn: ['001'] })],
      pipeline: { prepare: [], gates: [{ name: 'test', run: 'bun test' }] },
    });
    return {
      statusDocument: {},
      board,
      progress,
      tickets,
      epics:          [],
      drafts:         [],
      logRecords,
      generatedAt:    new Date('2026-11-10T10:00:00+01:00'),
      renderMarkdown: (markdown) => markdown,
      liveFactsOf:    () => ({}) as JobLiveFactsWithSilence,
      notices:        [],
      overseer:       EXAMPLE_STATE.overseer,
      usage:          EXAMPLE_STATE.usage,
      mergeForecasting,
    };
  }

  test('carries each open ticket\'s forecast with the targets the merge forecasting names', () => {
    const forecasting: MergeForecasting = { targetOf, branchTreeOf: () => null, forecastsOf: () => ({ againstTarget: {}, pairwiseConflicts: [] }) };
    const { ticketForecasts } = BoardStateAssembly.boardStateOf(readingOf(forecasting));
    expect(ticketForecasts.map((forecast) => forecast.ticketId)).toEqual(['001', '002']);
    expect(ticketForecasts[0]?.steps.at(-1)).toEqual({ kind: 'land', target: 'main' });
    expect(ticketForecasts[0]?.dependents).toEqual([{ ticketId: '002', stillWaitingOnTicketIds: [] }]);
  });

  test('names no target in a forecast when the reading carries no merge forecasting', () => {
    const { ticketForecasts } = BoardStateAssembly.boardStateOf(readingOf(null));
    expect(ticketForecasts[0]?.steps.at(-1)).toEqual({ kind: 'land', target: null });
  });

  function launched(jobId: string, at: string): LogRecord {
    return {
      kind:   'job-launched',
      jobId,
      fields: {
        kind: 'build', role: 'builder', ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
      },
      at,
    };
  }

  test('carries the launch slots, as many as the concurrency counts, and the in-progress tickets no job names', () => {
    const reading = readingOf(null);
    reading.progress.jobs = [
      liveJobFixture({ id: 'J1', ticketIds: ['001'] }),
      liveJobFixture({
        id: 'J2', kind: 'assistant', role: 'assistant', target: null
      }),
    ];
    const ticket = reading.board.ticketByReference('002');
    if (ticket !== undefined) ticket.frontmatter.status = 'in-progress';
    const { launchSlots } = BoardStateAssembly.boardStateOf(reading);
    expect(launchSlots).toEqual({ limit: reading.board.concurrency().limit, slotJobIds: ['J1'], inProgressTicketIdsWithoutJob: ['002'] });
    expect(launchSlots.slotJobIds).toHaveLength(reading.board.concurrency().agentsInFlight);
  });

  // A reopened job launches again: the elapsed time shown is the newest launch's.
  test('stamps each job with its newest launch record, and a job whose launch the log lost with null', () => {
    const reading = readingOf(null, [launched('J1', '2026-11-10T09:00:00+01:00'), launched('J1', '2026-11-10T09:30:00+01:00')]);
    reading.progress.jobs = [liveJobFixture({ id: 'J1', ticketIds: ['001'] }), liveJobFixture({ id: 'J2', ticketIds: ['002'] })];
    expect(BoardStateAssembly.boardStateOf(reading).jobs.map(({ id, launchedAt }) => ({ id, launchedAt }))).toEqual([
      { id: 'J1', launchedAt: '2026-11-10T09:30:00+01:00' },
      { id: 'J2', launchedAt: null },
    ]);
  });
});
