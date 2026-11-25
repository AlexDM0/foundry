/**
 * The Kanban's view model in monorepo mode. What matters: a board without entities gets no entity filter, and its cards carry no entity
 * and no stages, so single mode is the model it was; a chosen entity shows its own tickets and a crossing in a package stage that runs in
 * it, nothing else; with every entity shown and the swimlanes by entity, each lane divides its cards by entity under counted heads, below
 * what leads the lane; with swimlanes off, or one entity chosen, the lane keeps its single-mode groups; a card names its entity, and a
 * crossing ticket's card carries its stages and says where it is in its accessible name.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDocument }                         from '../../../@types/board/BoardDocument.ts';
import { EXAMPLE_SURROUNDINGS_SHOWING_ALL_FINISHED }  from '../../testing/KanbanBoardFixture.ts';
import { exampleBoard, exampleTicket }                from '../../testing/KanbanBoardFixture.ts';
import type { KanbanSwimlanes }                       from './KanbanEntityFilterModel.ts';
import { DEFAULT_KANBAN_LAYOUT, KanbanModel }         from './KanbanModel.ts';
import type { KanbanCardGroupModel, KanbanViewModel } from './KanbanModel.ts';

const ENTITIES = { 'web': { kind: 'app' }, 'example-ui': { kind: 'package' }, 'root': { kind: 'root' } } as const;

function monorepoBoard(): BoardDocument {
  return exampleBoard({
    tickets: [
      exampleTicket('001', { priority: 'high' }),
      exampleTicket('002', { status: 'ready-for-review' }),
      exampleTicket('003'),
      exampleTicket('004', { status: 'in-progress', crosses: ['example-ui'] }),
      exampleTicket('005'),
    ],
    entities:   ENTITIES,
    entityById: {
      '001': 'example-ui', '002': 'web', '003': 'web', '004': 'web'
    },
    stageById:    { '004': { name: 'package-build', entity: 'example-ui' } },
    filingDrafts: [],
  });
}

function modelOf(state: BoardDocument, storedEntity: string | null = null, swimlanes: KanbanSwimlanes = 'by-entity'): KanbanViewModel {
  const filters = KanbanModel.kanbanFilterModelOf(state, [], 'filed', storedEntity, swimlanes);
  return KanbanModel.kanbanModelOf(state, filters, DEFAULT_KANBAN_LAYOUT, EXAMPLE_SURROUNDINGS_SHOWING_ALL_FINISHED);
}

function groupHeadsOf(model: KanbanViewModel, laneKey: string): string[] {
  const groups: readonly KanbanCardGroupModel[] = model.lanes.find((lane) => lane.key === laneKey)?.groups ?? [];
  return groups.map((group) => `${group.kind}:${'title' in group ? group.title : group.key}:${group.cards.map((card) => card.idText).join(' ')}`);
}

describe('a board without entities', () => {
  test('has no entity filter, and its cards carry no entity and no stages', () => {
    const board = exampleBoard({ tickets: [exampleTicket('001'), exampleTicket('002', { status: 'in-progress' })] });
    expect(KanbanModel.kanbanFilterModelOf(board, [], 'filed', 'web', 'by-entity').entityFilter).toBeNull();
    const cards = modelOf(board, 'web').lanes.flatMap((lane) => lane.cards);
    expect(cards.map((card) => card.idText)).toEqual(['#001', '#002']);
    expect(cards.some((card) => Object.hasOwn(card, 'entityKey') || Object.hasOwn(card, 'crossing'))).toBe(false);
  });
});

describe('the entity filter', () => {
  test('a chosen entity shows its own tickets', () => {
    const cards = modelOf(monorepoBoard(), 'web').lanes.flatMap((lane) => lane.cards.map((card) => card.idText));
    expect(cards).toEqual(['#003', '#004']);
  });

  test('a package shows its own tickets and a crossing whose package stage runs in it', () => {
    const cards = modelOf(monorepoBoard(), 'example-ui').lanes.flatMap((lane) => lane.cards.map((card) => card.idText));
    expect(cards).toEqual(['#001', '#004']);
  });
});

describe('the swimlanes', () => {
  test('divide each lane by entity under counted heads, below what leads the lane, the tickets with no entity last', () => {
    const model = modelOf(monorepoBoard());
    expect(groupHeadsOf(model, 'ready')).toEqual([
      'entity:web:#003',
      'entity:example-ui:#001',
      'entity:No entity yet:#005',
    ]);
    const webLane = model.lanes.find((lane) => lane.key === 'ready')?.groups.find((group) => group.kind === 'entity');
    expect(webLane).toMatchObject({ entityKey: 'web', count: 1 });
  });

  test('off, or with one entity chosen, leave the lane its single-mode groups', () => {
    expect(groupHeadsOf(modelOf(monorepoBoard(), null, 'none'), 'ready')).toEqual([
      'priority:High:#001',
      'priority:Normal:#003 #005',
    ]);
    expect(groupHeadsOf(modelOf(monorepoBoard(), 'web'), 'ready')).toEqual(['plain:cards:#003']);
  });

  test('give way to the Ready order by wave in the Ready lane, and still divide the other lanes', () => {
    const board = exampleBoard({
      tickets: [
        exampleTicket('001'),
        exampleTicket('002', { dependsOn: ['001'] }),
        exampleTicket('003', { status: 'in-progress' }),
      ],
      entities:       ENTITIES,
      entityById:     { '001': 'web', '002': 'web', '003': 'example-ui' },
      readyTicketIds: ['001'],
      filingDrafts:   [],
    });
    const filters = KanbanModel.kanbanFilterModelOf(board, [], 'by-wave', null, 'by-entity');
    const model = KanbanModel.kanbanModelOf(board, filters, DEFAULT_KANBAN_LAYOUT, EXAMPLE_SURROUNDINGS_SHOWING_ALL_FINISHED);
    const ready = model.lanes.find((lane) => lane.key === 'ready');
    expect(filters.readyOrder).toBe('by-wave');
    expect(ready?.groups.map((group) => [group.kind, group.cards.map((card) => card.idText)])).toEqual([['wave', ['#001']], ['wave', ['#002']]]);
    expect(ready?.subtitle).toBe('1 ready · 1 waiting');
    expect(groupHeadsOf(model, 'building')).toEqual(['entity:example-ui:#003']);
  });
});

describe('the cards', () => {
  test('name their entity, and a crossing ticket\'s card carries its stages and says where it is', () => {
    const cards = modelOf(monorepoBoard()).lanes.flatMap((lane) => lane.cards);
    const crossing = cards.find((card) => card.ticketId === '004');
    expect(crossing?.entityKey).toBe('web');
    expect(crossing?.crossing?.stages.map((stage) => stage.status)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(crossing?.ariaLabel.endsWith(', Package build in example-ui, stage 2 of 5')).toBe(true);
    const staying = cards.find((card) => card.ticketId === '003');
    expect(staying?.entityKey).toBe('web');
    expect(staying !== undefined && Object.hasOwn(staying, 'crossing')).toBe(false);
    expect(cards.find((card) => card.ticketId === '005')?.entityKey).toBeUndefined();
  });
});
