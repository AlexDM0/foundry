/**
 * The segmented control, in a happy-dom document. What matters: the selected segment alone is pressed, and none while no segment is the choice; a click
 * hands its value on; a count shows in its own mark after the label, an accented one marked `data-accented`; an accessible name names its button; each
 * button is handed to `optionRef`; the group is named by its label element; a size sets `data-size`; `mono` sets `data-mono`; `separated` sets
 * `data-separated`; `fill` sets `data-fill` and hands the segment count to the stylesheet's equal columns as `--segment-count`; a disabled segment cannot
 * be clicked; a name of its own names the group where no label shows, and a group named both ways does not compile; a trailing part sits last in the tray
 * and sets `data-trailing`, its buttons no segments, and separated segments take none by type; a segment of a set height keeps its label on one line, and
 * a disabled one fades to the disabled ink every control shares; and a label is text, never markup.
 */
import { readFileSync } from 'node:fs';

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

import { Menu, MenuItem }                       from './Menu.tsx';
import { SegmentedControl, type SegmentOption } from './SegmentedControl.tsx';

type ExampleSpan = 'hour' | 'day' | 'all';

const STYLESHEETS_OF_THE_CONTROL = ['../styles/tokens.css', './SegmentedControl.css'];

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

  test('an accented count is marked data-accented, and a plain count is not', () => {
    render(
      <SegmentedControl
        accessibleName="Example items"
        options={[{
          value: 'hour', label: 'Waiting', count: 3, accentedCount: true
        }, { value: 'day', label: 'Done', count: 41 }]}
        selected="day"
        onSelect={() => undefined}
      />,
    );
    const counts = [...screen.getByRole('group', { name: 'Example items' }).querySelectorAll('.design-system-segment-count')];
    expect(counts.map((count) => [count.textContent, count.hasAttribute('data-accented')])).toEqual([['3', true], ['41', false]]);
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

  test('a disabled segment shows but cannot be clicked, and the others still hand their value on', () => {
    const chosen: ExampleSpan[] = [];
    const options: readonly SegmentOption<ExampleSpan>[] = [{ value: 'hour', label: '1h', disabled: true }, { value: 'day', label: '1d' }];
    render(<SegmentedControl accessibleName="Finished work" options={options} selected="day" onSelect={(value) => chosen.push(value)} />);
    const buttons = [...screen.getByRole('group', { name: 'Finished work' }).querySelectorAll('button')];
    buttons.forEach((button) => fireEvent.click(button));
    expect([buttons.map((button) => button.disabled), chosen]).toEqual([[true, false], ['day']]);
  });

  test('a segment of a set height keeps its label on one line, and a disabled one fades to the disabled ink', () => {
    const stylesheet = document.createElement('style');
    stylesheet.textContent = STYLESHEETS_OF_THE_CONTROL.map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    document.head.append(stylesheet);
    const options: readonly SegmentOption<ExampleSpan>[] = [{ value: 'hour', label: 'If you approved it', disabled: true }, { value: 'day', label: '1d' }];
    render(
      <>
        <SegmentedControl accessibleName="Finished work" options={options} selected="day" onSelect={() => undefined} size="compact" />
        <span style={{ color: 'var(--ink-disabled)' }}>Disabled ink</span>
      </>,
    );
    const [disabledSegment, enabledSegment] = [...screen.getByRole('group', { name: 'Finished work' }).querySelectorAll('button')];
    const looks = [disabledSegment, enabledSegment].map((segment) => {
      const computedStyle = segment === undefined ? null : getComputedStyle(segment);
      return { whiteSpace: computedStyle?.whiteSpace, color: computedStyle?.color };
    });
    const disabledInk = getComputedStyle(screen.getByText('Disabled ink')).color;
    stylesheet.remove();
    expect(looks.map((look) => look.whiteSpace)).toEqual(['nowrap', 'nowrap']);
    expect([looks[0]?.color, looks[1]?.color === disabledInk]).toEqual([disabledInk, false]);
  });

  test('the pressed segment is a chip raised on the tray\'s wash, through the segment tokens, in both themes', () => {
    const stylesheet = document.createElement('style');
    stylesheet.textContent = STYLESHEETS_OF_THE_CONTROL.map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    document.head.append(stylesheet);
    const looksInTheme = (theme: 'light' | 'dark') => {
      document.documentElement.dataset['theme'] = theme;
      render(
        <>
          <SegmentedControl accessibleName="Finished work" options={OPTIONS} selected="day" onSelect={() => undefined} />
          <span style={{ color: 'var(--segment-pressed-ink)', background: 'var(--segment-pressed-fill)' }}>Pressed chip</span>
          <span style={{ background: 'var(--segment-track)' }}>Tray</span>
        </>,
      );
      const group = screen.getByRole('group', { name: 'Finished work' });
      const pressed = getComputedStyle(screen.getByRole('button', { name: '1d 5' }));
      const chip = getComputedStyle(screen.getByText('Pressed chip'));
      const looks = {
        pressedFillIsTheChip: pressed.backgroundColor === chip.backgroundColor,
        pressedInkIsTheChip:  pressed.color === chip.color,
        trayIsTheTrack:       getComputedStyle(group).backgroundColor === getComputedStyle(screen.getByText('Tray')).backgroundColor,
        chipFill:             chip.backgroundColor,
      };
      cleanup();
      return looks;
    };
    const light = looksInTheme('light');
    const dark = looksInTheme('dark');
    delete document.documentElement.dataset['theme'];
    stylesheet.remove();
    expect([light.pressedFillIsTheChip, light.pressedInkIsTheChip, light.trayIsTheTrack]).toEqual([true, true, true]);
    expect([dark.pressedFillIsTheChip, dark.pressedInkIsTheChip, dark.trayIsTheTrack]).toEqual([true, true, true]);
    expect(light.chipFill === dark.chipFill).toBe(false);
  });

  test('a name of its own names the group where no label shows, and a group named both ways does not compile', () => {
    render(<SegmentedControl accessibleName="Finished work" options={OPTIONS} selected={null} onSelect={() => undefined} />);
    expect(screen.getByRole('group', { name: 'Finished work' }).hasAttribute('aria-labelledby')).toBe(false);
    // @ts-expect-error the group is named by a label element or a name of its own, never both
    const namedBothWays = <SegmentedControl labelledBy="example-span-label" accessibleName="Finished work" options={OPTIONS} selected={null} onSelect={() => undefined} />;
    expect(namedBothWays.props.options).toBe(OPTIONS);
  });

  test('a trailing menu sits last in the tray and sets data-trailing, and its buttons are no segments', () => {
    const chosen: ExampleSpan[] = [];
    render(
      <SegmentedControl
        accessibleName="Finished work"
        options={OPTIONS}
        selected="all"
        onSelect={(value) => chosen.push(value)}
        trailing={(
          <Menu label="More spans" trigger="segment" align="end" triggerContent="1 more" pressed>
            <MenuItem label="Last week" closing="return-focus" onChoose={() => undefined} />
          </Menu>
        )}
      />,
    );
    const group = screen.getByRole('group', { name: 'Finished work' });
    const trailing = group.lastElementChild;
    expect([group.hasAttribute('data-trailing'), trailing?.className, trailing?.querySelector('button')?.getAttribute('data-trigger')])
      .toEqual([true, 'design-system-segments-trailing', 'segment']);
    expect(group.querySelectorAll(':scope > button')).toHaveLength(OPTIONS.length);
    fireEvent.click(screen.getByRole('button', { name: '1 more' }));
    expect(chosen).toEqual([]);
  });

  test('separated segments take no trailing part, and a group with none sets no data-trailing', () => {
    // @ts-expect-error a trailing part sits in the tray, and separated segments have none
    const separatedWithTrailing = <SegmentedControl accessibleName="Spans" options={OPTIONS} selected={null} onSelect={() => undefined} separated trailing="More" />;
    expect(separatedWithTrailing.props.separated).toBe(true);
    expect(renderedControl(null).hasAttribute('data-trailing')).toBe(false);
  });

  test('a label is text, never markup', () => {
    const group = renderedControl(null);
    expect([group.querySelector('b'), group.querySelectorAll('button')[2]?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
