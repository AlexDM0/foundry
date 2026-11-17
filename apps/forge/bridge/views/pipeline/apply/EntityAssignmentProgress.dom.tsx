/**
 * The product owner's entity assignments in a happy-dom document, read-only. What matters: the forge level's line counts the progress and
 * opens the dialog; the dialog lists each ticket with its title, reason and entity, or that it waits, each ticket a link to its detail;
 * Close is its one button and nothing sends a command; the line is gone once every ticket has an entity and the job ended.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { EntityAssignmentFacts } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { clickSettled, fakeControls } from '../../../testing/FakeControls.ts';
import { EntityAssignmentLine }       from './EntityAssignmentProgress.tsx';

afterEach(cleanup);

const ASSIGNMENT: EntityAssignmentFacts = {
  jobId:    'J30',
  jobState: 'running',
  tickets:  [
    {
      ticketId: '21', title: 'Show stock levels on the product page', entity: 'web', reason: 'Touches apps/web/app/product/', assignedBy: 'product-owner',
    },
    {
      ticketId: '22', title: 'Give Button a loading state', entity: null, reason: null, assignedBy: null,
    },
  ],
};

function progressDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'The product owner gives 2 tickets an entity' });
}

describe('the assignment progress', () => {
  test('the line counts the progress and opens the dialog with each ticket, its reason and its entity', async () => {
    const controls = fakeControls();
    controls.render(<EntityAssignmentLine assignment={ASSIGNMENT} />);
    expect(screen.getByText('The product owner gives 2 tickets an entity: 1 of 2 assigned.')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Show the assignments' }));
    const rows = within(progressDialog()).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      '21Show stock levels on the product pageTouches apps/web/app/product/web',
      '22Give Button a loading stateThe product owner has not assigned it yet.Waiting',
    ]);
    expect(within(progressDialog()).getByRole('link', { name: 'Open ticket 21' }).getAttribute('href')).toBe('#kanban/ticket/21');
    expect(within(progressDialog()).getByText('1 of 2 assigned.')).toBeDefined();
  });

  test('is read-only: Close is its one button, and nothing sends a command', async () => {
    const controls = fakeControls();
    controls.render(<EntityAssignmentLine assignment={ASSIGNMENT} />);
    await clickSettled(screen.getByRole('button', { name: 'Show the assignments' }));
    const buttons = within(progressDialog()).getAllByRole('button');
    expect(buttons.length).toBe(within(progressDialog()).getAllByRole('button', { name: 'Close' }).length);
    expect(within(progressDialog()).queryAllByRole('checkbox')).toEqual([]);
    expect(within(progressDialog()).queryAllByRole('textbox')).toEqual([]);
    const [closeButton] = within(progressDialog()).getAllByRole('button', { name: 'Close' }).slice(-1);
    if (closeButton === undefined) throw new Error('the dialog has a Close button');
    await clickSettled(closeButton);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(controls.sent).toEqual([]);
  });

  test('the line is gone once every ticket has an entity and the product owner ended', () => {
    const controls = fakeControls();
    controls.render(<EntityAssignmentLine assignment={{ ...ASSIGNMENT, jobState: null, tickets: ASSIGNMENT.tickets.slice(0, 1) }} />);
    expect(screen.queryByRole('button', { name: 'Show the assignments' })).toBeNull();
  });
});
