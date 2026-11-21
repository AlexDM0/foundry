/**
 * The fill meter, in a happy-dom document. What matters: its bar is as wide as the share used, near and unbounded set their attributes, an
 * unbounded track holds no bar; `borderless` sets its attribute, absent none; it is an image named by its label; and a label is text, never
 * markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FillMeter } from './FillMeter.tsx';

afterEach(() => {
  cleanup();
});

describe('the fill meter', () => {
  test('its bar is as wide as the share of the limit used, in the tone given, and it is an image named by its label', () => {
    render(<FillMeter label="41 of 150 calls" used={41} limit={150} near={false} tone="accent" />);
    const meter = screen.getByRole('img', { name: '41 of 150 calls' });
    const bar = meter.querySelector<HTMLElement>('.design-system-fill-meter-bar');
    expect([meter.className, meter.dataset['stateTone'], meter.hasAttribute('data-near'), meter.hasAttribute('data-unbounded')])
      .toEqual(['design-system-fill-meter', 'accent', false, false]);
    expect(Number.parseFloat(bar?.style.width ?? '')).toBeCloseTo(27.33, 1);
  });

  test('near sets its attribute, and a bar past the limit stops at the full width', () => {
    render(<FillMeter label="160 of 150 calls" used={160} limit={150} near tone="accent" />);
    const meter = screen.getByRole('img', { name: '160 of 150 calls' });
    expect([meter.hasAttribute('data-near'), meter.querySelector<HTMLElement>('.design-system-fill-meter-bar')?.style.width]).toEqual([true, '100%']);
  });

  test('with no limit the track is striped and holds no bar', () => {
    render(<FillMeter label="22 calls, no budget" used={22} limit={null} near={false} tone="accent" />);
    const meter = screen.getByRole('img', { name: '22 calls, no budget' });
    expect([meter.hasAttribute('data-unbounded'), meter.querySelector('.design-system-fill-meter-bar')]).toEqual([true, null]);
  });

  test('borderless sets its attribute, and a meter with its edge sets none', () => {
    const { container } = render(
      <>
        <FillMeter label="41 of 150 calls" used={41} limit={150} near={false} tone="accent" borderless />
        <FillMeter label="42 of 150 calls" used={42} limit={150} near={false} tone="accent" />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-fill-meter')].map((meter) => meter.hasAttribute('data-borderless'))).toEqual([true, false]);
  });

  test('a label is text, never markup', () => {
    render(<FillMeter label="<i>planted</i>" used={1} limit={2} near={false} tone="neutral" />);
    expect(screen.getByRole('img', { name: '<i>planted</i>' }).querySelector('i')).toBeNull();
  });
});
