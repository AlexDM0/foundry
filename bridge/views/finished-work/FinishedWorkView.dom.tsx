/**
 * The finished-work list in a happy-dom document. What matters: it shows what the choice lets through, latest closed first, each ticket
 * opening its row's detail in place over Progress and marked while open, an abandoned one marked so, and says so when the window holds
 * nothing.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FIXTURE_NOW, FIXTURE_TICKETS } from '../../testing/BoardStateFixture.ts';
import { routedOnTab }                  from '../../testing/DetailRoutingFixture.ts';
import { FinishedWorkView }             from './FinishedWorkView.tsx';

function shownTicketIds(): (string | null)[] {
  return [...document.querySelectorAll('.bridge-finished-list .bridge-ticket-id')].map((mark) => mark.textContent);
}

function linkOf(ticketId: string): HTMLAnchorElement | null {
  const line = [...document.querySelectorAll('.bridge-finished-ticket')].find((candidate) => candidate.querySelector('.bridge-ticket-id')?.textContent === `#${ticketId}`);
  return line?.querySelector('a') ?? null;
}

afterEach(() => {
  cleanup();
});

describe('the finished-work list', () => {
  test('all shows every closed ticket latest first, each opening its row over Progress', () => {
    render(routedOnTab('progress', <FinishedWorkView tickets={FIXTURE_TICKETS} choice="all" nowEpochMilliseconds={FIXTURE_NOW.getTime()} />).element);
    expect(shownTicketIds()).toEqual(['#2', '#5', '#1']);
    expect(linkOf('2')?.getAttribute('href')).toBe('#progress/ticket-row/2');
  });

  test('marks the open ticket, whose link then closes it, and badges each line with its state', () => {
    render(routedOnTab(
      'progress',
      <FinishedWorkView tickets={FIXTURE_TICKETS} choice="all" nowEpochMilliseconds={FIXTURE_NOW.getTime()} />,
      { form: 'ticket-row', ticketId: '2' },
    ).element);
    const openLine = linkOf('2')?.closest('li');

    expect(openLine?.hasAttribute('data-selected')).toBe(true);
    expect(linkOf('2')?.getAttribute('href')).toBe('#progress');
    expect([...document.querySelectorAll('.bridge-finished-ticket .bridge-state-badge')].map((badge) => badge.getAttribute('data-state')))
      .toEqual(['delivered', 'abandoned', 'delivered']);
  });

  test('a window holding nothing says so in the window\'s words', () => {
    render(routedOnTab('progress', <FinishedWorkView tickets={FIXTURE_TICKETS} choice="1h" nowEpochMilliseconds={FIXTURE_NOW.getTime()} />).element);
    expect(screen.getByText('No ticket finished in the last hour.')).toBeDefined();
  });
});
