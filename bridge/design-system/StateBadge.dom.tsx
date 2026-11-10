/**
 * The state badge, in a happy-dom document. What matters: the state sets `data-state`, which picks its row of colours in `tokens.css`; the
 * ticket-status palette sets `data-palette`; `ready` sets `data-ready` in place of a state; compact sets `data-size`; and the badge shows
 * its label, never the internal value, as text.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { ReactElement } from 'react';

import { StateBadge } from './StateBadge.tsx';

function renderedBadge(badge: ReactElement): HTMLElement {
  const { container } = render(badge);
  const element = container.querySelector<HTMLElement>('.bridge-state-badge');
  if (element === null) throw new Error('no badge');
  return element;
}

afterEach(() => {
  cleanup();
});

describe('the state badge', () => {
  test('the state sets data-state and the label shows the word, never the value', () => {
    const badge = renderedBadge(<StateBadge state="in-review" label="Reviewing" />);
    expect([badge.getAttribute('data-state'), badge.textContent, badge.hasAttribute('data-palette')]).toEqual(['in-review', 'Reviewing', false]);
  });

  test('the ticket-status palette sets data-palette', () => {
    expect(renderedBadge(<StateBadge state="delivered" label="delivered" palette="ticket-status" />).getAttribute('data-palette')).toBe('ticket-status');
  });

  test('ready sets data-ready and no data-state', () => {
    const badge = renderedBadge(<StateBadge state="ready" label="Ready" />);
    expect([badge.hasAttribute('data-ready'), badge.hasAttribute('data-state')]).toEqual([true, false]);
  });

  test('compact sets data-size, and the standard size sets none', () => {
    expect(renderedBadge(<StateBadge state="pending" label="To do" size="compact" />).getAttribute('data-size')).toBe('compact');
    cleanup();
    expect(renderedBadge(<StateBadge state="pending" label="To do" />).hasAttribute('data-size')).toBe(false);
  });

  test('a label is text, never markup', () => {
    const badge = renderedBadge(<StateBadge state="pending" label="<b>planted</b>" title="Example title" />);
    expect([badge.querySelector('b'), badge.textContent, badge.title]).toEqual([null, '<b>planted</b>', 'Example title']);
  });
});
