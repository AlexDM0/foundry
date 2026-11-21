/**
 * The Kanban's monorepo parts, pure. What matters: a board with no readable pipeline, or one without entities, gets no filter, so single
 * mode stays as it was; an entity counts its own open tickets and a crossing's while a package stage runs in it, never a closed one; a
 * stored entity the pipeline no longer names chooses nothing; the rail leads with every entity, groups apps, packages and root, and the
 * filter text narrows the entities but never that row; the swimlanes follow the rail's order and close with the tickets that have no
 * entity yet; a crossing's stages before the current one are done, the package stages name the package, and its line says where it is.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDocument }                from '../../../@types/board/BoardDocument.ts';
import type { BoardAppliedPipelineDocument } from '../../../@types/board/BoardPipelineDocuments.ts';
import { exampleBoard, exampleTicket }       from '../../testing/KanbanBoardFixture.ts';
import { KanbanEntityFilterModel }           from './KanbanEntityFilterModel.ts';

const ENTITIES = {
  'root': { kind: 'root' }, 'example-ui': { kind: 'package' }, 'web': { kind: 'app' }, 'admin': { kind: 'app' }
} as const;

function monorepoBoard(): BoardDocument {
  return exampleBoard({
    tickets: [
      exampleTicket('001', { status: 'in-progress' }),
      exampleTicket('002'),
      exampleTicket('003', { status: 'delivered' }),
      exampleTicket('004'),
      exampleTicket('005'),
    ],
    entities:   ENTITIES,
    entityById: {
      '001': 'web', '002': 'admin', '003': 'web', '004': 'example-ui'
    },
    stageById: { '001': { name: 'package-build', entity: 'example-ui' } },
  });
}

describe('KanbanEntityFilterModel.entityFilterOf', () => {
  test('gives no filter on a board without a readable pipeline, or whose pipeline has no entities', () => {
    const singleBoard = exampleBoard({ tickets: [exampleTicket('001')] });
    const monorepoApplied = monorepoBoard().pipeline.applied;
    if (monorepoApplied.readingVerdict !== 'readable') throw new Error('the monorepo board has no readable pipeline');
    const boardApplying = (applied: BoardAppliedPipelineDocument): BoardDocument => ({ ...singleBoard, pipeline: { ...singleBoard.pipeline, applied } });
    expect(KanbanEntityFilterModel.entityFilterOf(singleBoard, 'web', 'by-entity')).toBeNull();
    expect(KanbanEntityFilterModel.entityFilterOf(boardApplying({ readingVerdict: 'malformed', reason: 'example', fileText: '' }), null, 'by-entity')).toBeNull();
    expect(KanbanEntityFilterModel.entityFilterOf(boardApplying({ ...monorepoApplied, pipeline: { ...monorepoApplied.pipeline, entities: null } }), null, 'by-entity'))
      .toBeNull();
    expect(KanbanEntityFilterModel.entityFilterOf(boardApplying({ ...monorepoApplied, pipeline: { ...monorepoApplied.pipeline, entities: {} } }), null, 'none'))
      .toBeNull();
  });

  test('counts each entity\'s open tickets, a crossing\'s in the package its stage runs in too, and never a closed one', () => {
    const filter = KanbanEntityFilterModel.entityFilterOf(monorepoBoard(), null, 'by-entity');
    expect(filter?.entities).toEqual([
      { key: 'root', kind: 'root', openTicketCount: 0 },
      { key: 'example-ui', kind: 'package', openTicketCount: 2 },
      { key: 'web', kind: 'app', openTicketCount: 1 },
      { key: 'admin', kind: 'app', openTicketCount: 1 },
    ]);
    expect(filter?.openTicketCount).toBe(4);
  });

  test('keeps a stored entity the pipeline names, and drops one it no longer names', () => {
    expect(KanbanEntityFilterModel.entityFilterOf(monorepoBoard(), 'web', 'none')?.chosenEntity).toBe('web');
    expect(KanbanEntityFilterModel.entityFilterOf(monorepoBoard(), 'example-gone', 'none')?.chosenEntity).toBeNull();
  });
});

describe('KanbanEntityFilterModel.railOf', () => {
  const filter = KanbanEntityFilterModel.entityFilterOf(monorepoBoard(), 'web', 'by-entity');
  if (filter === null) throw new Error('the monorepo board has no entity filter');

  test('leads with every entity, then groups apps, packages and root, the chosen entity selected', () => {
    const rail = KanbanEntityFilterModel.railOf(filter, '');
    expect(rail.allRow).toMatchObject({ entityKey: null, selected: false, accessibleName: 'All entities, 4 open tickets' });
    expect(rail.groups.map((group) => [group.label, group.rows.map((row) => row.name)])).toEqual([
      ['Apps', ['web', 'admin']],
      ['Packages', ['example-ui']],
      ['Root', ['root']],
    ]);
    expect(rail.groups[0]?.rows[0]).toMatchObject({ selected: true, accessibleName: 'web, app, 1 open ticket' });
  });

  test('narrows the entities by key or kind, never the row of every entity, and says when none matches', () => {
    expect(KanbanEntityFilterModel.railOf(filter, 'PACK').groups.flatMap((group) => group.rows.map((row) => row.name))).toEqual(['example-ui']);
    const nothing = KanbanEntityFilterModel.railOf(filter, 'example-nothing');
    expect(nothing.groups).toEqual([]);
    expect(nothing.nothingMatches).toBe(true);
    expect(nothing.allRow.name).toBe('All entities');
  });
});

describe('KanbanEntityFilterModel.swimlanesOf', () => {
  test('runs each entity\'s cards in the rail\'s order, keeps the lane\'s order inside, and closes with the cards of no known entity', () => {
    const filter = KanbanEntityFilterModel.entityFilterOf(monorepoBoard(), null, 'by-entity');
    if (filter === null) throw new Error('the monorepo board has no entity filter');
    const cards = [
      { id: 'a', entityKey: 'example-ui' },
      { id: 'b', entityKey: null },
      { id: 'c', entityKey: 'web' },
      { id: 'd', entityKey: 'example-ui' },
      { id: 'e', entityKey: 'example-gone' },
    ];
    expect(KanbanEntityFilterModel.swimlanesOf(cards, (card) => card.entityKey, filter).map((swimlane) => [swimlane.title, swimlane.cards.map((card) => card.id)]))
      .toEqual([['web', ['c']], ['example-ui', ['a', 'd']], ['No entity yet', ['b', 'e']]]);
  });
});

describe('KanbanEntityFilterModel.crossingOf', () => {
  test('gives no crossing to a ticket without a stage', () => {
    expect(KanbanEntityFilterModel.crossingOf(null, 'web', ['example-ui'])).toBeNull();
  });

  test('marks the stages before the current one done, names the package on its stages, and says where the ticket is', () => {
    const crossing = KanbanEntityFilterModel.crossingOf({ name: 'package-review', entity: 'example-ui' }, 'web', []);
    expect(crossing?.stages.map((stage) => [stage.name, stage.owner, stage.entityKey, stage.status])).toEqual([
      ['build', 'home', 'web', 'done'],
      ['package-build', 'package', 'example-ui', 'done'],
      ['package-review', 'package', 'example-ui', 'current'],
      ['adapt', 'home', 'web', 'upcoming'],
      ['review', 'home', 'web', 'upcoming'],
    ]);
    expect(crossing?.text).toBe('Package review in example-ui, stage 3 of 5');
  });

  test('in a home stage, names the package from the packages the ticket crosses, and the stage runs in the home', () => {
    const crossing = KanbanEntityFilterModel.crossingOf({ name: 'adapt', entity: 'web' }, 'web', ['example-ui']);
    expect(crossing?.stages[1]?.entityKey).toBe('example-ui');
    expect(crossing?.text).toBe('Adapt in web, stage 4 of 5');
  });
});
