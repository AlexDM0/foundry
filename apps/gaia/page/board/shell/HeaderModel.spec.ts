/**
 * The header's model. What matters: the state pill reads Running, orange, only while serving unpaused with the stream up, and otherwise
 * the state the board knows on the quiet pill; the header offers no forge control, which is Gaia's forge bar's; the new-code notice is the
 * forge's sentence and is not listed again; the warnings and the notices are the forge's sentences as served, and an incident default is
 * neither (the incident line holds it); the statistics read concurrency and today's figures as the forge serves them, on the date it
 * counted them and zero on another, and say which tab and which Kanban lane they open; the agents figure counts the jobs holding a launch
 * slot, never the rows in progress nor the Assistant, and says so on hover, from the same slot jobs as the activity strip. The status
 * details are the usage windows the facts carry and never a placeholder, a limit hit naming its reset on the viewer's clock, since the
 * stored stamp is UTC; while the board has no readable pipeline the header is in setup, its quiet pill reading Setting up, with the
 * record's step statuses (done and recheck steps reopening at their route) and no usage, six steps with the entities step while the record
 * is in monorepo mode and five once it declined it; before the first board it is not.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDocument }       from '../../@types/board/BoardDocument.ts';
import type { BoardNoticeDocument } from '../../@types/board/BoardFactDocuments.ts';
import {
  boardStateFixture,
  examplePageTicketFacts,
  exampleAgentJob,
  exampleTask,
  FIXTURE_ASSISTANT_JOB,
  FIXTURE_NOW
} from '../testing/BoardStateFixture.ts';
import { entitiesStepBoardOf }  from '../testing/EntitiesStepFixture.ts';
import { pipelineBoardStateOf } from '../testing/PipelineFixture.ts';
import { headerModelOf }        from './HeaderModel.ts';

/** The fixture board with a readable pipeline, so the header is out of setup, and the changes given. */
function servingBoard(changes: Partial<BoardDocument> = {}): BoardDocument {
  return boardStateFixture({ pipeline: pipelineBoardStateOf('A5').pipeline, ...changes });
}

function noticeOf(kind: string, text: string): BoardNoticeDocument {
  return {
    kind, facts: {}, text, causeText: null,
  };
}

describe('the forge state', () => {
  test('serving with the stream up reads Running on the orange pill, and the header offers no control', () => {
    const model = headerModelOf(servingBoard(), FIXTURE_NOW, 'live');
    expect([model.statusToken, model.statusLabel, model.isRunning, model.newCodeNotice]).toEqual(['live', 'Running', true, null]);
    expect(Object.keys(model)).not.toContain('pauseControl');
    expect(Object.keys(model)).not.toContain('restartOffered');
    expect(Object.keys(model)).not.toContain('stopOffered');
  });

  test('paused reads Paused on the quiet pill', () => {
    const model = headerModelOf(servingBoard({ hephaestus: { state: 'serving', paused: true, codeVersion: 'code-1' } }), FIXTURE_NOW, 'live');
    expect([model.statusLabel, model.isRunning]).toEqual(['Paused', false]);
  });

  test('new code on disk shows the forge\'s sentence, and is not listed again among the notices', () => {
    const model = headerModelOf(servingBoard({ notices: [noticeOf('new-code', 'Example: new code is on disk')] }), FIXTURE_NOW, 'live');
    expect(model.newCodeNotice).toBe('Example: new code is on disk');
    expect(model.notices).toEqual([]);
  });

  test('during a restart the state reads Restarting', () => {
    const model = headerModelOf(servingBoard({ hephaestus: { state: 'restarting', paused: false, codeVersion: 'code-1' } }), FIXTURE_NOW, 'live');
    expect([model.statusToken, model.statusLabel]).toEqual(['restarting', 'Restarting']);
  });

  test('before the first board the header reads connecting and shows no figure', () => {
    const model = headerModelOf(null, FIXTURE_NOW, 'connecting');
    expect([model.statusLabel, model.statistics, model.statusDetails]).toEqual(['Connecting', [], []]);
  });

  test('a held forge reads Held, and a stream that is down or lost its session reads Down whatever the last board said', () => {
    const held = servingBoard({ hephaestus: { state: 'held-by-install-change', paused: false, codeVersion: 'code-1' } });
    expect(headerModelOf(held, FIXTURE_NOW, 'live').statusLabel).toBe('Held');
    expect(headerModelOf(servingBoard(), FIXTURE_NOW, 'down').statusLabel).toBe('Down');
    expect(headerModelOf(servingBoard(), FIXTURE_NOW, 'no-session').statusToken).toBe('down');
    expect(headerModelOf(servingBoard(), FIXTURE_NOW, 'connecting').statusLabel).toBe('Connecting');
  });
});

describe('the status details', () => {
  test('each usage window the facts carry reads by its word and percent, in their order', () => {
    expect(headerModelOf(pipelineBoardStateOf('header-both-usage-windows'), FIXTURE_NOW, 'live').statusDetails).toEqual(['5-hour window 14%', 'week 18%']);
  });

  test('no observed window shows no usage at all, and no placeholder', () => {
    expect(headerModelOf(pipelineBoardStateOf('header-no-usage-windows'), FIXTURE_NOW, 'live').statusDetails).toEqual([]);
    expect(headerModelOf(servingBoard(), FIXTURE_NOW, 'live').statusDetails).toEqual([]);
  });

  test('a window of unknown length reads as its stored name, and any other length as hours', () => {
    const usage = {
      resetsAt: null,
      window:   null,
      windows:  [{
        window: 'example_window', lengthHours: null, utilization: 7.6, resetsAt: '2026-10-29T14:30:00Z'
      }, {
        window: 'example_day', lengthHours: 24, utilization: 3, resetsAt: '2026-10-29T14:30:00Z'
      }],
    };
    expect(headerModelOf(servingBoard({ usage }), FIXTURE_NOW, 'live').statusDetails).toEqual(['example_window 8%', '24-hour window 3%']);
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

  test('the stepper shows the record\'s statuses, and only a done or recheck step reopens at its route', () => {
    const model = headerModelOf(pipelineBoardStateOf('A0b-recheck'), FIXTURE_NOW, 'live');
    expect(model.setupSteps?.map(({ key, status, reopensAt }) => [key, status, reopensAt])).toEqual([
      ['billing', 'done', { tab: 'pipeline', item: 'setup/billing' }],
      ['research', 'current', null],
      ['constitution', 'recheck', { tab: 'pipeline', item: 'setup/constitution' }],
      ['design', 'recheck', { tab: 'pipeline', item: 'setup/design' }],
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

  test('an unreadable pipeline is setup too, a readable one is not, and before the first board the header is not in setup', () => {
    expect(headerModelOf(pipelineBoardStateOf('A0-unreadable'), FIXTURE_NOW, 'live').setupSteps).not.toBeNull();
    expect(headerModelOf(pipelineBoardStateOf('A5'), FIXTURE_NOW, 'live').setupSteps).toBeNull();
    expect(headerModelOf(null, FIXTURE_NOW, 'connecting').setupSteps).toBeNull();
  });
});

describe('the warnings and notices', () => {
  test('the warnings are the forge\'s sentences as served; an incident default is no notice of the header', () => {
    const model = headerModelOf(servingBoard({
      warnings: [noticeOf('restart-failed', 'Example: the restart failed'), noticeOf('assistant-down', 'Example: no Assistant can come up')],
      notices:  [{ ...noticeOf('incident-defaulted', 'Example: incident I3 took its default'), causeText: 'Example cause' }],
    }), FIXTURE_NOW, 'live');
    expect(model.warnings).toEqual(['Example: the restart failed', 'Example: no Assistant can come up']);
    expect(model.notices).toEqual([]);
  });

  test('the other notices are listed in the forge\'s own sentences, in their order', () => {
    const model = headerModelOf(servingBoard({
      notices: [
        noticeOf('dirty-main-checkout', 'Example: landings on main wait'),
        noticeOf('rounds-not-converging', 'Example: the rounds of #42 are not converging'),
      ],
    }), FIXTURE_NOW, 'live');
    expect(model.notices).toEqual(['Example: landings on main wait', 'Example: the rounds of #42 are not converging']);
    expect(model.warnings).toEqual([]);
  });
});

/** Seven rows in progress, three slot jobs (two builders and a reviewer) against a limit of five, and the Assistant beside them. */
function boardWithSlotJobsAndMoreRows(): BoardDocument {
  const board = servingBoard();
  const runningRows = [10, 11, 12, 13, 14, 15, 16].map((id) => exampleTask({
    id, name: `#${id} Example row`, status: 'in-progress', start: '2026-10-29T11:00:00'
  }));
  return {
    ...board,
    jobs: [
      FIXTURE_ASSISTANT_JOB,
      exampleAgentJob({ id: 'J2' }),
      exampleAgentJob({ id: 'J3' }),
      exampleAgentJob({ id: 'J5', kind: 'review', role: 'reviewer' }),
    ],
    concurrency: { limit: 5, agentsInFlight: 3 },
    launchSlots: { limit: 5, slotJobIds: ['J2', 'J3', 'J5'], inProgressTicketIdsWithoutJob: ['3'] },
    page:        { ...board.page, progress: { ...board.page.progress, tasks: [...board.page.progress.tasks, ...runningRows] } },
  };
}

describe('concurrency, usage and the statistics', () => {
  test('agents against the limit, today\'s figures as served, the queue, and the open incidents', () => {
    const model = headerModelOf(servingBoard(), FIXTURE_NOW, 'live');
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

  test('today\'s figures show as the forge serves them, never counted from the tickets, and read zero on another date than the one counted', () => {
    const served = servingBoard({ today: { calendarDate: '2026-10-29', deliveredTickets: 7, tokens: 1_250_000 } });
    const figuresOf = (board: BoardDocument, now: Date): (string | undefined)[] => {
      const { statistics } = headerModelOf(board, now, 'live');
      return ['done today', 'tokens today'].map((label) => statistics.find((statistic) => statistic.label === label)?.figure);
    };
    expect(figuresOf(served, FIXTURE_NOW)).toEqual(['7', '1.25M']);
    expect(figuresOf(served, new Date('2026-10-30T09:00:00'))).toEqual(['0', '0']);
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

  test('a paused ticket adds the paused figure after the agents, in the paused state', () => {
    const board = servingBoard();
    const pausedFacts = [...board.page.facts.tickets, { ...examplePageTicketFacts({ id: '9', status: 'in-progress' }), displayState: 'paused' as const }];
    const model = headerModelOf({ ...board, page: { ...board.page, facts: { ...board.page.facts, tickets: pausedFacts } } }, FIXTURE_NOW, 'live');
    expect(model.statistics.slice(0, 2).map(({ figure, label, state: figureState }) => [figure, label, figureState])).toEqual([
      ['1 / 4', 'agents working', null],
      ['1', 'paused', 'paused'],
    ]);
  });

  test('a usage limit hit reads with its window\'s word and when it resets on the viewer\'s clock, not the stored UTC one', () => {
    const resetsAt = '2026-10-29T14:30:00.000Z';
    const resetMoment = new Date(Date.parse(resetsAt));
    const viewerClock = `${String(resetMoment.getHours()).padStart(2, '0')}:${String(resetMoment.getMinutes()).padStart(2, '0')}`;
    const windows = [{
      window: 'example_five_hours', lengthHours: 5, utilization: 100, resetsAt
    }];
    const detailOf = (stamp: string): string | undefined =>
      headerModelOf(servingBoard({ usage: { resetsAt: stamp, window: 'example_five_hours', windows } }), FIXTURE_NOW, 'live').statusDetails.at(-1);
    expect(detailOf(resetsAt)).toBe(`5-hour window usage limit hit, resets ${viewerClock}`);
    expect(detailOf('2026-10-29T15:30:00+01:00')).toBe(detailOf(resetsAt));
  });

  test('a usage limit hit whose reset does not parse reads without a reset time, a week by its length', () => {
    const windows = [{
      window: 'example_week', lengthHours: 168, utilization: 100, resetsAt: '2026-11-02T09:00:00Z'
    }];
    expect(headerModelOf(servingBoard({ usage: { resetsAt: 'soon', window: 'example_week', windows } }), FIXTURE_NOW, 'live').statusDetails.at(-1))
      .toBe('week usage limit hit');
  });

  test('a usage limit hit on a window no observation gives a length reads with the window\'s stored name', () => {
    expect(headerModelOf(servingBoard({ usage: { resetsAt: 'soon', window: 'example_window', windows: [] } }), FIXTURE_NOW, 'live').statusDetails[0])
      .toBe('example_window usage limit hit');
  });
});
