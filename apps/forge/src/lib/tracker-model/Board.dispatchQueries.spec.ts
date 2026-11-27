/**
 * A review is in flight on any row storing `reviewOf`, as a claim counts it, and a ticket's linked row is the one its `task` names. The free
 * slots shown are the builds the Playbook launches, so the figure and the launch gate never disagree. A committed ticket's documents hold it
 * while not in order or unreadable, never judged by the body instead.
 */
import { describe, expect, test } from 'bun:test';

import {
  boardFixture,
  refusalDetailOf,
  taskFixture,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import { loadedRecordFixture } from '../../testing/TicketDocumentRecordFixtures.ts';
import { Board }               from './Board.ts';
import { createLogger }        from './Logger.ts';
import {
  FIXTURE_AT,
  FIXTURE_LIMITS,
  FIXTURE_OBSERVATIONS,
  LIVE_ASSISTANT,
  jobFixture
} from './testing/LifecycleFixtures.ts';
import { PipelineUtil } from './utils/PipelineUtil.ts';

describe('the ticket ids in flight', () => {
  test('come once each in row order, from in-progress rows that belong to a ticket only', () => {
    const { board } = boardFixture({
      tasks: [
        taskFixture({ id: 1, status: 'in-progress', ticket: '003' }),
        taskFixture({ id: 2, status: 'paused', ticket: '001' }),
        taskFixture({ id: 3, status: 'in-review', ticket: '004' }),
        taskFixture({ id: 4, status: 'in-progress' }),
        taskFixture({ id: 5, status: 'in-progress', ticket: '002' }),
        taskFixture({ id: 6, status: 'in-progress', ticket: '003' }),
      ],
    });

    expect(board.inProgressTicketIds()).toEqual(['003', '002']);
  });
});

describe('the review-of ids in flight', () => {
  // A ticket-owned row storing `reviewOf` blocks a claim and is closed by a move out of review, so it is a reviewer at work here too.
  test('include a ticket-owned in-progress row storing reviewOf, once each in row order', () => {
    const { board } = boardFixture({
      tasks: [
        taskFixture({
          id:       1,
          status:   'in-progress',
          ticket:   '005',
          reviewOf: '002',
        }),
        taskFixture({
          id:             2,
          status:         'in-progress',
          reviewOf:       '001',
          reviewBarRound: 1,
        }),
        taskFixture({
          id:             3,
          status:         'in-progress',
          reviewOf:       '002',
          reviewBarRound: 1,
        }),
      ],
    });

    expect(board.inProgressReviewOfIds()).toEqual(['002', '001']);
  });

  test('skip a delivered or paused bar', () => {
    const { board } = boardFixture({
      tasks: [
        taskFixture({
          id:             1,
          status:         'delivered',
          reviewOf:       '001',
          reviewBarRound: 1,
        }),
        taskFixture({
          id:             2,
          status:         'paused',
          reviewOf:       '002',
          reviewBarRound: 1,
        }),
      ],
    });

    expect(board.inProgressReviewOfIds()).toEqual([]);
  });
});

describe('the rows reviewing a ticket', () => {
  // A dispatcher's reviewer and parking agent read these, so they must match what counts as a review in flight.
  test('are every row storing its reviewOf, a ticket-owned one and a delivered one included, oldest filed first', () => {
    const { board } = boardFixture({
      tasks: [
        taskFixture({
          id: 4, status: 'in-progress', reviewOf: '001', reviewBarRound: 2
        }),
        taskFixture({
          id: 3, status: 'in-progress', ticket: '005', reviewOf: '001'
        }),
        taskFixture({
          id: 1, status: 'delivered', reviewOf: '001', reviewBarRound: 1
        }),
        taskFixture({ id: 2, status: 'in-progress', reviewOf: '002' }),
      ],
    });

    expect(board.reviewRowsOf('001').map((task) => task.id)).toEqual([1, 3, 4]);
  });
});

describe('the tickets waiting on a review', () => {
  test('are the in-review tickets no in-progress row reviews, in ticket order', () => {
    const { board } = boardFixture({
      tasks: [
        taskFixture({
          id:             1,
          status:         'in-progress',
          reviewOf:       '002',
          reviewBarRound: 1,
        }),
        taskFixture({
          id:             2,
          status:         'delivered',
          reviewOf:       '003',
          reviewBarRound: 1,
        }),
      ],
      tickets: [
        ticketFixture({ id: '001', status: 'in-review', hold: '' }),
        ticketFixture({ id: '002', status: 'in-review' }),
        ticketFixture({ id: '003', status: 'in-review' }),
      ],
    });

    expect(board.reviewWaitingTickets().map((ticket) => ticket.frontmatter.id)).toEqual(['001', '003']);
  });

  test('never list a committed, in-progress or reviewed ticket', () => {
    const { board } = boardFixture({
      tickets: [
        ticketFixture({ id: '001', status: 'committed' }),
        ticketFixture({ id: '002', status: 'in-progress' }),
        ticketFixture({ id: '003', status: 'reviewed' }),
      ],
    });

    expect(board.reviewWaitingTickets()).toEqual([]);
  });

  // The ticket-owned row is no review bar, yet it is a reviewer at work, so the ticket is not handed to a second one.
  test('leave out a ticket its own in-progress row stores reviewOf for', () => {
    const { board } = boardFixture({
      tasks: [taskFixture({
        id:       1,
        status:   'in-progress',
        ticket:   '001',
        reviewOf: '001',
      })],
      tickets: [ticketFixture({ id: '001', status: 'in-review', task: 1 })],
    });

    expect(board.reviewWaitingTickets()).toEqual([]);
  });
});

describe('a release group awaiting its release', () => {
  // A whole-board run building, reviewing or resuming a group's ticket would take it off the main line mid-group; the group run owns them.
  function groupBoardFixture(releaseTicketStatus: 'in-progress' | 'delivered' | 'abandoned' | null): ReturnType<typeof boardFixture> {
    return boardFixture({
      tasks: [
        taskFixture({ id: 1, status: 'paused', ticket: '003' }),
        taskFixture({ id: 2, status: 'paused', ticket: '007' }),
        taskFixture({ id: 3, status: 'in-progress', ticket: '005' }),
      ],
      tickets: [
        ticketFixture({ id: '001', group: 'example-group' }),
        ticketFixture({ id: '002', status: 'in-review', group: 'example-group' }),
        ticketFixture({
          id:     '003',
          status: 'in-progress',
          group:  'example-group',
          task:   1,
        }),
        ticketFixture({ id: '004' }),
        ticketFixture({
          id:     '005',
          status: releaseTicketStatus ?? 'in-progress',
          group:  'example-group',
          task:   3,
          ...(releaseTicketStatus === null ? {} : { releasesGroup: true as const }),
        }),
        ticketFixture({ id: '006', status: 'in-review' }),
        ticketFixture({
          id:     '007',
          status: 'in-progress',
          task:   2,
        }),
        ticketFixture({ id: '008', group: 'other-group' }),
      ],
    });
  }

  function wholeBoardListsOf(board: ReturnType<typeof boardFixture>['board']): Record<string, string[]> {
    return {
      readyTicketIds:       board.dispatchCapacity().readyTicketIds,
      readyTickets:         board.readyTicketEntries().map((entry) => entry.id),
      reviewWaitingTickets: board.reviewWaitingTickets().map((ticket) => ticket.frontmatter.id),
      pausedBuildTickets:   board.pausedBuildTickets().map((ticket) => ticket.frontmatter.id),
    };
  }

  test('keeps every ticket of the group out of the ready, review-waiting and paused-build lists, and only those', () => {
    const { board } = groupBoardFixture('in-progress');

    const lists = wholeBoardListsOf(board);

    expect(lists).toEqual({
      readyTicketIds:       ['004', '008'],
      readyTickets:         ['004', '008'],
      reviewWaitingTickets: ['006'],
      pausedBuildTickets:   ['007'],
    });
    expect(Object.values(lists).flat().filter((ticketId) => ['001', '002', '003', '005'].includes(ticketId))).toHaveLength(0);
  });

  test('lists the group\'s remaining open tickets again once its release ticket is delivered or abandoned, as a group with none', () => {
    for (const settledStatus of ['delivered', 'abandoned'] as const) {
      const { board } = groupBoardFixture(settledStatus);

      expect(board.releaseBundleOf('example-group')).toEqual([]);
      expect(wholeBoardListsOf(board)).toEqual(wholeBoardListsOf(groupBoardFixture(null).board));
      expect(wholeBoardListsOf(board)).toEqual({
        readyTicketIds:       ['001', '004', '008'],
        readyTickets:         ['001', '004', '008'],
        reviewWaitingTickets: ['002', '006'],
        pausedBuildTickets:   ['003', '007'],
      });
    }
  });

  test('lists a group with no release ticket exactly as an ungrouped one', () => {
    const { board } = groupBoardFixture(null);

    expect(wholeBoardListsOf(board)).toEqual({
      readyTicketIds:       ['001', '004', '008'],
      readyTickets:         ['001', '004', '008'],
      reviewWaitingTickets: ['002', '006'],
      pausedBuildTickets:   ['003', '007'],
    });
  });

  // Ready means build: a group's unreleased work no longer keeps a low ticket out.
  test('holds no low work back with the group\'s tickets it leaves out', () => {
    const { board } = boardFixture({
      tickets: [
        ticketFixture({ id: '001', status: 'reviewed', group: 'example-group' }),
        ticketFixture({
          id:            '002',
          status:        'in-progress',
          group:         'example-group',
          releasesGroup: true,
        }),
        ticketFixture({ id: '003', priority: 'low' }),
      ],
    });

    expect(board.dispatchCapacity().readyTicketIds).toEqual(['003']);
  });
});

describe('held normal and high work', () => {
  const HELD_AT = '2026-09-29T12:00:00+02:00';

  function heldWorkBoard(): ReturnType<typeof boardFixture> {
    return boardFixture({
      tickets: [
        ticketFixture({ id: '001', hold: 'waiting on the design' }),
        ticketFixture({
          id:       '002',
          status:   'in-progress',
          priority: 'high',
          hold:     '',
        }),
        ticketFixture({ id: '003', priority: 'low' }),
        ticketFixture({ id: '004', priority: 'low', dependsOn: ['005'] }),
        ticketFixture({ id: '005', status: 'delivered' }),
      ],
      concurrencyLimit: 2,
    });
  }

  test('holds no low work back: the low tickets with settled dependencies are ready, listed and claimable', () => {
    const { board } = heldWorkBoard();

    expect(board.dispatchCapacity().readyTicketIds).toEqual(['001', '003', '004']);
    expect(board.readyTicketEntries().map((entry) => entry.id)).toEqual(['001', '003', '004']);
    expect(board.claimTickets(['003'], { owner: 'Alex Example' }, HELD_AT).tickets.map((ticket) => ticket.frontmatter.status)).toEqual(['in-progress']);
  });

  test('unholding one changes only its held flag: the low tickets stay ready behind it', () => {
    const { board } = heldWorkBoard();
    board.unholdTicket('001', HELD_AT);

    expect(board.dispatchCapacity().readyTicketIds).toEqual(['001', '003', '004']);
    expect(board.readyTicketEntries().find((entry) => entry.id === '001')?.held).toBeUndefined();
  });

  test('leaves a held low ticket flagged held, and a claim of it refused', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', hold: '' }), ticketFixture({ id: '002', priority: 'low', hold: 'later' })] });

    expect(board.readyTicketEntries().find((entry) => entry.id === '002')?.held).toBe(true);
    expect(refusalDetailOf(() => board.claimTickets(['002'], { owner: 'Alex Example' }, HELD_AT))).toEqual({ reason: 'claim-of-a-held-ticket', ticketId: '002' });
  });
});

describe('unheld normal and high work', () => {
  test.each(['committed', 'in-progress', 'in-review'] as const)('holds no low work back while %s', (status) => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status }), ticketFixture({ id: '002', priority: 'low' })] });

    expect(board.dispatchCapacity().readyTicketIds).toContain('002');
  });

  test('holds no low work back as a reviewed release-bundle ticket awaiting its release', () => {
    const { board } = boardFixture({
      tickets: [
        ticketFixture({ id: '001', status: 'reviewed', group: 'example-group' }),
        ticketFixture({
          id:            '002',
          status:        'in-review',
          group:         'example-group',
          dependsOn:     ['001'],
          releasesGroup: true,
          hold:          '',
        }),
        ticketFixture({ id: '003', priority: 'low' }),
      ],
    });

    expect(board.dispatchCapacity().readyTicketIds).toEqual(['003']);
  });
});

describe('a ready ticket entry', () => {
  test('carries its group, and none when the ticket has none, as its frontmatter does', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', group: 'example-group' }), ticketFixture({ id: '002' })] });

    expect(board.readyTicketEntries()).toEqual([
      {
        id:       '001',
        priority: 'normal',
        model:    expect.any(String),
        effort:   expect.any(String),
        group:    'example-group',
      },
      {
        id:       '002',
        priority: 'normal',
        model:    expect.any(String),
        effort:   expect.any(String),
      },
    ]);
  });
});

describe('the row a ticket links', () => {
  test('is the row its frontmatter task names, even when an earlier row names the ticket', () => {
    const { board } = boardFixture({
      tasks: [
        taskFixture({ id: 1, ticket: '001' }),
        taskFixture({ id: 2, ticket: '001' }),
      ],
      tickets: [ticketFixture({ id: '001', task: 2 })],
    });

    expect(board.linkedRowOf('001')?.id).toBe(2);
    expect(board.ownRowOf('001')?.id).toBe(1);
  });

  test('is null for a ticket without one, and for one naming a row that is gone', () => {
    const { board } = boardFixture({
      tasks:   [taskFixture({ id: 1, ticket: '001' })],
      tickets: [ticketFixture({ id: '001', task: null }), ticketFixture({ id: '002', task: 7 })],
    });

    expect(board.linkedRowOf('001')).toBeNull();
    expect(board.linkedRowOf('002')).toBeNull();
  });
});

describe('the concurrency figure', () => {
  // The Next line, `status`, `concurrency` and the header read this figure; the Playbook's launch gate decides from the same count.
  test('leaves free exactly the slots the Playbook fills with builds when enough tickets are ready', () => {
    const board = new Board({
      progress: {
        trackerId:        'example-tracker-id',
        project:          'Example Agency',
        startedAt:        FIXTURE_AT,
        view:             { kind: 'auto' },
        nextTaskId:       2,
        concurrencyLimit: 4,
        hephaestusState:  'running',
        nextJobId:        4,
        jobs:             [
          { ...LIVE_ASSISTANT },
          jobFixture({ id: 'J1', ticketIds: ['001'] }),
          jobFixture({
            id: 'J2', kind: 'review', role: 'reviewer', ticketIds: ['002'], state: 'waiting-for-answer'
          }),
          jobFixture({
            id: 'J3', kind: 'merge-agent', role: 'builder', ticketIds: ['003']
          }),
        ],
        tasks: [taskFixture({ id: 1, status: 'in-progress' })],
      },
      tickets: [
        ticketFixture({ id: '001', status: 'in-progress' }),
        ticketFixture({ id: '002', status: 'in-review' }),
        ticketFixture({ id: '003', status: 'in-review' }),
        ...['004', '005', '006', '007'].map((id) => ticketFixture({ id })),
      ],
      epics:    [],
      logger:   createLogger(() => undefined),
      pipeline: {
        version: 5,
        prepare: [],
        gates:   [{ name: 'verify', run: 'bun run verify' }],
        phases:  { build: ['verify'], review: ['verify'], merge: ['verify'] },
        review:  { name: 'Review' },
      },
    });

    const { freeSlots } = board.concurrency();
    const { steps }     = board.followPlaybook(FIXTURE_LIMITS, FIXTURE_OBSERVATIONS, () => ({ questions: [], context: '' }));
    const buildLaunches = steps.filter((step) => step.kind === 'launch-build');

    expect(freeSlots).toBe(2);
    expect(buildLaunches).toHaveLength(freeSlots);
  });
});

// A query that marked a ticket would have a mutating command that asked it rewrite a ticket file nothing changed.
test('none of these queries changes a record or marks a ticket changed', () => {
  const fixture = boardFixture({
    tasks:   [taskFixture({ id: 1, status: 'in-progress', ticket: '001' }), taskFixture({ id: 2, status: 'in-progress', reviewOf: '002' })],
    tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 }), ticketFixture({ id: '002', status: 'in-review' })],
  });
  const progressAsRead = structuredClone(fixture.progress);
  const ticketsAsRead  = structuredClone(fixture.tickets);
  const { board }      = fixture;

  board.inProgressTicketIds();
  board.inProgressReviewOfIds();
  board.reviewWaitingTickets();
  board.reviewRowsOf('002');
  board.linkedRowOf('001');

  expect(fixture.progress).toEqual(progressAsRead);
  expect(fixture.tickets).toEqual(ticketsAsRead);
  expect(board.changedTickets()).toEqual([]);
});

describe('the hold a committed ticket\'s documents put on it', () => {
  const SPEC_V1 = '## Acceptance\n\nA1. The basket shows.\n';
  const SPEC_V2 = '## Acceptance\n\nA1. The basket shows.\nA2. The total shows.\n';
  const PLAN    = '## Files\n\nWork belongs in: apps/web/src/Basket.ts\n';

  function committedTicketWith(record: ReturnType<typeof loadedRecordFixture>, pipeline = PipelineUtil.minimalPipelineOf()): Board {
    return boardFixture({
      tickets:               [ticketFixture({ id: '004', status: 'committed', task: 1 })],
      tasks:                 [taskFixture({ id: 1, status: 'committed', ticket: '004' })],
      pipeline:              { ...pipeline, ticketWriting: 'spec-then-plan' },
      ticketDocumentRecords: [record],
    }).board;
  }

  const changedSpec = (): ReturnType<typeof loadedRecordFixture> => loadedRecordFixture('004', {
    spec: { texts: [SPEC_V1, SPEC_V2], approvals: [{ number: 1, by: 'person' }] },
    plan: { texts: [PLAN], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] },
  });

  test('a ticket whose documents are in order is ready and held by nothing', () => {
    const board = committedTicketWith(loadedRecordFixture('004', {
      spec: { texts: [SPEC_V1], approvals: [{ number: 1, by: 'person' }] },
      plan: { texts: [PLAN], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] },
    }));
    expect(board.readyTickets().map((ticket) => ticket.frontmatter.id)).toEqual(['004']);
    expect(board.heldTicketIds()).toEqual([]);
  });

  test('a spec changed after its approval holds the build: the ticket is not ready, is held, and its frontmatter keeps no hold', () => {
    const board = committedTicketWith(changedSpec());
    expect(board.readyTickets()).toEqual([]);
    expect(board.heldTicketIds()).toEqual(['004']);
    expect(board.ticketByReference('004')?.frontmatter.hold).toBeUndefined();
  });

  test('a ticket whose documents record cannot be read is held and never ready, not judged by its body', () => {
    const fixture = boardFixture({
      tickets:                     [ticketFixture({ id: '004', status: 'committed', task: 1 }), ticketFixture({ id: '005', status: 'draft' })],
      tasks:                       [taskFixture({ id: 1, status: 'committed', ticket: '004' })],
      pipeline:                    { ...PipelineUtil.minimalPipelineOf(), ticketWriting: 'spec-then-plan' },
      unreadableTicketDocumentIds: ['004', '005'],
    });
    expect(fixture.board.readyTickets()).toEqual([]);
    expect(fixture.board.heldTicketIds()).toEqual(['004']);
    const incompleteTickets = [{ ticketId: '005', gaps: ['spec-unapproved', 'plan-unapproved'] as const }];
    expect(refusalDetailOf(() => fixture.board.readyDraftTickets(['005'], () => [], FIXTURE_AT))).toEqual({ reason: 'incomplete-tickets', incompleteTickets });
  });

  test('a plan the builder never reads holds nothing', () => {
    const record = loadedRecordFixture('004', {
      spec: { texts: [SPEC_V1], approvals: [{ number: 1, by: 'person' }] },
      plan: { texts: [PLAN, `${PLAN}More.\n`], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] },
    });
    const pipeline = { ...PipelineUtil.minimalPipelineOf(), agents: { builder: { documents: { plan: 'never' as const } } } };
    expect(committedTicketWith(record, pipeline).readyTickets().map((ticket) => ticket.frontmatter.id)).toEqual(['004']);
    expect(committedTicketWith(record).readyTickets()).toEqual([]);
  });

  test('the Playbook launches the build of a ticket whose documents are in order, and none of one its documents hold', () => {
    const buildLaunchesWith = (record: ReturnType<typeof loadedRecordFixture>): number => {
      const board = new Board({
        progress: {
          trackerId:       'example-tracker-id',
          project:         'Example Agency',
          startedAt:       FIXTURE_AT,
          view:            { kind: 'auto' },
          nextTaskId:      2,
          nextJobId:       2,
          hephaestusState: 'running',
          jobs:            [{ ...LIVE_ASSISTANT }],
          tasks:           [taskFixture({ id: 1, status: 'committed', ticket: '004' })],
        },
        tickets:  [ticketFixture({ id: '004', status: 'committed', task: 1 })],
        epics:    [],
        logger:   createLogger(() => undefined),
        pipeline: {
          version:       5,
          prepare:       [],
          gates:         [{ name: 'verify', run: 'bun run verify' }],
          phases:        { build: ['verify'], review: ['verify'], merge: ['verify'] },
          ticketWriting: 'spec-then-plan',
        },
        ticketDocumentRecords: [record],
      });
      const { steps } = board.followPlaybook(FIXTURE_LIMITS, FIXTURE_OBSERVATIONS, () => ({ questions: [], context: '' }));
      return steps.filter((step) => step.kind === 'launch-build').length;
    };
    expect(buildLaunchesWith(loadedRecordFixture('004', {
      spec: { texts: [SPEC_V1], approvals: [{ number: 1, by: 'person' }] },
      plan: { texts: [PLAN], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] },
    }))).toBe(1);
    expect(buildLaunchesWith(changedSpec())).toBe(0);
  });
});
