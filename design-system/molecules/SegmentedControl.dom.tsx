/**
 * The segmented control, in a happy-dom document. What matters: the selected segment alone is pressed, and none while no segment is the
 * choice; a click hands its value on; a count shows in its own mark after the label; an accessible name names its button; each button is
 * handed to `optionRef`; the group is named by its label element; a size sets `data-size`; `mono` sets `data-mono`; `separated` sets
 * `data-separated`; `fill` sets `data-fill` and hands the segment count to the stylesheet's equal columns as `--segment-count`; and a label
 * is text, never markup.
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
    value: 'hour', label: '1h', count: 2, accessibleName: 'Last hour, 2 items'
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
    expect([...group.querySelectorAll('button')].map((button) => button.querySelector('.design-system-segment-count')?.textContent ?? null)).toEqual(['2', '5', null]);
    expect(screen.getByRole('button', { name: 'Last hour, 2 items' }).textContent).toBe('1h 2');
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

  test('mono sets data-mono on the group, and a plain group sets none', () => {
    const { container } = render(
      <>
        <SegmentedControl labelledBy="mono-label" options={OPTIONS} selected={null} onSelect={() => undefined} mono />
        <SegmentedControl labelledBy="plain-label" options={OPTIONS} selected={null} onSelect={() => undefined} />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-segments')].map((group) => group.hasAttribute('data-mono'))).toEqual([true, false]);
  });

  test('separated sets data-separated on the group, and a plain group sets none', () => {
    const { container } = render(
      <>
        <SegmentedControl labelledBy="separated-label" options={OPTIONS} selected={null} onSelect={() => undefined} separated />
        <SegmentedControl labelledBy="plain-label" options={OPTIONS} selected={null} onSelect={() => undefined} />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-segments')].map((group) => group.hasAttribute('data-separated'))).toEqual([true, false]);
  });

  test('a size sets data-size on the group, and no size sets none', () => {
    const { container } = render(
      <>
        <SegmentedControl labelledBy="standard-label" options={OPTIONS} selected={null} onSelect={() => undefined} size="standard" />
        <SegmentedControl labelledBy="compact-label" options={OPTIONS} selected={null} onSelect={() => undefined} size="compact" />
        <SegmentedControl labelledBy="plain-label" options={OPTIONS} selected={null} onSelect={() => undefined} />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-segments')].map((group) => group.getAttribute('data-size'))).toEqual(['standard', 'compact', null]);
  });

  test('fill lays the four models and the five efforts each in as many equal columns, and a plain group sets neither', () => {
    const optionsOf = (values: readonly string[]): SegmentOption<string>[] => values.map((value) => ({ value, label: value }));
    const { container } = render(
      <>
        <SegmentedControl labelledBy="model-label" options={optionsOf(['opus', 'sonnet', 'haiku', 'fable'])} selected="opus" onSelect={() => undefined} fill />
        <SegmentedControl
          labelledBy="effort-label"
          options={optionsOf(['low', 'medium', 'high', 'xhigh', 'max'])}
          selected="medium"
          onSelect={() => undefined}
          fill
        />
        <SegmentedControl labelledBy="plain-label" options={OPTIONS} selected={null} onSelect={() => undefined} />
      </>,
    );
    const groups = [...container.querySelectorAll<HTMLElement>('.design-system-segments')];
    expect(groups.map((group) => [group.hasAttribute('data-fill'), group.style.getPropertyValue('--segment-count'), group.querySelectorAll('button').length]))
      .toEqual([[true, '4', 4], [true, '5', 5], [false, '', 3]]);
  });

  test('a label is text, never markup', () => {
    const group = renderedControl(null);
    expect([group.querySelector('b'), group.querySelectorAll('button')[2]?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
