/**
 * The view title row, in a happy-dom document. What matters: the title is the page's `h2` in the display role, and the lead is one muted
 * paragraph in the lead role under it, whatever markup it holds; and the words are text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { ViewTitle } from './ViewTitle.tsx';

afterEach(() => {
  cleanup();
});

describe('the view title row', () => {
  test('the title is the h2 in the display role, and the lead a muted paragraph under it', () => {
    render(<ViewTitle title="Agents" lead={<><span aria-live="polite">3 jobs</span> at work.</>} />);
    const title = screen.getByRole('heading', { level: 2, name: 'Agents' });
    const lead = title.nextElementSibling;
    expect([title.getAttribute('data-type-role'), lead?.tagName, lead?.getAttribute('data-type-role'), lead?.getAttribute('data-ink'), lead?.textContent])
      .toEqual(['display', 'P', 'lead', 'muted', '3 jobs at work.']);
  });

  test('the words are text, never markup', () => {
    const { container } = render(<ViewTitle title="<b>planted</b>" lead="<i>planted</i>" />);
    expect([container.querySelector('b'), container.querySelector('i'), screen.getByRole('heading').textContent]).toEqual([null, null, '<b>planted</b>']);
  });
});
