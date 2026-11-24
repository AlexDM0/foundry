/**
 * The Board's step that starts a ticket document's agent. What matters: with no agent on the board a fresh one launches in its document's
 * role, a plan agent carrying the approved spec version it writes for as its attempt; and an agent waiting for its next message resumes
 * its session in its next instance instead of a second agent launching.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, ticketFixture }                                                  from '../../testing/BoardFixtures.ts';
import { documentAgentJobFixture, documentMessageFixture, ticketDocumentRecordFixture } from '../../testing/TicketDocumentFixtures.ts';
import type { Job }                                                                     from './@types/Job.ts';
import type { Pipeline }                                                                from './@types/Pipeline.ts';
import type { LoadedTicketDocumentRecord }                                              from './@types/TicketDocument.ts';
import { FIXTURE_LIMITS, FIXTURE_OBSERVATIONS }                                         from './testing/LifecycleFixtures.ts';

const SPEC_TEXT = '# Basket\n\n## Acceptance\n\n1. Alex Example sees the total.\n';

const PIPELINE: Pipeline = {
  version: 5, prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], phases: { build: ['verify'], review: ['verify'], merge: ['verify'] }
};

function followedBoard(record: LoadedTicketDocumentRecord, jobs: Job[] = []): ReturnType<typeof boardFixture> {
  const fixture = boardFixture({ tickets: [ticketFixture({ id: '004', status: 'draft' })], pipeline: PIPELINE, ticketDocumentRecords: [record] });
  fixture.progress.jobs = jobs;
  fixture.progress.hephaestusState = 'running';
  fixture.board.followPlaybook(FIXTURE_LIMITS, FIXTURE_OBSERVATIONS, () => ({ questions: [], context: '' }));
  return fixture;
}

describe('launch-document-agent', () => {
  test('launches a fresh spec agent for a record with no spec', () => {
    const { board } = followedBoard(ticketDocumentRecordFixture('004', []));
    expect(board.jobs().map((job) => [job.kind, job.role, job.ticketIds, job.attempt, job.state])).toEqual([['document-agent', 'spec-agent', ['004'], 1, 'launching']]);
  });

  test('a plan agent carries the approved spec version it writes the plan for', () => {
    const record = ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC_TEXT, `${SPEC_TEXT}2. Alex Example pays.\n`], approvals: [{ number: 2 }] }]);
    const { board } = followedBoard(record);
    expect(board.jobs().map((job) => [job.role, job.attempt])).toEqual([['plan-agent', 2]]);
  });

  test('a waiting agent resumes its session for a queued message, and no second agent launches', () => {
    const record = ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC_TEXT], messages: [documentMessageFixture('M1')] }]);
    const { board, records } = followedBoard(record, [documentAgentJobFixture('004', 'spec', { state: 'awaiting-answer' })]);
    expect(board.jobs().map((job) => [job.id, job.state, job.childInstance])).toEqual([['J9', 'running', 2]]);
    expect(records.filter((logged) => logged.kind === 'job-launched')).toEqual([]);
  });
});
