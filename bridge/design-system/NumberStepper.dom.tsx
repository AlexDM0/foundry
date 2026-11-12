/**
 * The number stepper, in a happy-dom document. What matters: the buttons and ArrowUp and ArrowDown on the group step the value by `step`;
 * a change is clamped at the minimum and the maximum, and a button that cannot step is disabled; the group is named, and the value is
 * read with its unit.
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

import { NumberStepper } from './NumberStepper.tsx';

const STEP = 50;

afterEach(() => {
  cleanup();
});

function renderedStepper(value: number, changes: number[], maximum?: number): HTMLElement {
  render(
    <NumberStepper
      accessibleName="Re-review threshold"
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
  return screen.getByRole('group', { name: 'Re-review threshold' });
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

  test('the value is read with its unit', () => {
    const group = renderedStepper(750, []);
    const value = group.querySelector('.bridge-number-stepper-value');
    expect([value?.textContent, value?.getAttribute('aria-label')]).toEqual(['750', '750 lines']);
  });
});
