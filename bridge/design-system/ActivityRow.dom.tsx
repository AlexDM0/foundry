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
    render(<ActivityRow href="#ticket/T-014" status="step" idText="T-014" stepText="Builder" meter={<span className="bridge-stamp">opus</span>} elapsed="12 m" />);
    const row = screen.getByRole('link');
    expect([row.getAttribute('class'), row.getAttribute('href'), row.getAttribute('data-status'), row.textContent])
      .toEqual(['bridge-activity-row', '#ticket/T-014', 'step', 'T-014Builderopus12 m']);
    expect(row.querySelector('.bridge-activity-row-mark')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('a check carries its own status, and no meter shows without one', () => {
    render(<ActivityRow href="#ticket/T-012" status="check" idText="T-012" stepText="Build gate · tests" elapsed="38 s" />);
    const row = screen.getByRole('link');
    expect([row.getAttribute('data-status'), row.textContent]).toEqual(['check', 'T-012Build gate · tests38 s']);
    expect(row.querySelector('.bridge-stamp')).toBeNull();
  });
});
