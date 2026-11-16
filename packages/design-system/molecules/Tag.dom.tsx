/**
 * The tag, in a happy-dom document. What matters: each tone sets `data-tone`, and the state tone shows only with the `state` tone, since the
 * other tones have colours of their own; dashed and chip set their attributes; a dot leads the text in the state tone's fill and its shape, and the
 * warning glyph leads it as an svg, both hidden from the accessibility tree so the tag reads as its text alone; each glyph draws its own
 * path; a busy tag shows a turning ring in the glyph's place; a change sets `data-change` and `pops` sets `data-pops`; `href` makes a
 * link, `onPress` a button that calls it, and neither a span; a glyph and busy, a dot without a state tone, the `state` tone without
 * one, and `href` with `onPress` do not compile; and the text is text, never markup.
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
  test('each tone sets data-tone, and the state tone shows only with the `state` tone', () => {
    const { container } = render(
      <>
        <Tag text="Idle" tone="state" stateTone="success" />
        <Tag text="Asks E7" tone="warn" stateTone="success" />
        <Tag text="Failed" tone="error" />
        <Tag text="Not counted" tone="neutral" dashed />
      </>,
    );
    const tagParts = [...container.querySelectorAll('.design-system-tag')]
      .map((tag) => [tag.textContent, tag.getAttribute('data-tone'), tag.getAttribute('data-state-tone'), tag.hasAttribute('data-dashed')]);
    expect(tagParts).toEqual([
      ['Idle', 'state', 'success', false],
      ['Asks E7', 'warn', null, false],
      ['Failed', 'error', null, false],
      ['Not counted', 'neutral', null, true],
    ]);
  });

  test('chip sets data-chip on a link, and a pill sets none', () => {
    render(
      <>
        <Tag text="#14" tone="neutral" href="#items/14" chip />
        <Tag text="#15" tone="neutral" href="#items/15" />
      </>,
    );
    expect(['#14', '#15'].map((name) => screen.getByRole('link', { name }).hasAttribute('data-chip'))).toEqual([true, false]);
  });

  test('a dot leads the text in the state tone and shape given, hidden from the accessibility tree', () => {
    const { container } = render(<Tag text="Busy" tone="state" stateTone="accent" dot dotShape="ring" />);
    const dot = container.querySelector('.design-system-tag')?.firstElementChild;
    expect([dot?.className, dot?.getAttribute('data-state-tone'), dot?.getAttribute('data-shape'), dot?.getAttribute('aria-hidden'), container.textContent])
      .toEqual(['design-system-state-dot', 'accent', 'ring', 'true', 'Busy']);
  });

  test('the warning glyph leads the text, hidden from the accessibility tree, so the link is named by its text alone', () => {
    render(<Tag text="4 in progress with no owner" tone="warn" glyph="warning" href="#agents" />);
    const link = screen.getByRole('link', { name: '4 in progress with no owner' });
    const glyph = link.firstElementChild;
    expect([glyph?.tagName.toLowerCase(), glyph?.getAttribute('class'), glyph?.getAttribute('aria-hidden'), glyph?.querySelector('path') === null])
      .toEqual(['svg', 'design-system-tag-glyph', 'true', false]);
  });

  test('each glyph draws its own path, hidden, and the profile chip is a button named by its time', () => {
    const glyphs = ['warning', 'stopwatch', 'check', 'plus'] as const;
    const { container } = render(<>{glyphs.map((glyph) => <Tag key={glyph} text={glyph} tone="neutral" glyph={glyph} />)}</>);
    const paths = [...container.querySelectorAll('.design-system-tag-glyph path')].map((path) => path.getAttribute('d'));
    expect([paths.length, new Set(paths).size]).toEqual([glyphs.length, glyphs.length]);
    cleanup();
    const presses: string[] = [];
    render(<Tag text="62 s" tone="state" stateTone="success" glyph="stopwatch" onPress={() => presses.push('profile')} />);
    fireEvent.click(screen.getByRole('button', { name: '62 s' }));
    expect(presses).toEqual(['profile']);
  });

  test('a busy tag shows a turning ring, hidden, where a glyph would lead', () => {
    const { container } = render(<Tag text="Measuring" tone="neutral" busy />);
    const tag = container.querySelector('.design-system-tag');
    expect([
      tag?.hasAttribute('data-busy'),
      tag?.firstElementChild?.className,
      tag?.firstElementChild?.getAttribute('aria-hidden'),
      container.querySelector('.design-system-tag-glyph'),
      tag?.textContent,
    ]).toEqual([true, 'design-system-tag-spinner', 'true', null, 'Measuring']);
  });

  test('a change sets data-change, pops sets data-pops, and neither shows without its prop', () => {
    const { container } = render(
      <>
        <Tag text="tests" tone="neutral" change="changed" />
        <Tag text="e2e" tone="neutral" change="new" pops />
        <Tag text="lint" tone="neutral" change="removed" />
        <Tag text="typecheck" tone="neutral" />
      </>,
    );
    const tagParts = [...container.querySelectorAll('.design-system-tag')]
      .map((tag) => [tag.textContent, tag.getAttribute('data-change'), tag.hasAttribute('data-pops'), tag.hasAttribute('data-busy')]);
    expect(tagParts).toEqual([
      ['tests', 'changed', false, false],
      ['e2e', 'new', true, false],
      ['lint', 'removed', false, false],
      ['typecheck', null, false, false],
    ]);
  });

  test('a tag with neither glyph nor dot leads with its text', () => {
    const { container } = render(<Tag text="Queued" tone="neutral" />);
    expect([container.querySelector('.design-system-tag')?.children.length, container.querySelector('svg')]).toEqual([0, null]);
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
    expect([...container.querySelectorAll('.design-system-tag')].map((tag) => tag.tagName.toLowerCase())).toEqual(['a', 'button', 'span']);
  });

  test('a glyph and busy do not compile together, nor a dot or the state tone without a state tone, nor a link that is also a button', () => {
    // @ts-expect-error a busy tag's ring takes the glyph's place
    const glyphAndBusy = <Tag text="Measuring" tone="neutral" glyph="stopwatch" busy />;
    // @ts-expect-error a dot takes the fill of a state tone
    const dotWithoutStateTone = <Tag text="Busy" tone="neutral" dot />;
    // @ts-expect-error a state tag takes the colours of a state tone
    const stateWithoutStateTone = <Tag text="Idle" tone="state" />;
    // @ts-expect-error a tag is a link or a button, never both
    const linkAndButton = <Tag text="Asks E7" tone="warn" href="#questions/E7" onPress={() => undefined} />;
    expect([glyphAndBusy, dotWithoutStateTone, stateWithoutStateTone, linkAndButton]).toHaveLength(4);
  });

  test('the text is text, never markup', () => {
    const { container } = render(<Tag text="<b>planted</b>" tone="neutral" />);
    expect([container.querySelector('b'), container.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
