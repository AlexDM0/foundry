/**
 * The Kanban's entity rail and its monorepo marks, in a happy-dom document. What matters: a board without entities shows no rail, no
 * entity key and no stages, as before; in monorepo mode the rail sits beside the lanes as a filter, every entity shown and pressed at first,
 * the entities in their groups with their open tickets counted; a press on an entity narrows the lanes to its tickets and presses its row,
 * and the row of every entity shows them all again; the filter field narrows the rows; the lanes carry a swimlane head per entity; a card
 * names its entity; and a crossing ticket's card shows its five stages, the package's dashed, and says where it is in words.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useState } from 'react';

import type { BoardDocument }                 from '../../../@types/board/BoardDocument.ts';
import { BoardClockContext, type BoardClock } from '../../shell/BoardClock.ts';
import { ControlSurroundingsContext }         from '../../shell/ControlAvailability.ts';
import { QuestionPanelShownContext }          from '../../shell/CoveringPanel.ts';
import { FinishedWorkWindowContext }          from '../../shell/FinishedWorkWindow.ts';
import { QuestionPanelOpenerContext }         from '../../shell/QuestionPanelOpener.ts';
import { routedOnTab }                        from '../../testing/DetailRoutingFixture.ts';
import { EXAMPLE_NOW_EPOCH_MILLISECONDS }     from '../../testing/KanbanBoardFixture.ts';
import { exampleBoard, exampleTicket }        from '../../testing/KanbanBoardFixture.ts';
import { KanbanModel }                        from './KanbanModel.ts';
import { KanbanView }                         from './KanbanView.tsx';

afterEach(cleanup);

const MONOREPO_BOARD = exampleBoard({
  tickets: [
    exampleTicket('001'),
    exampleTicket('002'),
    exampleTicket('003', { status: 'in-progress', crosses: ['example-ui'] }),
  ],
  entities:     { 'web': { kind: 'app' }, 'example-ui': { kind: 'package' }, 'root': { kind: 'root' } },
  entityById:   { '001': 'web', '002': 'example-ui', '003': 'web' },
  stageById:    { '003': { name: 'package-review', entity: 'example-ui' } },
  filingDrafts: [],
});

const SINGLE_BOARD = exampleBoard({ tickets: [exampleTicket('001'), exampleTicket('002', { status: 'in-progress' })], filingDrafts: [] });

const STILL_CLOCK: BoardClock = {
  now:         () => new Date(EXAMPLE_NOW_EPOCH_MILLISECONDS),
  everySecond: () => () => undefined,
  after:       () => () => undefined,
};

function ChoosingKanban({ boardState }: { readonly boardState: BoardDocument }) {
  const [chosenEntity, setChosenEntity] = useState<string | null>(null);
  return (
    <KanbanView
      board={boardState}
      filters={KanbanModel.kanbanFilterModelOf(boardState, [], 'filed', chosenEntity, 'by-entity')}
      boardStore={null}
      streamIsLive={false}
      mergeQueueHref="#forge/example-tracker/progress/kanban/merge-queue"
      draftsWaitingCount={0}
      ticketsHref="#forge/example-tracker/tickets"
      onShowAllFinished={() => undefined}
      onChooseEntity={setChosenEntity}
    />
  );
}

function renderKanban(boardState: BoardDocument): void {
  const surroundings = { availability: 'enabled' as const, commandClient: { send: () => Promise.reject(new Error('no command is sent')) }, onInstallHeld: () => undefined };
  render(
    <ControlSurroundingsContext value={surroundings}>
      <BoardClockContext value={STILL_CLOCK}>
        <FinishedWorkWindowContext value={{ choice: 'all', cutoffEpochMilliseconds: Number.NEGATIVE_INFINITY, nowEpochMilliseconds: EXAMPLE_NOW_EPOCH_MILLISECONDS }}>
          <QuestionPanelOpenerContext value={() => undefined}>
            <QuestionPanelShownContext value={false}>
              {routedOnTab('kanban', <ChoosingKanban boardState={boardState} />, null).element}
            </QuestionPanelShownContext>
          </QuestionPanelOpenerContext>
        </FinishedWorkWindowContext>
      </BoardClockContext>
    </ControlSurroundingsContext>,
  );
}

function shownCardIds(): (string | null)[] {
  return [...document.querySelectorAll('[data-card]')].map((card) => card.getAttribute('data-ticket-id'));
}

function railRows(): HTMLElement[] {
  return within(screen.getByRole('region', { name: 'Kanban entities' })).getAllByRole('button');
}

describe('a board without entities', () => {
  test('shows no rail, no entity key and no stages', () => {
    renderKanban(SINGLE_BOARD);
    expect(screen.queryByRole('region', { name: 'Kanban entities' })).toBeNull();
    expect(document.querySelector('.board-kanban-body, .board-kanban-entity, .board-kanban-crossing, [data-swimlane]')).toBeNull();
    expect(shownCardIds()).toEqual(['001', '002']);
  });
});

describe('the entity rail', () => {
  test('sits beside the lanes as a filter, every entity pressed first, the entities in their groups with their open tickets', () => {
    renderKanban(MONOREPO_BOARD);
    expect(railRows().map((row) => [row.getAttribute('aria-label'), row.getAttribute('aria-pressed')])).toEqual([
      ['All entities, 3 open tickets', 'true'],
      ['web, app, 2 open tickets', 'false'],
      ['example-ui, package, 2 open tickets', 'false'],
      ['root, every other path, 0 open tickets', 'false'],
    ]);
    expect(within(screen.getByRole('group', { name: 'Packages' })).getByRole('button').textContent).toContain('example-ui');
  });

  test('a press narrows the lanes to that entity\'s tickets and presses its row; every entity shows them all again', () => {
    renderKanban(MONOREPO_BOARD);
    fireEvent.click(railRows()[2] ?? document.body);
    expect(shownCardIds()).toEqual(['002', '003']);
    expect(railRows()[2]?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(railRows()[0] ?? document.body);
    expect(shownCardIds()).toEqual(['001', '002', '003']);
  });

  test('the filter field narrows the entity rows and keeps the row of every entity', () => {
    renderKanban(MONOREPO_BOARD);
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter entities' }), { target: { value: 'root' } });
    expect(railRows().map((row) => row.getAttribute('aria-label'))).toEqual(['All entities, 3 open tickets', 'root, every other path, 0 open tickets']);
  });
});

describe('the lanes and cards in monorepo mode', () => {
  test('each lane carries a swimlane head per entity, and each card names its entity', () => {
    renderKanban(MONOREPO_BOARD);
    const readyLane = screen.getByRole('region', { name: 'Ready' });
    expect([...readyLane.querySelectorAll('[data-swimlane]')].map((head) => head.textContent)).toEqual(['web 1', 'example-ui 1']);
    expect([...document.querySelectorAll('.board-kanban-entity')].map((key) => key.textContent)).toEqual(['web', 'example-ui', 'web']);
  });

  test('a crossing ticket\'s card shows its five stages, the package\'s dashed, and says where it is', () => {
    renderKanban(MONOREPO_BOARD);
    const crossingCard = document.querySelector('[data-ticket-id="003"]');
    const stages = [...crossingCard?.querySelectorAll('.board-kanban-crossing-stage') ?? []];
    expect(stages.map((stage) => [stage.getAttribute('data-owner'), stage.getAttribute('data-status')])).toEqual([
      ['home', 'done'],
      ['package', 'done'],
      ['package', 'current'],
      ['home', 'upcoming'],
      ['home', 'upcoming'],
    ]);
    expect(crossingCard?.textContent).toContain('Package review in example-ui, stage 3 of 5');
    expect(crossingCard?.getAttribute('aria-label')).toContain('Package review in example-ui, stage 3 of 5');
  });
});
