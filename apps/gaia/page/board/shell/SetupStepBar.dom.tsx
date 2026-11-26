/**
 * The setup step bar in a mounted board. What matters: it is a compact stepper of the record's steps, a done step with a check, the current
 * step `aria-current="step"` with its dot and the others their label alone; a done or recheck step links to its route under the mounted
 * forge and no other step links; the bar is the stepper alone, since the step's page says which step it is.
 */
import {
  cleanup,
  render,
  screen,
  within
} from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import type { BoardDocument }                  from '../../@types/board/BoardDocument.ts';
import { boardHrefOf, boardRouteSurroundings } from '../testing/BoardRouteSurroundings.tsx';
import { FIXTURE_NOW }                         from '../testing/BoardStateFixture.ts';
import { pipelineBoardStateOf }                from '../testing/PipelineFixture.ts';
import { headerModelOf }                       from './HeaderModel.ts';
import { SetupStepBar }                        from './SetupStepBar.tsx';

afterEach(cleanup);

function renderedStepBar(board: BoardDocument): void {
  const steps = headerModelOf(board, FIXTURE_NOW, 'live').setupSteps;
  if (steps === null) throw new Error('The board is not in setup.');
  render(boardRouteSurroundings().wrap(<SetupStepBar steps={steps} />));
}

test('the step bar shows the record\'s statuses, the current step is aria-current, and done and recheck steps link to their route', () => {
  renderedStepBar(pipelineBoardStateOf('A0b-recheck'));
  const stepper = screen.getByRole('list', { name: 'Setup steps' });
  expect(stepper.hasAttribute('data-compact')).toBe(true);
  const steps = [...stepper.querySelectorAll('.design-system-stepper-step')];
  expect(steps.map((step) => step.getAttribute('data-status'))).toEqual(['done', 'done', 'current', 'recheck', 'recheck', 'upcoming']);
  expect(steps.map((step) => step.querySelector('.design-system-stepper-check') !== null)).toEqual([true, true, false, false, false, false]);
  expect(steps.map((step) => step.querySelector('.design-system-stepper-circle') !== null)).toEqual([true, true, true, false, false, false]);
  expect(steps[2]?.getAttribute('aria-current')).toBe('step');
  expect(screen.queryByText(/Step 3 of 6|saved as you go/u)).toBeNull();
  expect(within(stepper).getByRole('link', { name: 'Billing' }).getAttribute('href')).toBe(boardHrefOf('pipeline/setup/billing'));
  expect(within(stepper).getByRole('link', { name: 'Constitution' }).getAttribute('href')).toBe(boardHrefOf('pipeline/setup/constitution'));
  expect(within(stepper).queryByRole('link', { name: 'Research' })).toBeNull();
  expect(within(stepper).queryByRole('link', { name: 'Apply' })).toBeNull();
});
