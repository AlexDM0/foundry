/**
 * The number stepper, in a happy-dom document. What matters: the buttons and ArrowUp and ArrowDown on the group step the value by `step`;
 * a change is clamped at the minimum and the maximum, and a button that cannot step is disabled, a step that disables the focused button
 * handing the focus to the other one; a disabled stepper steps on nothing; the group is named, and the value is read with its unit and its
 * leading text; compact sets `data-compact`; a changed value says which way it went, so it rises or drops in.
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

import { useState } from 'react';

import { NumberStepper } from './NumberStepper.tsx';

const STEP = 50;

afterEach(() => {
  cleanup();
});

function renderedStepper(value: number, changes: number[], maximum?: number): HTMLElement {
  render(
    <NumberStepper
      accessibleName="Retry threshold"
      value={value}
      step={STEP}
      minimum={STEP}
      {...(maximum === undefined ? {} : { maximum })}
      unitText="lines"
      lowerLabel="Lower the threshold"
      raiseLabel="Raise the threshold"
      onChange={(changed) => changes.push(changed)}
    />,
  );
  return screen.getByRole('group', { name: 'Retry threshold' });
}

function isDisabled(name: string): boolean {
  return (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
}

describe('the number stepper', () => {
  test('the buttons and the arrow keys step the value', () => {
    const changes: number[] = [];
    const group = renderedStepper(750, changes);
    fireEvent.click(screen.getByRole('button', { name: 'Lower the threshold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Raise the threshold' }));
    expect(fireEvent.keyDown(group, { key: 'ArrowDown' })).toBe(false);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Raise the threshold' }), { key: 'ArrowUp' });
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(changes).toEqual([700, 800, 700, 800]);
  });

  test('it clamps at the minimum: lower is disabled there, and a step past it lands on it', () => {
    const changes: number[] = [];
    const group = renderedStepper(STEP, changes);
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect([isDisabled('Lower the threshold'), isDisabled('Raise the threshold'), changes]).toEqual([true, false, []]);
    cleanup();
    fireEvent.keyDown(renderedStepper(STEP + 20, changes), { key: 'ArrowDown' });
    expect(changes).toEqual([STEP]);
  });

  test('it clamps at a maximum when there is one', () => {
    const changes: number[] = [];
    const group = renderedStepper(980, changes, 1000);
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect([isDisabled('Raise the threshold'), changes]).toEqual([false, [1000]]);
    cleanup();
    renderedStepper(1000, changes, 1000);
    expect(isDisabled('Raise the threshold')).toBe(true);
  });

  test('a step that disables the focused button hands the focus to the other one, so the arrow keys still reach the group', () => {
    function HeldStepper() {
      const [value, setValue] = useState(STEP * 2);
      return (
        <NumberStepper
          accessibleName="Retry threshold"
          value={value}
          step={STEP}
          minimum={STEP}
          unitText="lines"
          lowerLabel="Lower the threshold"
          raiseLabel="Raise the threshold"
          onChange={setValue}
        />
      );
    }
    render(<HeldStepper />);
    const lower = screen.getByRole('button', { name: 'Lower the threshold' });
    lower.focus();
    fireEvent.click(lower);
    expect([isDisabled('Lower the threshold'), document.activeElement === screen.getByRole('button', { name: 'Raise the threshold' })]).toEqual([true, true]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowUp' });
    expect(screen.getByRole('group', { name: 'Retry threshold' }).querySelector('output')?.textContent).toBe(String(STEP * 2));
  });

  test('the value is read with its unit', () => {
    const group = renderedStepper(750, []);
    const value = group.querySelector('.design-system-number-stepper-value');
    expect([value?.textContent, value?.getAttribute('aria-label')]).toEqual(['750', '750 lines']);
  });

  test('a changed value says which way it went, and the first showing says nothing', () => {
    const stepperOf = (value: number) => (
      <NumberStepper
        accessibleName="Retry threshold"
        value={value}
        step={STEP}
        minimum={STEP}
        unitText="lines"
        lowerLabel="Lower the threshold"
        raiseLabel="Raise the threshold"
        onChange={() => undefined}
      />
    );
    const { container, rerender } = render(stepperOf(750));
    const directionShown = (): string | null | undefined => container.querySelector('.design-system-number-stepper-number')?.getAttribute('data-change');
    expect(directionShown()).toBeNull();
    rerender(stepperOf(800));
    expect(directionShown()).toBe('up');
    rerender(stepperOf(700));
    expect(directionShown()).toBe('down');
  });

  test('a disabled stepper disables both buttons and steps on no key', () => {
    const changes: number[] = [];
    render(
      <NumberStepper
        accessibleName="Example limit"
        value={4}
        step={1}
        minimum={1}
        maximum={8}
        unitText="seats"
        lowerLabel="Lower the example limit"
        raiseLabel="Raise the example limit"
        disabled
        onChange={(changed) => changes.push(changed)}
      />,
    );
    fireEvent.keyDown(screen.getByRole('group', { name: 'Example limit' }), { key: 'ArrowUp' });
    expect([isDisabled('Lower the example limit'), isDisabled('Raise the example limit'), changes]).toEqual([true, true, []]);
  });

  test('a compact stepper sets data-compact, and its leading text shows before the value and is read with it', () => {
    render(
      <>
        <NumberStepper
          accessibleName="Example limit"
          value={5}
          step={1}
          minimum={1}
          unitText="seats"
          lowerLabel="Lower the example limit"
          raiseLabel="Raise the example limit"
          compact
          leadingText="4 /"
          onChange={() => undefined}
        />
        <NumberStepper
          accessibleName="Example standard limit"
          value={5}
          step={1}
          minimum={1}
          unitText="seats"
          lowerLabel="Lower the example standard limit"
          raiseLabel="Raise the example standard limit"
          onChange={() => undefined}
        />
      </>,
    );
    const compact = screen.getByRole('group', { name: 'Example limit' });
    const value = compact.querySelector('output');
    expect([
      compact.hasAttribute('data-compact'),
      value?.querySelector('.design-system-number-stepper-leading')?.textContent,
      value?.querySelector('.design-system-number-stepper-number')?.textContent,
      value?.getAttribute('aria-label'),
      screen.getByRole('group', { name: 'Example standard limit' }).hasAttribute('data-compact'),
    ]).toEqual([true, '4 /', '5', '4 / 5 seats', false]);
  });
});
