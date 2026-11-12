/**
 * The action bar, in a happy-dom document. What matters: it is a region named by its label, and its start and end hold what the caller
 * passed, in that order.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { ActionBar } from './ActionBar.tsx';

afterEach(() => {
  cleanup();
});

describe('the action bar', () => {
  test('a region named by its label, its start and its end in order', () => {
    render(<ActionBar label="Setup actions" start={<span>Researching</span>} end={<button type="button">Continue</button>} />);
    const bar = screen.getByRole('region', { name: 'Setup actions' });
    expect(bar.getAttribute('class')).toBe('bridge-action-bar');
    expect([...bar.children].map((child) => [child.getAttribute('class'), child.textContent])).toEqual([
      ['bridge-action-bar-start', 'Researching'],
      ['bridge-action-bar-end', 'Continue'],
    ]);
  });
});
