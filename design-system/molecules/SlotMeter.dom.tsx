/**
 * The slot meter, in a happy-dom document. What matters: it draws one cell per slot, filled first, with the cells past the limit marked
 * over; it is an image named by its label; and a label is text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { SlotMeter } from './SlotMeter.tsx';

afterEach(() => {
  cleanup();
});

describe('the slot meter', () => {
  const cellsOf = (meter: HTMLElement): (string | undefined)[] => [...meter.querySelectorAll<HTMLElement>('.design-system-slot-meter-cell')].map((cell) => cell.dataset['cell']);

  test('one cell per slot of the limit, the filled ones first, an image named by its label in the tone given', () => {
    render(<SlotMeter label="3 running tasks against a limit of 5" filled={3} limit={5} tone="accent" />);
    const meter = screen.getByRole('img', { name: '3 running tasks against a limit of 5' });
    expect([meter.className, meter.dataset['stateTone']]).toEqual(['design-system-slot-meter', 'accent']);
    expect(cellsOf(meter)).toEqual(['filled', 'filled', 'filled', 'empty', 'empty']);
  });

  test('the jobs past the limit add cells marked over', () => {
    render(<SlotMeter label="4 running tasks against a limit of 2" filled={4} limit={2} tone="accent" />);
    expect(cellsOf(screen.getByRole('img', { name: '4 running tasks against a limit of 2' }))).toEqual(['filled', 'filled', 'over', 'over']);
  });

  test('a label is text, never markup', () => {
    render(<SlotMeter label="<b>planted</b>" filled={1} limit={1} tone="neutral" />);
    expect(screen.getByRole('img', { name: '<b>planted</b>' }).querySelector('b')).toBeNull();
  });
});
