/**
 * The activity row, in a happy-dom document. What matters: the row is one link to its `href`, named by what it shows; the status reaches
 * `data-status` (a step's live dot or a check's spinner, both decoration only); and the meter shows only when given.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { ActivityRow } from './ActivityRow.tsx';

afterEach(() => {
  cleanup();
});

describe('the activity row', () => {
  test('a step is one link to its place, with its status, id, step, meter and elapsed time', () => {
    render(<ActivityRow href="#item/T-014" status="step" idText="T-014" stepText="Writer" meter={<span className="design-system-stamp">opus</span>} elapsed="12 m" />);
    const row = screen.getByRole('link');
    expect([row.getAttribute('class'), row.getAttribute('href'), row.getAttribute('data-status'), row.textContent])
      .toEqual(['design-system-activity-row', '#item/T-014', 'step', 'T-014Writeropus12 m']);
    expect(row.querySelector('.design-system-activity-row-mark')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('a check carries its own status, and no meter shows without one', () => {
    render(<ActivityRow href="#item/T-012" status="check" idText="T-012" stepText="First check · tests" elapsed="38 s" />);
    const row = screen.getByRole('link');
    expect([row.getAttribute('data-status'), row.textContent]).toEqual(['check', 'T-012First check · tests38 s']);
    expect(row.querySelector('.design-system-stamp')).toBeNull();
  });
});
