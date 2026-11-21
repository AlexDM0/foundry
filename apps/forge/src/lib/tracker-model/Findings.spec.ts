/**
 * A worker's finding past its filing, on the Board. What matters: with ticket review off a complete finding is `committed` at once, yet the
 * Playbook launches no build for it until its finder is `reviewed`; with review on it waits in `ready-for-review`; an abandoned finder
 * leaves no finding waiting on it, each unstarted one moved to `ready-for-review` in the same hold, a started one keeping its status and
 * another job's ticket left alone; and only a board's first Overseer start puts the v16 low leftovers in `ready-for-review`, whatever the switch says.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import type { DecisionDraft }          from './@types/PlaybookStep.ts';
import type { TicketFrontmatter }      from './@types/Ticket.ts';
import { Board }                       from './Board.ts';
import { createLogger }                from './Logger.ts';
import {
  FIXTURE_AT,
  FIXTURE_LIMITS,
  FIXTURE_OBSERVATIONS,
  LIVE_ASSISTANT
} from './testing/LifecycleFixtures.ts';

const AT = FIXTURE_AT;

const COMPLETE_BODY = '## Acceptance\n1. It holds.\n\n## Brief\nBuild it.\n';

const CONCURRENCY_LIMIT = 4;

const EXAMPLE_CONTENT_HASH = '0123456789abcdef';

const wordingOf = (draft: DecisionDraft) => ({
  questions: [{
    question: `Decide ${draft.kind}`, header: draft.kind, multiSelect: false, options: []
  }],
  context: ''
});

/** A running Overseer's board with its Assistant up and gates set: ticket 001 in review by its builder J1, and the finding J1 filed. */
function boardWithFinding(ticketReviewIsOn: boolean, findingOverrides: Partial<TicketFrontmatter> = {}) {
  const board = new Board({
    progress: {
      trackerId:        'example-tracker-id',
      project:          'Example Agency',
      startedAt:        AT,
      view:             { kind: 'auto' },
      nextTaskId:       2,
      concurrencyLimit: CONCURRENCY_LIMIT,
      overseerState:    'running',
      nextJobId:        1,
      jobs:             [{ ...LIVE_ASSISTANT, id: 'J900' }],
      tasks:            [],
    },
    tickets:  [ticketFixture({ id: '001', status: 'in-review', task: 1 })],
    epics:    [],
    logger:   createLogger(() => undefined),
    pipeline: {
      version: 5, prepare: [], gates: [{ name: 'verify', run: 'bun run verify' }], phases: { build: ['verify'], review: ['verify'], merge: ['verify'] }, review: { name: 'Review' }
    },
  });
  board.setApproval('tickets', ticketReviewIsOn, AT);
  const builder = board.launchJob({
    kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT).job;
  board.endJob(builder.id, { outcome: 'built' }, AT);
  const finding = ticketFixture({
    id: '002', status: 'draft', priority: 'low', filedByJob: builder.id, dependsOn: ['001'], ...findingOverrides
  });
  finding.body = COMPLETE_BODY;
  board.fileTicket(finding, AT);
  if (finding.frontmatter.status === 'draft') board.submitDraftTickets(['002'], () => [], AT);
  return { board };
}

function buildLaunchedFor(board: Board, ticketId: string): boolean {
  return board.followPlaybook(FIXTURE_LIMITS, FIXTURE_OBSERVATIONS, wordingOf).steps
    .some((step) => step.kind === 'launch-build' && step.ticketId === ticketId);
}

describe('a finding waits for its finder', () => {
  test('with ticket review off it is committed at filing, and builds only once its finder is reviewed', () => {
    const { board } = boardWithFinding(false);
    expect(board.ticketByReference('002')?.frontmatter.status).toBe('committed');
    expect(buildLaunchedFor(board, '002')).toBe(false);

    board.moveTicket('001', 'reviewed', { checksLegality: false }, AT);
    expect(buildLaunchedFor(board, '002')).toBe(true);
  });

  test('with ticket review on it is ready-for-review at filing', () => {
    const { board } = boardWithFinding(true);
    expect(board.ticketByReference('002')?.frontmatter.status).toBe('ready-for-review');
  });
});

describe('an abandoned finder', () => {
  test('moves each unstarted finding to ready-for-review and out of its dependsOn, in the abandoning hold', () => {
    const { board } = boardWithFinding(false);
    const moved = board.moveTicket('001', 'abandoned', { checksLegality: false, reason: 'Superseded by an example' }, AT);
    const finding = board.ticketByReference('002')?.frontmatter;
    expect(finding?.status).toBe('ready-for-review');
    expect(finding?.dependsOn ?? []).toEqual([]);
    expect(moved.logged.map((record) => record.kind)).toContain('ticket-submitted-for-review');
  });

  test('a committed finding put before review drops its content hash, so a command edits it without keeping content', () => {
    const { board } = boardWithFinding(false);
    expect(board.ticketByReference('002')?.frontmatter.contentHash).toBeDefined();
    board.moveTicket('001', 'abandoned', { checksLegality: false, reason: 'Superseded by an example' }, AT);
    expect(board.ticketByReference('002')?.frontmatter.contentHash).toBeUndefined();

    const edited = board.editTicket('002', { body: { text: 'Replaced.\n', appends: false }, writtenBy: 'command' }, AT);
    expect(edited.changed).toBe(true);
    expect(edited.ticket.frontmatter.contentHash).toBeUndefined();
  });

  test('a finding already ready-for-review only loses the dependency', () => {
    const { board } = boardWithFinding(true);
    board.moveTicket('001', 'abandoned', { checksLegality: false, reason: 'Superseded by an example' }, AT);
    expect(board.ticketByReference('002')?.frontmatter).toMatchObject({ status: 'ready-for-review' });
    expect(board.ticketByReference('002')?.frontmatter.dependsOn ?? []).toEqual([]);
  });

  test('a started finding keeps its status but stops waiting on it; a ticket another job filed is left as it is', () => {
    const { board } = boardWithFinding(false, { status: 'in-progress', task: 2 });
    board.fileTicket(ticketFixture({
      id: '003', status: 'draft', filedByJob: 'J9', dependsOn: ['001']
    }), AT);
    board.moveTicket('001', 'abandoned', { checksLegality: false, reason: 'Superseded by an example' }, AT);
    expect(board.ticketByReference('002')?.frontmatter.status).toBe('in-progress');
    expect(board.ticketByReference('002')?.frontmatter.dependsOn ?? []).toEqual([]);
    expect(board.ticketByReference('003')?.frontmatter).toMatchObject({ status: 'draft', dependsOn: ['001'] });
  });
});

describe('the Overseer\'s first start', () => {
  function boardOfV16Tickets(): ReturnType<typeof boardFixture> {
    const fixture = boardFixture({
      tickets: [
        ticketFixture({
          id: '001', status: 'committed', priority: 'low', contentHash: EXAMPLE_CONTENT_HASH
        }),
        ticketFixture({ id: '002', status: 'committed', priority: 'normal' }),
        ticketFixture({ id: '003', status: 'committed', priority: 'high' }),
        ticketFixture({
          id: '004', status: 'committed', priority: 'low', hold: 'Example hold'
        }),
        ticketFixture({
          id: '005', status: 'committed', priority: 'low', contentHash: EXAMPLE_CONTENT_HASH
        }),
      ],
    });
    fixture.board.setNoGates(AT);
    fixture.board.setApproval('tickets', false, AT);
    return fixture;
  }

  test('puts every unheld low committed ticket in ready-for-review, though ticket review is off, asking User nothing', () => {
    const { board } = boardOfV16Tickets();
    board.submitFirstRunLeftovers(AT);
    expect(board.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['ready-for-review', 'committed', 'committed', 'committed', 'ready-for-review']);
    expect(board.tickets().filter((ticket) => ticket.frontmatter.status === 'ready-for-review').map((ticket) => ticket.frontmatter.contentHash))
      .toEqual([undefined, undefined]);
    expect(board.incidents()).toEqual([]);
    expect(board.decisions()).toEqual([]);
  });

  test('a board whose log holds overseer-started moves nothing, and neither does a fresh board', () => {
    const started = boardOfV16Tickets();
    started.board.recordOverseerStarted({ codeVersion: 'example', installVersion: 17 }, AT);
    expect(started.board.submitFirstRunLeftovers(AT).logged).toEqual([]);
    expect(boardFixture().board.submitFirstRunLeftovers(AT).logged).toEqual([]);
  });

  test('a start after clear threw the log away moves nothing: the first start is kept in progress.json', () => {
    const { board, progress, tickets } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'committed', priority: 'normal' })] });
    board.submitFirstRunLeftovers(AT);
    board.recordOverseerStarted({ codeVersion: 'example', installVersion: 17 }, AT);
    board.clearTracker({ ticketsSurvive: true }, AT);

    const ticketsAfterClear = [...tickets, ticketFixture({ id: '002', status: 'committed', priority: 'low' })];
    const restarted         = new Board({
      progress, tickets: ticketsAfterClear, epics: [], logger: createLogger(() => undefined)
    });
    expect(restarted.submitFirstRunLeftovers(AT).logged).toEqual([]);
    expect(restarted.tickets().map((ticket) => ticket.frontmatter.status)).toEqual(['committed', 'committed']);
  });
});
