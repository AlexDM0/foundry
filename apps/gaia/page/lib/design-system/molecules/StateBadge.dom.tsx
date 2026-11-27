/**
 * The state badge: the tone sets `data-state-tone`, picking its colour row in `tokens.css`; the quiet palette, each shape flag, compact, fitted
 * and shrinkable set their own attributes, the standard look none; it shows its label, never the tone, as text; and its dot and check are hidden
 * from the accessibility tree.
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

const SHAPE_ATTRIBUTES = ['data-dot-shape', 'data-dashed', 'data-struck', 'data-pulsing'] as const;

function renderedBadge(badge: ReactElement): HTMLElement {
  const { container } = render(badge);
  const element = container.querySelector<HTMLElement>('.design-system-state-badge');
  if (element === null) throw new Error('no badge');
  return element;
}

afterEach(() => {
  cleanup();
});

describe('the state badge', () => {
  test('the tone sets data-state-tone, the label shows the word, never the tone, and the standard look sets no flag', () => {
    const badge = renderedBadge(<StateBadge tone="info-outline" label="Waiting" />);
    expect([badge.getAttribute('data-state-tone'), badge.textContent, badge.hasAttribute('data-palette')]).toEqual(['info-outline', 'Waiting', false]);
    expect(SHAPE_ATTRIBUTES.filter((attribute) => badge.hasAttribute(attribute))).toEqual([]);
  });

  test('the quiet palette sets data-palette', () => {
    expect(renderedBadge(<StateBadge tone="ink" label="Done" palette="quiet" />).getAttribute('data-palette')).toBe('quiet');
  });

  test('each shape flag sets its own attribute', () => {
    const badge = renderedBadge(<StateBadge tone="neutral" label="Waiting" dotShape="dashed-ring" dashed struck pulsing />);
    expect(SHAPE_ATTRIBUTES.map((attribute) => badge.getAttribute(attribute))).toEqual(['dashed-ring', '', '', '']);
  });

  test('a diamond dot sets data-dot-shape', () => {
    expect(renderedBadge(<StateBadge tone="accent" label="Thinking" dotShape="diamond" />).getAttribute('data-dot-shape')).toBe('diamond');
  });

  test('compact sets data-size, and the standard size sets none', () => {
    expect(renderedBadge(<StateBadge tone="neutral" label="To do" size="compact" />).getAttribute('data-size')).toBe('compact');
    cleanup();
    expect(renderedBadge(<StateBadge tone="neutral" label="To do" />).hasAttribute('data-size')).toBe(false);
  });

  test('fitted and shrinkable each set their own attribute, and a badge with neither sets none', () => {
    const flagged = renderedBadge(<StateBadge tone="neutral" label="To do" fitted shrinkable />);
    expect([flagged.hasAttribute('data-fitted'), flagged.hasAttribute('data-shrinkable')]).toEqual([true, true]);
    cleanup();
    const plain = renderedBadge(<StateBadge tone="neutral" label="To do" />);
    expect([plain.hasAttribute('data-fitted'), plain.hasAttribute('data-shrinkable')]).toEqual([false, false]);
  });

  test('a label is text, never markup', () => {
    const badge = renderedBadge(<StateBadge tone="neutral" label="<b>planted</b>" title="Example title" />);
    expect([badge.querySelector('b'), badge.textContent, badge.title]).toEqual([null, '<b>planted</b>', 'Example title']);
  });

  test('the dot leads the label, hidden, and only a checked badge ends in a hidden check, whatever its tone', () => {
    const checked = renderedBadge(<StateBadge tone="success" label="Done" checked />);
    const check = checked.lastElementChild?.querySelector('svg');
    expect([checked.firstElementChild?.getAttribute('aria-hidden'), check?.getAttribute('data-icon'), check?.getAttribute('aria-hidden')])
      .toEqual(['true', 'check', 'true']);
    cleanup();
    expect(renderedBadge(<StateBadge tone="ink" label="Done" />).querySelector('svg')).toBeNull();
  });
});
