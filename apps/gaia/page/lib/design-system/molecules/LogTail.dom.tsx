/**
 * The log tail; happy-dom lays nothing out, so a spec sets the scroll and client heights and reads the scroll position after `rerender`. The
 * lines read as given in a named list that is no live region; while live it follows new lines to the bottom, stops following once the reader
 * scrolls up until they return, and a tail that is not live never scrolls.
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
    expect([list.getAttribute('class'), list.hasAttribute('aria-live'), list.getAttribute('tabindex')]).toEqual(['design-system-log-tail', false, '0']);
    expect([...list.querySelectorAll('.design-system-log-tail-line')].map((line) => [line.textContent, line.getAttribute('data-kind')])).toEqual([
      ['bun install --frozen-lockfile', 'command'],
      ['installed 412 packages', 'output'],
    ]);
  });

  test('while live it follows new lines to the bottom', () => {
    const { rerender } = render(<LogTail label="Profile output" lines={FIRST_LINES} live />);
    const list = screen.getByRole('list');
    laidOut(list, GROWN_SCROLL_HEIGHT);
    rerender(<LogTail label="Profile output" lines={GROWN_LINES} live />);
    expect(list.scrollTop).toBe(GROWN_SCROLL_HEIGHT);
  });

  test('once the reader scrolled up it stays there, and follows again from the bottom', () => {
    const { rerender } = render(<LogTail label="Profile output" lines={FIRST_LINES} live />);
    const list = screen.getByRole('list');
    laidOut(list, FIRST_SCROLL_HEIGHT);
    list.scrollTop = SCROLLED_UP_POSITION;
    fireEvent.scroll(list);
    laidOut(list, GROWN_SCROLL_HEIGHT);
    rerender(<LogTail label="Profile output" lines={GROWN_LINES} live />);
    expect(list.querySelectorAll('.design-system-log-tail-line').length).toBe(GROWN_LINES.length);
    expect(list.scrollTop).toBe(SCROLLED_UP_POSITION);

    list.scrollTop = GROWN_SCROLL_HEIGHT - CLIENT_HEIGHT;
    fireEvent.scroll(list);
    laidOut(list, GROWN_SCROLL_HEIGHT + CLIENT_HEIGHT);
    rerender(<LogTail label="Profile output" lines={[...GROWN_LINES, { key: '4', text: 'tsc --noEmit', kind: 'output' }]} live />);
    expect(list.scrollTop).toBe(GROWN_SCROLL_HEIGHT + CLIENT_HEIGHT);
  });

  test('a tail that is not live never scrolls', () => {
    const { rerender } = render(<LogTail label="Profile output" lines={FIRST_LINES} live={false} />);
    const list = screen.getByRole('list');
    laidOut(list, GROWN_SCROLL_HEIGHT);
    rerender(<LogTail label="Profile output" lines={GROWN_LINES} live={false} />);
    expect(list.querySelectorAll('.design-system-log-tail-line').length).toBe(GROWN_LINES.length);
    expect(list.scrollTop).toBe(0);
  });
});
