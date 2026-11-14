/**
 * The keyed line list, in a happy-dom document. What matters: it is a list named by its label, its key column set as an attribute; one
 * line per entry, in the order given, even when two lines share a key, such as two calls of one tool; each line's key leads it with its
 * full form as its title; the marks `current` and `alert` set `data-mark`, and an unmarked line has none; and the key and the label are
 * text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { KeyedLineList } from './KeyedLineList.tsx';

afterEach(() => {
  cleanup();
});

const linePartsOf = (list: HTMLElement): (string | null)[][] => [...list.querySelectorAll('.design-system-keyed-line')].map((line) => [
  line.querySelector('.design-system-keyed-line-key')?.textContent ?? null,
  line.querySelector('.design-system-keyed-line-key')?.getAttribute('title') ?? null,
  line.querySelector('.design-system-keyed-line-text')?.textContent ?? null,
  line.getAttribute('data-mark'),
]);

describe('the keyed line list', () => {
  test('a list named by its label, one line per entry in order, each led by its key with its full form as the title', () => {
    render(
      <KeyedLineList
        label="Activity of #004"
        keyColumn="stamp"
        lines={[
          { key: '22:40', keyTitle: '2026-11-10 22:40', text: 'J4 started on #004 Account pages dark mode' },
          { key: '22:42', keyTitle: '2026-11-10 22:42', text: 'Gate retry opened I4' },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Activity of #004' });
    expect([list.tagName, list.getAttribute('data-key-column')]).toEqual(['OL', 'stamp']);
    expect(linePartsOf(list)).toEqual([
      ['22:40', '2026-11-10 22:40', 'J4 started on #004 Account pages dark mode', null],
      ['22:42', '2026-11-10 22:42', 'Gate retry opened I4', null],
    ]);
  });

  test('two lines with one key are both shown, and the marks current and alert set data-mark', () => {
    render(
      <KeyedLineList
        label="What J4 did before it asked"
        keyColumn="tool"
        lines={[
          { key: 'Read', text: 'src/ExampleStorefront.ts' },
          { key: 'Read', text: 'src/ExampleCheckout.ts', mark: 'alert' },
          { key: 'AskUserQuestion', text: 'Which theme token?', mark: 'current' },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'What J4 did before it asked' });
    expect(list.getAttribute('data-key-column')).toBe('tool');
    expect(linePartsOf(list)).toEqual([
      ['Read', null, 'src/ExampleStorefront.ts', null],
      ['Read', null, 'src/ExampleCheckout.ts', 'alert'],
      ['AskUserQuestion', null, 'Which theme token?', 'current'],
    ]);
  });

  test('the key and the label are text, never markup', () => {
    render(<KeyedLineList label="<b>planted</b>" keyColumn="tool" lines={[{ key: '<i>planted</i>', text: 'x' }]} />);
    const list = screen.getByRole('list', { name: '<b>planted</b>' });
    expect([list.querySelector('b'), list.querySelector('i'), list.querySelector('.design-system-keyed-line-key')?.textContent]).toEqual([null, null, '<i>planted</i>']);
  });
});
