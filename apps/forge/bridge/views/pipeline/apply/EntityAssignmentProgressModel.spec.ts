/**
 * The product owner's entity assignments after the first Apply over entities, read-only. What matters: an assigned ticket shows its entity
 * and the product owner's reason, one assigned by User says so; while the job runs an unassigned ticket waits, and once it ended it has
 * no entity; a ticket the board no longer holds still shows; the count and the state word follow the facts; the forge level shows the
 * line while the job runs or a ticket still lacks an entity.
 */
import { describe, expect, test } from 'bun:test';

import type { EntityAssignmentFacts }    from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { EntityAssignmentProgressModel } from './EntityAssignmentProgressModel.ts';

function assignment(changes: Partial<EntityAssignmentFacts> = {}): EntityAssignmentFacts {
  return {
    jobId:    'J30',
    jobState: 'running',
    tickets:  [
      {
        ticketId: '21', title: 'Show stock levels on the product page', entity: 'web', reason: 'Touches apps/web/app/product/', assignedBy: 'product-owner',
      },
      {
        ticketId: '22', title: 'Give Button a loading state', entity: 'design-system', reason: 'Touches packages/design-system/', assignedBy: 'user',
      },
      {
        ticketId: '23', title: null, entity: null, reason: null, assignedBy: null,
      },
    ],
    ...changes,
  };
}

describe('the rows', () => {
  test('an assigned ticket shows its entity and reason; one waits while the product owner runs', () => {
    const view = EntityAssignmentProgressModel.viewOf(assignment());
    expect(view.rows.map((row) => [row.ticketId, row.title, row.reason, row.state, row.entityText])).toEqual([
      ['21', 'Show stock levels on the product page', 'Touches apps/web/app/product/', 'assigned', 'web'],
      ['22', 'Give Button a loading state', 'Assigned by you: Touches packages/design-system/', 'assigned', 'design-system'],
      ['23', 'No longer on the board', 'The product owner has not assigned it yet.', 'waiting', 'Waiting'],
    ]);
    expect(view.rows[0]?.ticketHref).toBe('#kanban/ticket/21');
  });

  test('once the product owner ended, an unassigned ticket has no entity', () => {
    const view = EntityAssignmentProgressModel.viewOf(assignment({ jobState: null }));
    expect(view.rows[2]?.state).toBe('not-assigned');
    expect(view.rows[2]?.entityText).toBe('No entity');
    expect(view.stateText).toBe('Product owner · done');
  });
});

describe('the counts and the line', () => {
  test('the title, the count and the state word follow the facts', () => {
    const view = EntityAssignmentProgressModel.viewOf(assignment());
    expect(view.title).toBe('The product owner gives 3 tickets an entity');
    expect(view.summary).toBe('2 of 3 assigned.');
    expect(view.stateText).toBe('Product owner · assigning entities');
    expect(EntityAssignmentProgressModel.lineTextOf(assignment())).toBe('The product owner gives 3 tickets an entity: 2 of 3 assigned.');
  });

  test('the line shows while the job runs or a ticket lacks an entity, and not once all are assigned and the job ended', () => {
    expect(EntityAssignmentProgressModel.lineIsShownFor(undefined)).toBe(false);
    expect(EntityAssignmentProgressModel.lineIsShownFor(assignment())).toBe(true);
    expect(EntityAssignmentProgressModel.lineIsShownFor(assignment({ jobState: null }))).toBe(true);
    const allAssigned = assignment({ jobState: null, tickets: assignment().tickets.slice(0, 2) });
    expect(EntityAssignmentProgressModel.lineIsShownFor(allAssigned)).toBe(false);
  });
});
