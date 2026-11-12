/**
 * The log tail, in a happy-dom document, which lays nothing out: a spec gives the list its scroll and client heights, and waits on the
 * scroll position through `src/testing/WaitUntil.ts`. What matters: the lines read as given with their kind, in a named list that is not a
 * live region; while live it follows new lines to the bottom; once the reader scrolled up it stays where the reader is, and follows again
 * from the bottom; and a tail that is not live never scrolls.
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

import { waitUntil } from '../../src/testing/WaitUntil.ts';

import { LogTail, type LogTailLine } from './LogTail.tsx';

const CLIENT_HEIGHT = 100;
const FIRST_SCROLL_HEIGHT = 200;
const GROWN_SCROLL_HEIGHT = 300;
const SCROLLED_UP_POSITION = 40;

const FIRST_LINES: readonly LogTailLine[] = [
  { key: '1', text: 'bun install --frozen-lockfile', kind: 'command' },
  { key: '2', text: 'installed 412 packages', kind: 'output' },
];

const GROWN_LINES: readonly LogTailLine[] = [...FIRST_LINES, { key: '3', text: 'bun run typecheck', kind: 'command' }];

function laidOut(list: HTMLElement, scrollHeight: number): void {
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: CLIENT_HEIGHT });
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: scrollHeight });
}

afterEach(() => {
  cleanup();
});

describe('the log tail', () => {
  test('the lines read as given with their kind, in a named list that is not a live region', () => {
    render(<LogTail label="Profile output" lines={FIRST_LINES} live />);
    const list = screen.getByRole('list', { name: 'Profile output' });
    expect([list.getAttribute('class'), list.hasAttribute('aria-live'), list.getAttribute('tabindex')]).toEqual(['bridge-log-tail', false, '0']);
    expect([...list.querySelectorAll('.bridge-log-tail-line')].map((line) => [line.textContent, line.getAttribute('data-kind')])).toEqual([
      ['bun install --frozen-lockfile', 'command'],
      ['installed 412 packages', 'output'],
    ]);
  });

  test('while live it follows new lines to the bottom', async () => {
    const { rerender } = render(<LogTail label="Profile output" lines={FIRST_LINES} live />);
    const list = screen.getByRole('list');
    laidOut(list, GROWN_SCROLL_HEIGHT);
    rerender(<LogTail label="Profile output" lines={GROWN_LINES} live />);
    await waitUntil(() => list.scrollTop === GROWN_SCROLL_HEIGHT, 'the live tail scrolled to its new bottom');
  });

  test('once the reader scrolled up it stays there, and follows again from the bottom', async () => {
    const { rerender } = render(<LogTail label="Profile output" lines={FIRST_LINES} live />);
    const list = screen.getByRole('list');
    laidOut(list, FIRST_SCROLL_HEIGHT);
    list.scrollTop = SCROLLED_UP_POSITION;
    fireEvent.scroll(list);
    laidOut(list, GROWN_SCROLL_HEIGHT);
    rerender(<LogTail label="Profile output" lines={GROWN_LINES} live />);
    await waitUntil(() => list.querySelectorAll('.bridge-log-tail-line').length === GROWN_LINES.length, 'the new line shows');
    expect(list.scrollTop).toBe(SCROLLED_UP_POSITION);

    list.scrollTop = GROWN_SCROLL_HEIGHT - CLIENT_HEIGHT;
    fireEvent.scroll(list);
    laidOut(list, GROWN_SCROLL_HEIGHT + CLIENT_HEIGHT);
    rerender(<LogTail label="Profile output" lines={[...GROWN_LINES, { key: '4', text: 'tsc --noEmit', kind: 'output' }]} live />);
    await waitUntil(() => list.scrollTop === GROWN_SCROLL_HEIGHT + CLIENT_HEIGHT, 'the tail followed again from the bottom');
  });

  test('a tail that is not live never scrolls', async () => {
    const { rerender } = render(<LogTail label="Profile output" lines={FIRST_LINES} live={false} />);
    const list = screen.getByRole('list');
    laidOut(list, GROWN_SCROLL_HEIGHT);
    rerender(<LogTail label="Profile output" lines={GROWN_LINES} live={false} />);
    await waitUntil(() => list.querySelectorAll('.bridge-log-tail-line').length === GROWN_LINES.length, 'the new line shows');
    expect(list.scrollTop).toBe(0);
  });
});
