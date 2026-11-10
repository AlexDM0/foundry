/**
 * The tag, in a happy-dom document. What matters: each tone sets `data-tone`, and the state shows only with the state tone, since the
 * other tones have colours of their own; dashed sets its attribute; a dot leads the text in the state's fill and the warning glyph leads it
 * as an svg, both hidden from the accessibility tree so the tag reads as its text alone; `href` makes a link, `onPress` a button that calls
 * it, and neither a span; and the text is text, never markup.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Tag } from './Tag.tsx';

afterEach(() => {
  cleanup();
});

describe('the tag', () => {
  test('each tone sets data-tone, and the state shows only with the state tone', () => {
    const { container } = render(
      <>
        <Tag text="Idle" tone="state" state="reviewed" />
        <Tag text="Asks E7" tone="warn" state="reviewed" />
        <Tag text="Failed" tone="error" />
        <Tag text="Not counted" tone="neutral" dashed />
      </>,
    );
    const tagParts = [...container.querySelectorAll('.bridge-tag')]
      .map((tag) => [tag.textContent, tag.getAttribute('data-tone'), tag.getAttribute('data-state'), tag.hasAttribute('data-dashed')]);
    expect(tagParts).toEqual([
      ['Idle', 'state', 'reviewed', false],
      ['Asks E7', 'warn', null, false],
      ['Failed', 'error', null, false],
      ['Not counted', 'neutral', null, true],
    ]);
  });

  test('a dot leads the text in the state given, hidden from the accessibility tree', () => {
    const { container } = render(<Tag text="Busy" tone="state" state="in-progress" dot />);
    const dot = container.querySelector('.bridge-tag')?.firstElementChild;
    expect([dot?.className, dot?.getAttribute('data-state'), dot?.getAttribute('aria-hidden'), container.textContent]).toEqual(['bridge-lane-dot', 'in-progress', 'true', 'Busy']);
  });

  test('the warning glyph leads the text, hidden from the accessibility tree, so the link is named by its text alone', () => {
    render(<Tag text="4 in progress with no Overseer job" tone="warn" glyph="warning" href="#agents" />);
    const link = screen.getByRole('link', { name: '4 in progress with no Overseer job' });
    const glyph = link.firstElementChild;
    expect([glyph?.tagName.toLowerCase(), glyph?.getAttribute('class'), glyph?.getAttribute('aria-hidden'), glyph?.querySelector('path') === null])
      .toEqual(['svg', 'bridge-tag-glyph', 'true', false]);
  });

  test('a tag with neither glyph nor dot leads with its text', () => {
    const { container } = render(<Tag text="Queued" tone="neutral" />);
    expect([container.querySelector('.bridge-tag')?.children.length, container.querySelector('svg')]).toEqual([0, null]);
  });

  test('href makes a link, onPress a button that calls it, and neither a span', () => {
    const presses: string[] = [];
    const { container } = render(
      <>
        <Tag text="Asks E7" tone="warn" href="#questions/E7" title="Open E7" />
        <Tag text="Asks E8" tone="warn" onPress={() => presses.push('E8')} />
        <Tag text="Not counted" tone="neutral" />
      </>,
    );
    const link = screen.getByRole('link', { name: 'Asks E7' });
    fireEvent.click(screen.getByRole('button', { name: 'Asks E8' }));
    expect([link.getAttribute('href'), link.getAttribute('title')]).toEqual(['#questions/E7', 'Open E7']);
    expect(presses).toEqual(['E8']);
    expect([...container.querySelectorAll('.bridge-tag')].map((tag) => tag.tagName.toLowerCase())).toEqual(['a', 'button', 'span']);
  });

  test('the text is text, never markup', () => {
    const { container } = render(<Tag text="<b>planted</b>" tone="neutral" />);
    expect([container.querySelector('b'), container.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
