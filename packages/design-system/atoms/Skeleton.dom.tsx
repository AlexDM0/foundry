/**
 * The skeleton, in a happy-dom document. What matters: it is a busy status named by its accessible name, drawing the number of lines asked
 * for, each hidden from the accessibility tree.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Skeleton } from './Skeleton.tsx';

afterEach(() => {
  cleanup();
});

describe('the skeleton', () => {
  test('a named busy status of the lines asked for, each hidden', () => {
    render(<Skeleton lines={3} accessibleName="Findings are on their way" />);
    const skeleton = screen.getByRole('status', { name: 'Findings are on their way' });
    const lines = [...skeleton.querySelectorAll('.design-system-skeleton-line')];
    expect([skeleton.getAttribute('aria-busy'), lines.length, lines.every((line) => line.getAttribute('aria-hidden') === 'true')])
      .toEqual(['true', 3, true]);
  });
});
