/**
 * The finished-work list in a happy-dom document. What matters: it shows what the choice lets through, latest closed first, each ticket
 * opening its row's detail in place over Progress, and says so when the window holds nothing.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FIXTURE_NOW, FIXTURE_TICKETS } from '../../testing/BoardStateFixture.ts';
import { FinishedWorkView }             from './FinishedWorkView.tsx';

function shownTicketLinks(): (string | null)[] {
  return [...document.querySelectorAll('.bridge-finished-list a')].map((link) => link.textContent);
}

afterEach(() => {
  cleanup();
});

describe('the finished-work list', () => {
  test('all shows every closed ticket latest first, each opening its row over Progress', () => {
    render(<FinishedWorkView tickets={FIXTURE_TICKETS} choice="all" nowEpochMilliseconds={FIXTURE_NOW.getTime()} />);
    expect(shownTicketLinks()).toEqual(['#2', '#5', '#1']);
    expect(screen.getByRole('link', { name: '#2' }).getAttribute('href')).toBe('#progress/ticket-row/2');
  });

  test('a window holding nothing says so in the window\'s words', () => {
    render(<FinishedWorkView tickets={FIXTURE_TICKETS} choice="1h" nowEpochMilliseconds={FIXTURE_NOW.getTime()} />);
    expect(screen.getByText('No ticket finished in the last hour.')).toBeDefined();
  });
});
