/**
 * The meters, in a happy-dom document. What matters: the segment meter draws one part per segment, in the order given, each grown by its
 * count, coloured by its state and titled with its label and count; the fill meter's bar is as wide as the share used, near and unbounded
 * set their attributes, and an unbounded track holds no bar; the slot meter draws one cell per slot, filled first, with the cells past the
 * limit marked over; each meter is an image named by its label; and a label is text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FillMeter, SegmentMeter, SlotMeter } from './Meter.tsx';

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

describe('the fill meter', () => {
  test('its bar is as wide as the share of the limit used, in the state given, and it is an image named by its label', () => {
    render(<FillMeter label="41 of 150 calls" used={41} limit={150} near={false} state="in-progress" />);
    const meter = screen.getByRole('img', { name: '41 of 150 calls' });
    const bar = meter.querySelector<HTMLElement>('.bridge-fill-meter-bar');
    expect([meter.className, meter.dataset['state'], meter.hasAttribute('data-near'), meter.hasAttribute('data-unbounded')])
      .toEqual(['bridge-fill-meter', 'in-progress', false, false]);
    expect(Number.parseFloat(bar?.style.width ?? '')).toBeCloseTo(27.33, 1);
  });

  test('near sets its attribute, and a bar past the limit stops at the full width', () => {
    render(<FillMeter label="160 of 150 calls" used={160} limit={150} near state="in-progress" />);
    const meter = screen.getByRole('img', { name: '160 of 150 calls' });
    expect([meter.hasAttribute('data-near'), meter.querySelector<HTMLElement>('.bridge-fill-meter-bar')?.style.width]).toEqual([true, '100%']);
  });

  test('with no limit the track is striped and holds no bar', () => {
    render(<FillMeter label="22 calls, no budget" used={22} limit={null} near={false} state="in-progress" />);
    const meter = screen.getByRole('img', { name: '22 calls, no budget' });
    expect([meter.hasAttribute('data-unbounded'), meter.querySelector('.bridge-fill-meter-bar')]).toEqual([true, null]);
  });
});

describe('the slot meter', () => {
  const cellsOf = (meter: HTMLElement): (string | undefined)[] => [...meter.querySelectorAll<HTMLElement>('.bridge-slot-meter-cell')].map((cell) => cell.dataset['cell']);

  test('one cell per slot of the limit, the filled ones first, an image named by its label in the state given', () => {
    render(<SlotMeter label="3 worker jobs against a limit of 5" filled={3} limit={5} state="in-progress" />);
    const meter = screen.getByRole('img', { name: '3 worker jobs against a limit of 5' });
    expect([meter.className, meter.dataset['state']]).toEqual(['bridge-slot-meter', 'in-progress']);
    expect(cellsOf(meter)).toEqual(['filled', 'filled', 'filled', 'empty', 'empty']);
  });

  test('the jobs past the limit add cells marked over', () => {
    render(<SlotMeter label="4 worker jobs against a limit of 2" filled={4} limit={2} state="in-progress" />);
    expect(cellsOf(screen.getByRole('img', { name: '4 worker jobs against a limit of 2' }))).toEqual(['filled', 'filled', 'over', 'over']);
  });

  test('a label is text, never markup', () => {
    render(
      <>
        <SlotMeter label="<b>planted</b>" filled={1} limit={1} state="pending" />
        <FillMeter label="<i>planted</i>" used={1} limit={2} near={false} state="pending" />
      </>,
    );
    expect([
      screen.getByRole('img', { name: '<b>planted</b>' }).querySelector('b'),
      screen.getByRole('img', { name: '<i>planted</i>' }).querySelector('i'),
    ]).toEqual([null, null]);
  });
});
