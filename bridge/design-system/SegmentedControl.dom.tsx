/**
 * The segmented control, in a happy-dom document. What matters: the selected segment alone is pressed, and none while no segment is the
 * choice; a click hands its value on; a count shows in its own mark after the label; an accessible name names its button; each button is
 * handed to `optionRef`; the group is named by its label element; and a label is text, never markup.
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

import { SegmentedControl, type SegmentOption } from './SegmentedControl.tsx';

type ExampleSpan = 'hour' | 'day' | 'all';

const OPTIONS: readonly SegmentOption<ExampleSpan>[] = [
  {
    value: 'hour', label: '1h', count: 2, accessibleName: 'Last hour, 2 tickets'
  },
  { value: 'day', label: '1d', count: 5 },
  { value: 'all', label: '<b>planted</b>' },
];

function renderedControl(selected: ExampleSpan | null, onSelect: (value: ExampleSpan) => void = () => undefined): HTMLElement {
  render(
    <>
      <span id="example-span-label">Finished work</span>
      <SegmentedControl labelledBy="example-span-label" options={OPTIONS} selected={selected} onSelect={onSelect} />
    </>,
  );
  return screen.getByRole('group', { name: 'Finished work' });
}

function pressedStates(group: HTMLElement): (string | null)[] {
  return [...group.querySelectorAll('button')].map((button) => button.getAttribute('aria-pressed'));
}

afterEach(() => {
  cleanup();
});

describe('the segmented control', () => {
  test('the selected segment alone is pressed, and none while no segment is the choice', () => {
    expect(pressedStates(renderedControl('day'))).toEqual(['false', 'true', 'false']);
    cleanup();
    expect(pressedStates(renderedControl(null))).toEqual(['false', 'false', 'false']);
  });

  test('a click hands the segment\'s value on', () => {
    const chosen: ExampleSpan[] = [];
    const group = renderedControl('day', (value) => chosen.push(value));
    [...group.querySelectorAll('button')].forEach((button) => fireEvent.click(button));
    expect(chosen).toEqual(['hour', 'day', 'all']);
  });

  test('a count shows in its own mark after the label, and an accessible name names the button', () => {
    const group = renderedControl('day');
    expect([...group.querySelectorAll('button')].map((button) => button.querySelector('.bridge-segment-count')?.textContent ?? null)).toEqual(['2', '5', null]);
    expect(screen.getByRole('button', { name: 'Last hour, 2 tickets' }).textContent).toBe('1h 2');
  });

  test('each button is handed to optionRef with its value', () => {
    const handed: [ExampleSpan, string][] = [];
    render(
      <SegmentedControl
        labelledBy="example-span-label"
        options={OPTIONS}
        selected="day"
        onSelect={() => undefined}
        optionRef={(value, element) => {
          if (element !== null) handed.push([value, element.tagName]);
        }}
      />,
    );
    expect(handed).toEqual([['hour', 'BUTTON'], ['day', 'BUTTON'], ['all', 'BUTTON']]);
  });

  test('a label is text, never markup', () => {
    const group = renderedControl(null);
    expect([group.querySelector('b'), group.querySelectorAll('button')[2]?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
