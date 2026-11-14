/**
 * The empty state, in a happy-dom document. What matters: it shows its text, then an action after it; compact sets `data-compact`; and the
 * text is text, never markup.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { EmptyState } from './EmptyState.tsx';

afterEach(() => {
  cleanup();
});

describe('the empty state', () => {
  test('it shows an action after its text', () => {
    const { container } = render(<EmptyState text="3 jobs. "><a href="#overview/merge-queue">Merge queue</a></EmptyState>);
    expect([container.querySelector('.design-system-empty')?.textContent, container.querySelector('.design-system-empty > a')?.getAttribute('href')]).toEqual([
      '3 jobs. Merge queue',
      '#overview/merge-queue',
    ]);
  });

  test('compact sets data-compact, and the standard padding sets nothing', () => {
    const { container } = render(<><EmptyState text="Nothing here." compact /><EmptyState text="Nothing here." /></>);
    expect([...container.querySelectorAll('.design-system-empty')].map((empty) => empty.hasAttribute('data-compact'))).toEqual([true, false]);
  });

  test('the text is text, never markup', () => {
    const { container } = render(<EmptyState text="<b>planted</b>" />);
    expect([container.querySelector('b'), container.querySelector('.design-system-empty')?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
