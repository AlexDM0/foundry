/**
 * The segment meter, in a happy-dom document. What matters: one part per segment, in the order given, each grown by its count, coloured by
 * its state and titled with its label and count; the bar is an image named by its label; and a label is text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { SegmentMeter } from './Meter.tsx';

afterEach(() => {
  cleanup();
});

describe('the segment meter', () => {
  test('one part per segment, in order, each grown by its count, coloured by its state and titled', () => {
    render(
      <SegmentMeter
        label="Example Storefront: 2 of 5 done"
        segments={[
          { state: 'delivered', count: 2, label: 'Done' },
          { state: 'in-progress', count: 1, label: 'In progress' },
          { state: 'pending', count: 2, label: 'To do' },
        ]}
      />,
    );
    const meter = screen.getByRole('img', { name: 'Example Storefront: 2 of 5 done' });
    expect(meter.className).toBe('bridge-segment-meter');
    expect([...meter.querySelectorAll<HTMLElement>('.bridge-segment-meter-part')].map((part) => [part.dataset['state'], part.style.flexGrow, part.title])).toEqual([
      ['delivered', '2', 'Done: 2'],
      ['in-progress', '1', 'In progress: 1'],
      ['pending', '2', 'To do: 2'],
    ]);
  });

  test('a label is text, never markup', () => {
    render(<SegmentMeter label="<b>planted</b>" segments={[{ state: 'pending', count: 1, label: '<b>planted</b>' }]} />);
    const meter = screen.getByRole('img', { name: '<b>planted</b>' });
    expect([meter.querySelector('b'), meter.querySelector('.bridge-segment-meter-part')?.getAttribute('title')]).toEqual([null, '<b>planted</b>: 1']);
  });
});
