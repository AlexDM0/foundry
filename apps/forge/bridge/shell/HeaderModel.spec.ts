/**
 * The header's model. What matters: the state pill reads Running, orange, only while serving unpaused with the stream up, and otherwise
 * the state the Bridge knows on the quiet pill; Restart is offered only with new code on disk and never during a Baton pass, which also
 * withdraws Pause and Stop; the new-code notice points at `update`; a failed Baton pass with its step and error and an Assistant that
 * cannot come up are warnings, kept apart from the other notices, and an incident default is neither (the incident line holds it); the
 * statistics read concurrency and today's work, and say which tab and which Kanban lane they open; the agents figure counts the jobs
 * holding a launch slot, never the rows in progress nor the Assistant, and says so on hover, from the same slot jobs as the activity
 * strip, so the figure and the strip agree. The status details are the
 * usage windows the facts carry and never a placeholder or the confinement, a limit hit naming its reset on the viewer's clock, since the
 * stored stamp is UTC; while the board has no readable pipeline the header is in
 * setup, its quiet pill reading Setting up, with the record's step statuses (done and recheck steps linking to their route) and no usage,
 * six steps with the entities step while the record is in monorepo mode and five once it declined it, and a board that says nothing of
 * a pipeline is never in setup. Today's tokens count Flint's brain's runs of today, and the mark wakes
 * the brain only on a forge that runs one and while it neither starts nor runs.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardStateDocument, TaskDocument } from '../@types/BoardStateDocument.ts';
import {
  boardStateFixture,
  exampleAgentJob,
  FIXTURE_ASSISTANT_JOB,
  FIXTURE_NOW
} from '../testing/BoardStateFixture.ts';
import { entitiesStepBoardOf }                                   from '../testing/EntitiesStepFixture.ts';
import { exampleFlintBrain, OFF_FLINT_BRAIN, runningFlintBrain } from '../testing/FlintBrainFixture.ts';
import { pipelineBoardStateOf }                                  from '../testing/PipelineFixture.ts';
import { headerModelOf }                                         from './HeaderModel.ts';

describe('the Overseer state and its controls', () => {
  test('serving offers Pause and Stop, and no Restart without new code', () => {
    const model = headerModelOf(boardStateFixture(), FIXTURE_NOW, 'live');
    expect([model.statusToken, model.statusLabel, model.isRunning, model.pauseControl, model.restartOffered, model.stopOffered, model.newCodeNotice])
      .toEqual(['live', 'Running', true, 'pause', false, true, null]);
  });

  test('paused offers Resume', () => {
    const model = headerModelOf(boardStateFixture({ overseer: { state: 'serving', paused: true, codeVersion: 'code-1' } }), FIXTURE_NOW, 'live');
    expect([model.statusLabel, model.isRunning, model.pauseControl]).toEqual(['Paused', false, 'resume']);
  });

  test('new code on disk offers Restart and the notice pointing at it, and is not listed again among the notices', () => {
    const model = headerModelOf(boardStateFixture({ notices: [{ kind: 'new-code' }] }), FIXTURE_NOW, 'live');
    expect(model.restartOffered).toBe(true);
    expect(model.newCodeNotice).toBe('new code is on disk: restart the Overseer to run it');
    expect(model.notices).toEqual([]);
  });

  test('during a Baton pass the state reads handing over and no control is offered, new code or not', () => {
    const model = headerModelOf(boardStateFixture({
      overseer: { state: 'passing-baton', paused: false, codeVersion: 'code-1' },
      notices:  [{ kind: 'new-code' }],
    }), FIXTURE_NOW, 'live');
    expect([model.statusToken, model.statusLabel, model.pauseControl, model.restartOffered, model.stopOffered]).toEqual([
      'passing-baton', 'Handing over', null, false, false,
    ]);
  });

  test('before the first board the header reads connecting and offers nothing', () => {
    const model = headerModelOf(null, FIXTURE_NOW, 'connecting');
    expect([model.statusLabel, model.pauseControl, model.stopOffered, model.statistics, model.statusDetails]).toEqual(['Connecting', null, false, [], []]);
  });

  test('a held Overseer reads Held, and a stream that is down or lost its session reads Down whatever the last board said', () => {
    const held = boardStateFixture({ overseer: { state: 'held-by-install-change', paused: false, codeVersion: 'code-1' } });
    expect(headerModelOf(held, FIXTURE_NOW, 'live').statusLabel).toBe('Held');
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'down').statusLabel).toBe('Down');
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'no-session').statusToken).toBe('down');
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'connecting').statusLabel).toBe('Connecting');
  });
});

describe('the status details', () => {
  test.each(['confined', 'unavailable', 'unconfined-by-design'] as const)('the confinement %s is never a detail', (confinement) => {
    expect(headerModelOf(boardStateFixture({ confinement }), FIXTURE_NOW, 'live').statusDetails.join(' ')).not.toContain('confinement');
  });

  test('each usage window the facts carry reads by its word and percent, in their order', () => {
    expect(headerModelOf(pipelineBoardStateOf('header-both-usage-windows'), FIXTURE_NOW, 'live').statusDetails).toEqual(['5-hour window 14%', 'week 18%']);
  });

  test('no observed window shows no usage at all, and no placeholder', () => {
    expect(headerModelOf(pipelineBoardStateOf('header-no-usage-windows'), FIXTURE_NOW, 'live').statusDetails).toEqual([]);
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'live').statusDetails).toEqual([]);
  });

  test('a window with no word of its own reads as its stored value', () => {
    const usage = { resetsAt: null, window: null, windows: [{ window: 'seven_day_opus', utilization: 7.6, resetsAt: null }] };
    expect(headerModelOf(boardStateFixture({ usage }), FIXTURE_NOW, 'live').statusDetails).toEqual(['seven_day_opus 8%']);
  });
});

describe('the header in setup', () => {
  test('a board with no pipeline is in setup with Billing current and the rest upcoming, and shows no usage', () => {
    const model = headerModelOf({ ...pipelineBoardStateOf('A0'), usage: pipelineBoardStateOf('header-both-usage-windows').usage }, FIXTURE_NOW, 'live');
    expect(model.setupSteps?.map(({ label, status }) => [label, status])).toEqual([
      ['Billing', 'current'], ['Research', 'upcoming'], ['Constitution', 'upcoming'], ['Pipeline design', 'upcoming'], ['Apply', 'upcoming'],
    ]);
    expect(model.statusDetails).toEqual([]);
  });

  test('a live board in setup reads Setting up on the quiet pill', () => {
    const model = headerModelOf(pipelineBoardStateOf('A0'), FIXTURE_NOW, 'live');
    expect([model.statusToken, model.statusLabel, model.isRunning]).toEqual(['live', 'Setting up', false]);
  });

  test('the stepper shows the record\'s statuses, and only a done or recheck step links to its route', () => {
    const model = headerModelOf(pipelineBoardStateOf('A0b-recheck'), FIXTURE_NOW, 'live');
    expect(model.setupSteps?.map(({ key, status, href }) => [key, status, href ?? null])).toEqual([
      ['billing', 'done', '#pipeline/setup/billing'],
      ['research', 'current', null],
      ['constitution', 'recheck', '#pipeline/setup/constitution'],
      ['design', 'recheck', '#pipeline/setup/design'],
      ['apply', 'upcoming', null],
    ]);
  });

  test('a record in monorepo mode shows six steps, the entities step after the research; one that declined it shows five', () => {
    const monorepo = headerModelOf(entitiesStepBoardOf(), FIXTURE_NOW, 'live');
    expect(monorepo.setupSteps?.map(({ key, status }) => [key, status])).toEqual([
      ['billing', 'done'], ['research', 'done'], ['entities', 'current'], ['constitution', 'upcoming'], ['design', 'upcoming'], ['apply', 'upcoming'],
    ]);
    const declined = entitiesStepBoardOf({
      currentStep: 'constitution',
      stepStates:  {
        billing: 'done', research: 'done', entities: 'done', constitution: 'in-progress', design: 'not-started', apply: 'not-started'
      },
      draft: null,
    });
    expect(headerModelOf(declined, FIXTURE_NOW, 'live').setupSteps?.map(({ key }) => key)).toEqual(['billing', 'research', 'constitution', 'design', 'apply']);
  });

  test('an unreadable pipeline is setup too, a readable one is not, and a board that says nothing of a pipeline never is', () => {
    expect(headerModelOf(pipelineBoardStateOf('A0-unreadable'), FIXTURE_NOW, 'live').setupSteps).not.toBeNull();
    expect(headerModelOf(pipelineBoardStateOf('A5'), FIXTURE_NOW, 'live').setupSteps).toBeNull();
    expect(headerModelOf(boardStateFixture(), FIXTURE_NOW, 'live').setupSteps).toBeNull();
    expect(headerModelOf(null, FIXTURE_NOW, 'connecting').setupSteps).toBeNull();
  });
});

describe('the warnings and notices', () => {
  test('a failed Baton pass and an Assistant that cannot come up are warnings; an incident default is not', () => {
    const model = headerModelOf(boardStateFixture({
      overseer: {
        state: 'serving', paused: false, codeVersion: 'code-1', batonPassWarning: { successorCodeVersion: 'code-2', step: 'prepared', error: 'the successor exited' }
      },
      notices: [
        {
          kind: 'incident-defaulted', incidentId: 'I3', move: 'merge-abort', cause: 'turn-closed'
        },
        {
          kind: 'incident-defaulted', incidentId: 'I4', move: 'merge-review', cause: 'no-assistant'
        },
      ],
    }), FIXTURE_NOW, 'live');
    expect(model.warnings).toEqual([
      'the Baton pass to code code-2 failed at prepared: the successor exited',
      'no Assistant can come up: open incidents take their defaults',
    ]);
    expect(model.notices).toEqual([]);
  });

  test('the other notices are listed in their own words', () => {
    const model = headerModelOf(boardStateFixture({
      notices: [{
        kind: 'dirty-main-checkout', target: 'main', branch: 'main', blockingFiles: ['README.md']
      }, { kind: 'rounds-not-converging', ticketId: '42' }, { kind: 'target-file-held', target: 'main', heldFiles: ['README.md'] }],
    }), FIXTURE_NOW, 'live');
    expect(model.notices).toEqual([
      'landings on main wait: the main checkout\'s changes to README.md block the fast-forward',
      'ticket #42\'s review rounds are not converging',
      'landings on main wait: another process holds README.md open, so git cannot replace what is held',
    ]);
    expect(model.warnings).toEqual([]);
  });

  test('a refused agent program names its job and the reason, never only its kind', () => {
    const model = headerModelOf(boardStateFixture({
      notices: [{
        kind: 'agent-program-refused', jobId: 'J7', cause: 'batch-target', reason: 'C:\\npm\\claude.cmd is a batch file'
      }],
    }), FIXTURE_NOW, 'live');
    expect(model.notices).toEqual(['job J7 is not launched: C:\\npm\\claude.cmd is a batch file']);
  });

  test('a Watcher endpoint that does not fit names its job and the endpoint, never only its kind', () => {
    const model = headerModelOf(boardStateFixture({ notices: [{ kind: 'watcher-endpoint-does-not-fit', jobId: 'J7', endpoint: '/long/watchers/a.sock' }], }), FIXTURE_NOW, 'live');
    expect(model.notices).toEqual(['job J7 is not launched: this platform cannot bind the Watcher endpoint /long/watchers/a.sock']);
  });
});

/** Seven rows in progress, three slot jobs (two builders and a reviewer) against a limit of five, and the Assistant beside them. */
function boardWithSlotJobsAndMoreRows(): BoardStateDocument {
  const state = boardStateFixture();
  const page = state.page ?? null;
  if (page === null) throw new Error('the fixture carries a page');
  const runningRows: TaskDocument[] = [10, 11, 12, 13, 14, 15, 16].map((id) => ({
    id, name: `#${id} Example row`, status: 'in-progress', start: '2026-10-29T11:00:00', end: null, ticket: null
  }));
  return {
    ...state,
    jobs: [
      FIXTURE_ASSISTANT_JOB,
      exampleAgentJob({ id: 'J2' }),
      exampleAgentJob({ id: 'J3' }),
      exampleAgentJob({ id: 'J5', kind: 'review', role: 'reviewer' }),
    ],
    concurrency: { limit: 5, agentsInFlight: 3 },
    launchSlots: { limit: 5, slotJobIds: ['J2', 'J3', 'J5'], inProgressTicketIdsWithoutJob: ['3'] },
    page:        { ...page, payload: { ...page.payload, progress: { tasks: [...page.payload.progress.tasks, ...runningRows] } } },
  };
}

describe('concurrency, usage and the statistics', () => {
  test('agents against the limit, today\'s deliveries and tokens, the queue, and the open incidents', () => {
    const model = headerModelOf(boardStateFixture(), FIXTURE_NOW, 'live');
    expect(model.statistics.map(({
      figure, label, opensTab, kanbanLane
    }) => [figure, label, opensTab, kanbanLane])).toEqual([
      ['1 / 4', 'agents working', 'kanban', 'building'],
      ['1', 'done today', 'kanban', 'done'],
      ['4.5k', 'tokens today', null, null],
      ['1', 'waiting in queue', 'kanban', 'ready'],
      ['0', 'open incidents', 'assistant', null],
    ]);
  });

  test('the agents figure counts the jobs holding a launch slot, never the rows in progress, and the Assistant beside them changes nothing', () => {
    const model = headerModelOf(boardWithSlotJobsAndMoreRows(), FIXTURE_NOW, 'live');
    expect(model.statistics[0]?.figure).toBe('3 / 5');
    expect(model.activity.chips.map((chip) => chip.jobId)).toEqual(['J2', 'J3', 'J5']);
  });

  test('the agents figure says what it counts, and no other figure explains itself', () => {
    const model = headerModelOf(boardWithSlotJobsAndMoreRows(), FIXTURE_NOW, 'live');
    expect(model.statistics.map((statistic) => statistic.explanation)).toEqual([
      'Build and review jobs against the limit of 5; the Assistant and product-owner jobs do not count', null, null, null, null,
    ]);
  });

  test('a board that states no concurrency reads the slot-job count alone, without a limit', () => {
    const { concurrency: _omitted, ...withoutConcurrency } = boardWithSlotJobsAndMoreRows();
    const agents = headerModelOf(withoutConcurrency, FIXTURE_NOW, 'live').statistics[0];
    expect([agents?.figure, agents?.explanation]).toEqual(['3', 'Build and review jobs; the Assistant and product-owner jobs do not count']);
  });

  test('a paused ticket adds the paused figure after the agents, in the paused state', () => {
    const state = boardStateFixture();
    const page = state.page ?? null;
    if (page === null) throw new Error('the fixture carries a page');
    const pausedFacts = [...page.payload.boardFacts.tickets, { ticketId: '9', displayState: 'paused' }];
    const boardFacts = { ...page.payload.boardFacts, tickets: pausedFacts };
    const model = headerModelOf({ ...state, page: { ...page, payload: { ...page.payload, boardFacts } } }, FIXTURE_NOW, 'live');
    expect(model.statistics.slice(0, 2).map(({ figure, label, state: figureState }) => [figure, label, figureState])).toEqual([
      ['1 / 4', 'agents working', null],
      ['1', 'paused', 'paused'],
    ]);
  });

  test('a usage limit hit reads with its window\'s word and when it resets on the viewer\'s clock, not the stored UTC one', () => {
    const resetsAt = '2026-10-29T14:30:00.000Z';
    const resetMoment = new Date(Date.parse(resetsAt));
    const viewerClock = `${String(resetMoment.getHours()).padStart(2, '0')}:${String(resetMoment.getMinutes()).padStart(2, '0')}`;
    const detailOf = (stamp: string): string | undefined =>
      headerModelOf(boardStateFixture({ usage: { resetsAt: stamp, window: 'five_hour' } }), FIXTURE_NOW, 'live').statusDetails[0];
    expect(detailOf(resetsAt)).toBe(`5-hour window usage limit hit, resets ${viewerClock}`);
    expect(detailOf('2026-10-29T15:30:00+01:00')).toBe(detailOf(resetsAt));
  });

  test('a usage limit hit whose reset does not parse reads without a reset time', () => {
    expect(headerModelOf(boardStateFixture({ usage: { resetsAt: 'soon', window: 'seven_day' } }), FIXTURE_NOW, 'live').statusDetails[0])
      .toBe('week usage limit hit');
  });
});

describe('Flint\'s brain', () => {
  test('today\'s tokens count the brain\'s runs that ended today and the one still running, never an earlier day\'s', () => {
    const runs = [
      { startedAt: '2026-10-28T09:00:00Z', endedAt: '2026-10-28T09:02:00Z', tokens: 9000 },
      { startedAt: '2026-10-29T09:00:00Z', endedAt: '2026-10-29T09:02:00Z', tokens: 500 },
      { startedAt: '2026-10-29T11:58:00Z', endedAt: null, tokens: 1000 },
    ];
    const model = headerModelOf(boardStateFixture({ flintBrain: { reading: OFF_FLINT_BRAIN, runs } }), FIXTURE_NOW, 'live');
    expect(model.statistics.find((statistic) => statistic.label === 'tokens today')?.figure).toBe('6k');
  });

  test('the mark wakes the brain while it is off, ended or refused, and not while it starts or runs or on a forge without it', () => {
    const wakesFor = (flintBrain: BoardStateDocument['flintBrain']): boolean => headerModelOf(
      boardStateFixture(flintBrain === undefined ? {} : { flintBrain }),
      FIXTURE_NOW,
      'live',
    ).flintBrainWakes;
    const facts = (reading: NonNullable<BoardStateDocument['flintBrain']>['reading']) => ({ reading, runs: [] });
    expect([
      wakesFor(facts(OFF_FLINT_BRAIN)),
      wakesFor(facts(exampleFlintBrain({ state: 'ended' }))),
      wakesFor(facts(exampleFlintBrain({ state: 'refused' }))),
      wakesFor(facts(exampleFlintBrain({ state: 'starting' }))),
      wakesFor(facts(runningFlintBrain('2026-10-29T11:59:00Z', '2026-10-29T12:01:00Z'))),
      wakesFor(facts(null)),
      wakesFor(undefined),
    ]).toEqual([true, true, true, false, false, false, false]);
  });
});
