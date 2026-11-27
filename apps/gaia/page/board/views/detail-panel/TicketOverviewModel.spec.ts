/**
 * The ticket form's Overview: the live job joined by `ticketIds` (build, review or merge-agent only), the state card and its cue, the lead
 * and other moves exactly as the forge offers them, Next's steps, the facts, the live job's controls worded with the ticket, branch and
 * hold, the newest open incident, and the ticket's spec and plan with their standing.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDocument }    from '../../../@types/board/BoardDocument.ts';
import type { BoardJobDocument } from '../../../@types/board/BoardJobDocuments.ts';
import type { BoardJobState }    from '../../../@types/board/BoardVocabulary.ts';
import {
  EXAMPLE_DETAIL_FORMAT,
  exampleDetailBoard,
  exampleDetailIncident,
  exampleDetailJob,
  exampleDetailRow,
  exampleDetailTicket,
  exampleStampAt,
  exampleTicketForecast
} from '../../testing/DetailBoardFixture.ts';
import { DetailControlsModelUtil } from './DetailControlsModel.ts';
import { DetailFactsModel }        from './DetailFactsModel.ts';
import {
  TicketOverviewModelUtil,
  type NextStepModel,
  type TextPartModel,
  type TicketOverviewModel
} from './TicketOverviewModel.ts';

const BUILDING = exampleDetailTicket('004', {
  status: 'in-progress', started: exampleStampAt('12:41'), task: 4, group: 'account', branch: 'ticket-004'
});

const BUILDING_ROW = exampleDetailRow(4, {
  ticket: '004', status: 'in-progress', start: exampleStampAt('12:41'), history: [{ status: 'in-progress', at: exampleStampAt('13:35') }]
});

function overviewOf(board: BoardDocument, ticketId: string): TicketOverviewModel {
  const ticket = board.page.tickets.find((candidate) => candidate.id === ticketId);
  if (ticket === undefined) throw new Error(`no ticket ${ticketId}`);
  const facts = board.page.facts.tickets.find((candidate) => candidate.ticketId === ticketId);
  const { ownRow, reviewRows } = DetailFactsModel.ticketRowsOf(board, ticketId);
  return TicketOverviewModelUtil.overviewOf({
    board,
    ticket,
    displayState: facts?.displayState ?? ticket.status,
    waitingOn:    facts?.waitingOnTicketIds ?? [],
    ownRow,
    reviewRows,
    controls:     DetailControlsModelUtil.controlsOf(ticket, board.mergeQueue),
    format:       EXAMPLE_DETAIL_FORMAT,
  });
}

function wordsOf(parts: readonly TextPartModel[]): string {
  return parts.map((part) => (part.kind === 'link' ? part.link.text : part.text)).join('');
}

function stepTexts(steps: readonly NextStepModel[] | null): string[] {
  return (steps ?? []).map((step) => wordsOf(step.parts));
}

describe('the live job', () => {
  const board = exampleDetailBoard({ tickets: [BUILDING], rows: [BUILDING_ROW], jobs: [exampleDetailJob('J4', '004')] });

  test('a running build reads Building, its job, role, attempt, calls against budget and no tool call yet, and leads with Watch', () => {
    const { now, lead } = overviewOf(board, '004');
    expect(now.heading).toBe('Building');
    expect(now.job).toEqual({
      jobId:        'J4',
      roleText:     'builder',
      attempt:      1,
      since:        { shortText: '13:35', fullText: '2026-09-18 13:35' },
      elapsedText:  '1m',
      callsText:    '0 / 150',
      lastToolText: 'no tool call yet',
    });
    expect(now.note).toBeNull();
    expect(lead).toEqual({ kind: 'watch-job', jobId: 'J4', effect: [{ kind: 'text', text: 'Opens J4\'s transcript on Agents.' }] });
  });

  test('a stamp later than now shows no elapsed time', () => {
    const backfilled = exampleDetailRow(4, { ticket: '004', status: 'in-progress', history: [{ status: 'in-progress', at: exampleStampAt('14:00') }] });
    const later = exampleDetailBoard({ tickets: [BUILDING], rows: [backfilled], jobs: [exampleDetailJob('J4', '004')] });
    expect(overviewOf(later, '004').now.job?.elapsedText).toBeNull();
  });

  test('a review job reads Reviewing from its newest review row\'s start; Customs, the gate, the merge of main and the landing name their own step', () => {
    const reviewRow = exampleDetailRow(7, { reviewOf: '004', status: 'in-review', start: exampleStampAt('13:00') });
    const reviewing = exampleDetailBoard({ tickets: [BUILDING], rows: [BUILDING_ROW, reviewRow], jobs: [exampleDetailJob('J9', '004', { kind: 'review', role: 'reviewer' })] });
    expect([overviewOf(reviewing, '004').now.heading, overviewOf(reviewing, '004').now.job?.since?.shortText]).toEqual(['Reviewing', '13:00']);
    const headingIn = (state: BoardJobState) => overviewOf(exampleDetailBoard({ tickets: [BUILDING], jobs: [exampleDetailJob('J4', '004', { state })] }), '004').now.heading;
    expect((['in-customs', 'gating', 'merging-main', 'landing'] as const).map(headingIn)).toEqual(['In Customs', 'Gating', 'Merging main', 'Landing']);
  });

  test('the state card\'s Flint slot is cued that a build writes, a review reviews, and no job is idle', () => {
    const reviewing = exampleDetailBoard({ tickets: [BUILDING], rows: [BUILDING_ROW], jobs: [exampleDetailJob('J9', '004', { kind: 'review', role: 'reviewer' })] });
    const idle = exampleDetailBoard({ tickets: [BUILDING], rows: [BUILDING_ROW] });
    expect([board, reviewing, idle].map((state) => overviewOf(state, '004').now.flintCue)).toEqual(['agent-writes', 'agent-reviews', 'agent-is-idle']);
  });

  test('the state card\'s Flint slot is idle while the ticket\'s job does not run, though the card still names the job', () => {
    const cueIn = (state: BoardJobState) => overviewOf(exampleDetailBoard({ tickets: [BUILDING], jobs: [exampleDetailJob('J4', '004', { state })] }), '004').now;
    expect((['gating', 'waiting-for-answer', 'stopping'] as const).map((state) => [cueIn(state).flintCue, cueIn(state).job === null]))
      .toEqual([['agent-is-idle', false], ['agent-is-idle', false], ['agent-is-idle', false]]);
  });

  test('a job waiting after a network outage or a lost supervision heads the card by its cause, and any other interruption by its kind', () => {
    const headingAfter = (interruption: BoardJobDocument['interruption']) => {
      const job = exampleDetailJob('J4', '004', { state: 'interrupted', interruption });
      return overviewOf(exampleDetailBoard({ tickets: [BUILDING], jobs: [job] }), '004').now.heading;
    };
    expect([headingAfter('network-outage'), headingAfter('lease-ended'), headingAfter('reboot')]).toEqual(['Network outage', 'Not supervised', 'Building']);
  });

  test('a session naming the ticket is never joined', () => {
    const session = exampleDetailJob('J7', '004', { kind: 'assistant', role: 'assistant' });
    const { now, lead } = overviewOf(exampleDetailBoard({ tickets: [BUILDING], jobs: [session] }), '004');
    expect(now.job).toBeNull();
    expect(lead).toBeNull();
  });

  test('the calls show alone without a budget, and the last tool call while it runs', () => {
    const { live } = exampleDetailJob('J4', '004');
    const job = exampleDetailJob('J4', '004', {
      live: {
        ...live, calls: 12, callBudget: null, lastToolCall: { toolName: 'Bash', startedAt: null, running: true }
      }
    });
    const { now } = overviewOf(exampleDetailBoard({ tickets: [BUILDING], jobs: [job] }), '004');
    expect([now.job?.callsText, now.job?.lastToolText]).toEqual(['12', 'Bash running']);
  });
});

describe('the live job\'s controls', () => {
  const BUILDING_TITLED = { ...BUILDING, title: 'Account pages dark mode' };

  function controlsOf(job: BoardJobDocument, ticket = BUILDING_TITLED) {
    return overviewOf(exampleDetailBoard({ tickets: [ticket], rows: [BUILDING_ROW], jobs: [job] }), '004').jobControls;
  }

  test('a building J4 takes a message and offers Wind down, Stop and Fresh agent, each naming the ticket, its branch and the hold it leaves', () => {
    const controls = controlsOf(exampleDetailJob('J4', '004'));
    expect(controls?.label).toBe('Builder J4 controls');
    expect(controls?.stopping).toBe(false);
    expect(controls?.messages).toBe(true);
    expect(controls?.stopItems.map(({
      move, label, description, question, confirmLabel, consequence
    }) => [move, label, description, question, confirmLabel, wordsOf(consequence)])).toEqual([
      [
        'wind-down',
        'Wind down J4',
        'J4 gets a wind-down turn, then ends; #004 is held.',
        'Wind down J4?',
        'Wind down J4',
        'J4 wraps up its work on #004 Account pages dark mode in a wind-down turn, then ends. Branch ticket-004 and its worktree stay as they '
        + 'are. #004 is held wound down by User (J4) until User unholds it.',
      ],
      [
        'stop',
        'Stop J4',
        'Ends J4\'s session now; #004 is held.',
        'Stop J4 now?',
        'Stop J4',
        'Ends J4\'s session on #004 Account pages dark mode in the middle of its turn. Branch ticket-004 and its worktree stay as they are. '
        + '#004 is held stopped by User (J4) until User unholds it.',
      ],
      [
        'fresh',
        'Fresh agent',
        'Ends J4\'s session and starts a new builder on ticket-004.',
        'Start a fresh agent on #004?',
        'Start fresh agent',
        'Ends J4\'s session on #004 Account pages dark mode; a new builder takes the next attempt on the worktree of ticket-004 with the '
        + 'earlier session\'s note. #004 is not held.',
      ],
    ]);
  });

  test('the hold a stop leaves is the forge\'s served phrase, shown as a figure', () => {
    const stop = controlsOf(exampleDetailJob('J4', '004'))?.stopItems.find((item) => item.move === 'stop');
    expect(stop?.consequence).toContainEqual({ kind: 'figure', text: 'stopped by User (J4)' });
    expect(stop?.consequence).toContainEqual({ kind: 'figure', text: 'ticket-004' });
  });

  test('a ticket already held keeps its hold, and one with no branch names none', () => {
    const held = { ...BUILDING_TITLED, hold: 'waiting on the example vendor' };
    const [windDown] = controlsOf(exampleDetailJob('J4', '004'), held)?.stopItems ?? [];
    expect(wordsOf(windDown?.consequence ?? [])).toEndWith('then ends. Branch ticket-004 and its worktree stay as they are. #004 keeps its hold waiting on the example vendor.');
    const branchless = { ...BUILDING_TITLED, branch: null };
    const [, stop, fresh] = controlsOf(exampleDetailJob('J4', '004'), branchless)?.stopItems ?? [];
    expect(wordsOf(stop?.consequence ?? [])).toBe('Ends J4\'s session on #004 Account pages dark mode in the middle of its turn. '
      + '#004 is held stopped by User (J4) until User unholds it.');
    expect(fresh?.description).toBe('Ends J4\'s session and starts a new builder.');
  });

  test('a stopping job, by its state or a stop request, offers nothing but says so', () => {
    expect(controlsOf(exampleDetailJob('J4', '004', { state: 'stopping' }))?.stopping).toBe(true);
    expect(controlsOf(exampleDetailJob('J4', '004', { stopRequest: 'wind-down' }))?.stopping).toBe(true);
  });

  test('a reviewer is named so and handed to a new reviewer; a job that offers neither a message nor a fresh agent gets neither', () => {
    const reviewer = controlsOf(exampleDetailJob('J9', '004', { kind: 'review', role: 'reviewer' }));
    expect(reviewer?.label).toBe('Reviewer J9 controls');
    expect(reviewer?.stopItems.at(-1)?.description).toBe('Ends J9\'s session and starts a new reviewer on ticket-004.');
    const offersNeitherMessageNorFresh: BoardJobDocument['offers'] = { stopModes: ['stop', 'wind-down'], takesFresh: false, takesMessage: false };
    const merge = controlsOf(exampleDetailJob('J7', '004', { kind: 'merge-agent', role: null, offers: offersNeitherMessageNorFresh }));
    expect(merge?.label).toBe('Job J7 controls');
    expect(merge?.messages).toBe(false);
    expect(merge?.stopItems.map((item) => item.move)).toEqual(['wind-down', 'stop']);
  });

  test('a ticket with no live job has no job controls', () => {
    expect(overviewOf(exampleDetailBoard({ tickets: [BUILDING], rows: [BUILDING_ROW] }), '004').jobControls).toBeNull();
  });
});

describe('the open incident line', () => {
  test('names the newest open incident listing the ticket, and none without one', () => {
    const board = exampleDetailBoard({
      tickets:   [BUILDING],
      rows:      [BUILDING_ROW],
      incidents: [exampleDetailIncident('I5', '004', { kind: 'quiet-job', defaultMove: 'job-fresh' }), exampleDetailIncident('I6', '004'), exampleDetailIncident('I7', '009')],
    });
    expect(overviewOf(board, '004').openIncident).toEqual({ incidentId: 'I6', kind: 'sandbox-unavailable', defaultMove: 'gate-retry' });
    expect(overviewOf(exampleDetailBoard({ tickets: [BUILDING], rows: [BUILDING_ROW] }), '004').openIncident).toBeNull();
  });
});

describe('a ticket with no job', () => {
  const WAITING_BOARD = exampleDetailBoard({
    tickets: [
      exampleDetailTicket('013', { status: 'draft' }),
      exampleDetailTicket('015', { status: 'committed', hold: 'waiting on the example vendor' }),
      exampleDetailTicket('016', { status: 'committed' }),
      exampleDetailTicket('017', { status: 'committed' }),
      exampleDetailTicket('020', { status: 'in-review' }),
      exampleDetailTicket('021', { status: 'in-review' }),
      exampleDetailTicket('022', { status: 'delivered', delivered: exampleStampAt('12:00') }),
    ],
    waitingOn:    { '016': ['001', '011'] },
    mergeTargets: [{
      target:          'main',
      waitingForMerge: [
        {
          ticketId: '020', priority: 'normal', againstTarget: 'clean', conflictedFiles: []
        },
        {
          ticketId: '021', priority: 'normal', againstTarget: 'conflicting', conflictedFiles: ['src/Example.ts']
        },
      ],
    }],
  });

  test('never shows a job line and says why nothing works on it', () => {
    const notes = ['013', '015', '016', '017', '020', '022'].map((ticketId) => overviewOf(WAITING_BOARD, ticketId).now);
    expect(notes.map((now) => now.job)).toEqual([null, null, null, null, null, null]);
    expect(notes.map((now) => [now.heading, now.note])).toEqual([
      ['Draft', null],
      ['To do', 'Held: waiting on the example vendor'],
      ['To do', 'Waits on #001 and #011.'],
      ['To do', 'In the queue.'],
      ['Awaiting review', 'Waiting for merge: merges cleanly into main.'],
      ['Done', 'Done at 12:00.'],
    ]);
  });

  test('leads with Ready, Unhold or Accept as the forge offers them, and with nothing otherwise', () => {
    const leadOf = (ticketId: string) => {
      const { lead } = overviewOf(WAITING_BOARD, ticketId);
      return lead?.kind === 'move' ? lead.move.move : lead;
    };
    expect(['013', '015', '020', '017'].map(leadOf)).toEqual(['ready', 'unhold', 'merge-accept', null]);
  });

  test('Accept is sendable only while the forge offers it, and only a conflicting prediction lists its files', () => {
    const clean = overviewOf(WAITING_BOARD, '020');
    const conflicting = overviewOf(WAITING_BOARD, '021');
    expect([clean.lead?.kind === 'move' && clean.lead.move.sendable, conflicting.lead?.kind === 'move' && conflicting.lead.move.sendable]).toEqual([true, false]);
    expect([clean.conflictedFiles, conflicting.conflictedFiles]).toEqual([[], ['src/Example.ts']]);
  });
});

describe('the other moves', () => {
  test('keep their order without the lead: Update branch, then Hold…, Priority…, Park…, Set network… and Delivered by hand…', () => {
    const board = exampleDetailBoard({
      tickets:      [exampleDetailTicket('013', { status: 'draft' }), exampleDetailTicket('020', { status: 'in-review' })],
      mergeTargets: [{
        target:          'main',
        waitingForMerge: [{
          ticketId: '020', priority: 'normal', againstTarget: 'clean', conflictedFiles: []
        }]
      }],
    });
    expect(overviewOf(board, '013').otherMoves.map((move) => move.label)).toEqual(['Hold…', 'Priority…', 'Park…', 'Set network…']);
    expect(overviewOf(board, '020').otherMoves.map((move) => move.label)).toEqual(['Update branch', 'Hold…', 'Priority…', 'Park…', 'Delivered by hand…']);
  });

  test('show exactly the moves the forge offers, whatever the ticket\'s status', () => {
    const offering = exampleDetailTicket('040', { status: 'delivered', offers: { kinds: ['ticket-hold', 'ticket-park'], priorityChoices: [] } });
    const offeringNothing = exampleDetailTicket('041', { status: 'draft', offers: { kinds: [], priorityChoices: [] } });
    const board = exampleDetailBoard({ tickets: [offering, offeringNothing] });
    expect(overviewOf(board, '040').otherMoves.map((move) => move.label)).toEqual(['Hold…', 'Park…']);
    expect([overviewOf(board, '041').otherMoves, overviewOf(board, '041').lead]).toEqual([[], null]);
  });

  test('Delivered by hand… asks for its confirmation first, and is not offered while a job of the ticket runs', () => {
    const byHandOf = (jobs: readonly BoardJobDocument[]) => {
      const { otherMoves } = overviewOf(exampleDetailBoard({ tickets: [BUILDING], jobs }), '004');
      return otherMoves.find((move) => move.move === 'deliver-by-hand');
    };
    expect(byHandOf([])).toMatchObject({ opens: 'by-hand', sendable: true });
    expect(wordsOf(byHandOf([])?.effect ?? [])).toBe('Records #004 delivered: work User landed outside Hephaestus. Nothing merges, lands or launches.');
    expect(byHandOf([exampleDetailJob('J4', '004')])).toBeUndefined();
  });

  test('Park names the running job only while one runs, and asks for a reason first', () => {
    const parkOf = (jobs: readonly BoardJobDocument[]) => overviewOf(exampleDetailBoard({ tickets: [BUILDING], jobs }), '004').otherMoves.find((move) => move.move === 'park');
    expect(wordsOf(parkOf([exampleDetailJob('J4', '004')])?.effect ?? [])).toBe(
      'Holds #004 as parked:user and puts the reason to User as a parked decision. J4 runs on to its end; no builder or reviewer launches after it.',
    );
    expect(wordsOf(parkOf([])?.effect ?? [])).toBe('Holds #004 as parked:user and puts the reason to User as a parked decision.');
    expect(parkOf([])?.opens).toBe('reason');
  });

  test('a committed ticket offers Priority… after Hold…, opening a row of the other priorities, and says it changes its place in Ready', () => {
    const board = exampleDetailBoard({ tickets: [exampleDetailTicket('030', { status: 'committed', priority: 'high' })] });
    const { otherMoves } = overviewOf(board, '030');
    expect(otherMoves.map((move) => move.label)).toEqual(['Hold…', 'Priority…', 'Park…', 'Set network…', 'Delivered by hand…']);
    const priority = otherMoves.find((move) => move.move === 'priority');
    expect([priority?.opens, priority?.priorities, priority?.sendable]).toEqual(['priorities', ['normal', 'low'], true]);
    expect(wordsOf(priority?.effect ?? [])).toBe('Changes where #030 waits in Ready: a higher priority is taken first.');
  });

  test('a ticket the forge offers no priority change shows no Priority…', () => {
    const board = exampleDetailBoard({ tickets: [exampleDetailTicket('031', { status: 'in-progress', offers: { kinds: ['ticket-park'], priorityChoices: [] } })] });
    expect(overviewOf(board, '031').otherMoves.filter((move) => move.move === 'priority')).toEqual([]);
  });
});

describe('Next', () => {
  const tickets = [
    BUILDING,
    exampleDetailTicket('005', { title: 'Example delivery ETA' }),
    exampleDetailTicket('012', { title: 'Example invoices' }),
  ];

  test('words a running build\'s steps and marks the build current, the landing linking what it lets start and what still holds the rest', () => {
    const forecast = exampleTicketForecast('004', {
      steps: [
        { kind: 'build', attempt: 1, jobId: 'J4' },
        { kind: 'customs-and-gates', gateNames: ['tests'], jobId: null },
        { kind: 'review', round: 1, jobId: null },
        { kind: 'integrate', target: 'group-account', group: 'account' },
      ],
      currentStepIndex: 0,
      dependents:       [{ ticketId: '005', stillWaitingOnTicketIds: [] }, { ticketId: '012', stillWaitingOnTicketIds: ['001', '011'] }],
    });
    const steps = overviewOf(exampleDetailBoard({ tickets, ticketForecasts: [forecast] }), '004').nextSteps;
    expect(stepTexts(steps)).toEqual([
      'J4 builds #004, attempt 1, and reports its handoff.',
      'Customs checks J4\'s handoff and runs the gate.',
      'A reviewer takes #004, review round 1.',
      'It integrates into group-account; #005 Example delivery ETA can start, and #012 still waits on #001 and #011.',
    ]);
    expect(steps?.map((step) => step.current)).toEqual([true, false, false, false]);
    const links = steps?.at(-1)?.parts.flatMap((part) => (part.kind === 'link' ? [part.link] : []));
    expect(links).toEqual([{ text: '#005', item: { form: 'ticket', ticketId: '005' } }, { text: '#012', item: { form: 'ticket', ticketId: '012' } }]);
  });

  test('marks no step while nothing runs, and words a queued build, a reviewer at work, User\'s accept and a landing with no target', () => {
    const forecast = exampleTicketForecast('004', {
      steps: [
        { kind: 'build', attempt: 2, jobId: null },
        { kind: 'review', round: 2, jobId: 'J9' },
        { kind: 'merge-approval', target: 'main' },
        { kind: 'land', target: null },
      ],
    });
    const steps = overviewOf(exampleDetailBoard({ tickets, ticketForecasts: [forecast] }), '004').nextSteps;
    expect(stepTexts(steps)).toEqual([
      'A builder takes #004 when a launch slot frees, attempt 2.',
      'J9 reviews #004, review round 2.',
      'It waits for User\'s accept into main.',
      'It lands.',
    ]);
    expect(steps?.some((step) => step.current)).toBe(false);
  });

  test('is absent without a forecast for the ticket', () => {
    expect(overviewOf(exampleDetailBoard({ tickets }), '004').nextSteps).toBeNull();
    expect(overviewOf(exampleDetailBoard({ tickets, ticketForecasts: [exampleTicketForecast('005')] }), '004').nextSteps).toBeNull();
  });
});

describe('the facts', () => {
  test('carry their second lines: the build\'s attempt under Started and the row under Task; the branch in figures', () => {
    const { facts } = overviewOf(exampleDetailBoard({ tickets: [BUILDING], rows: [BUILDING_ROW], jobs: [exampleDetailJob('J4', '004')] }), '004');
    const factLabelled = (label: string) => facts.find((fact) => fact.label === label);
    expect(factLabelled('started')?.secondaryText).toBe('attempt 1');
    expect(factLabelled('task')?.secondaryText).toBe('row of this ticket');
    expect(factLabelled('branch')).toEqual({
      kind: 'text', label: 'branch', text: 'ticket-004', figure: true
    });
    expect(factLabelled('integration')).toEqual({ kind: 'integration', label: 'integration', integration: { branch: 'group-account', relation: 'lands-together', links: [] } });
  });

  test('Started has no second line with no build at work', () => {
    const { facts } = overviewOf(exampleDetailBoard({ tickets: [BUILDING] }), '004');
    expect(facts.find((fact) => fact.label === 'started')?.secondaryText).toBeUndefined();
  });
});

describe('the documents', () => {
  test('list the spec and plan with their standing and the page that opens each, and say when they hold the build', () => {
    const ticket = exampleDetailTicket('004', {
      status:    'committed',
      documents: {
        spec:      { standing: 'approved', headNumber: 6, approvedNumber: 6 },
        plan:      { standing: 'out-of-date', headNumber: 3, approvedNumber: 3 },
        buildHeld: true,
      },
    });
    const { documents } = overviewOf(exampleDetailBoard({ tickets: [ticket] }), '004');
    expect(documents?.rows.map((row) => [row.title, row.standingText, row.route.item])).toEqual([
      ['Spec', 'Approved v6', 'ticket/004/spec'],
      ['Plan', 'Out of date: the spec changed · v3', 'ticket/004/plan'],
    ]);
    expect(documents?.buildHeldText).toBe('The build waits until the spec and plan are in order.');
  });

  test('say a document not written yet, and nothing of a held build while none is held', () => {
    const ticket = exampleDetailTicket('004', {
      status:    'draft',
      documents: { spec: { standing: 'drafting', headNumber: 2, approvedNumber: null }, plan: { standing: 'unwritten', headNumber: null, approvedNumber: null }, buildHeld: false },
    });
    const { documents } = overviewOf(exampleDetailBoard({ tickets: [ticket] }), '004');
    expect([documents?.rows.map((row) => row.standingText), documents?.buildHeldText]).toEqual([['Being written · v2', 'Not written yet'], null]);
  });

  test('are absent on a ticket with no spec and plan', () => {
    expect(overviewOf(exampleDetailBoard({ tickets: [BUILDING] }), '004').documents).toBeNull();
  });
});
