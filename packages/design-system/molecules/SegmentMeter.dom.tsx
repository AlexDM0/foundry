/**
 * The segment meter, in a happy-dom document. What matters: it draws one part per segment, in the order given, each grown by its count,
 * coloured by its tone and titled with its label and count; it is an image named by its label; and a label is text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { SegmentMeter } from './SegmentMeter.tsx';

afterEach(() => {
  cleanup();
});

describe('the segment meter', () => {
  test('one part per segment, in order, each grown by its count, coloured by its tone and titled', () => {
    render(
      <SegmentMeter
        label="Example Storefront: 2 of 5 done"
        segments={[
          { tone: 'ink', count: 2, label: 'Done' },
          { tone: 'accent', count: 1, label: 'In progress' },
          { tone: 'neutral', count: 2, label: 'To do' },
        ]}
      />,
    );
    const meter = screen.getByRole('img', { name: 'Example Storefront: 2 of 5 done' });
    expect(meter.className).toBe('design-system-segment-meter');
    expect([...meter.querySelectorAll<HTMLElement>('.design-system-segment-meter-part')].map((part) => [part.dataset['stateTone'], part.style.flexGrow, part.title])).toEqual([
      ['ink', '2', 'Done: 2'],
      ['accent', '1', 'In progress: 1'],
      ['neutral', '2', 'To do: 2'],
    ]);
  });

  test('a label is text, never markup', () => {
    render(<SegmentMeter label="<b>planted</b>" segments={[{ tone: 'neutral', count: 1, label: '<b>planted</b>' }]} />);
    const meter = screen.getByRole('img', { name: '<b>planted</b>' });
    expect([meter.querySelector('b'), meter.querySelector('.design-system-segment-meter-part')?.getAttribute('title')]).toEqual([null, '<b>planted</b>: 1']);
  });
});
