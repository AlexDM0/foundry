/**
 * A number changed only in steps: its read-only value between a lower and a raise button, with ArrowDown and ArrowUp on the group doing
 * the same. Each change is clamped to the minimum and to the maximum when there is one, and a button that cannot step is disabled; a step
 * that disables the button holding the focus hands the focus to the other one, so the group keeps it. A changed value rises in when it
 * grew and drops in when it shrank.
 */
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';

import { useValueChange } from '../utils/ValueChange.ts';

export interface NumberStepperProps {
  readonly accessibleName: string;
  readonly value:          number;
  readonly step:           number;
  readonly minimum:        number;
  readonly maximum?:       number;
  /** What the value counts, such as "lines", read with the value. */
  readonly unitText:       string;
  readonly lowerLabel:     string;
  readonly raiseLabel:     string;
  readonly onChange:       (value: number) => void;
}

export function NumberStepper({
  accessibleName, value, step, minimum, maximum = Number.POSITIVE_INFINITY, unitText, lowerLabel, raiseLabel, onChange
}: NumberStepperProps) {
  const lowerButton = useRef<HTMLButtonElement | null>(null);
  const raiseButton = useRef<HTMLButtonElement | null>(null);
  /** The button that held the focus at the last step, up to the render that step causes. */
  const buttonFocusedAtStep = useRef<HTMLButtonElement | null>(null);
  const { changeCount, direction } = useValueChange(value);
  const canLower = value > minimum;
  const canRaise = value < maximum;

  useLayoutEffect(() => {
    const focusedButton = buttonFocusedAtStep.current;
    buttonFocusedAtStep.current = null;
    if (focusedButton === null || !focusedButton.disabled) return;
    const otherButton = focusedButton === lowerButton.current ? raiseButton.current : lowerButton.current;
    if (otherButton !== null && !otherButton.disabled) otherButton.focus();
  });

  const changeBy = (difference: number): void => {
    const clampedValue = Math.min(maximum, Math.max(minimum, value + difference));
    if (clampedValue === value) return;
    const focusedElement = lowerButton.current?.ownerDocument.activeElement ?? null;
    buttonFocusedAtStep.current = [lowerButton.current, raiseButton.current].find((button) => button !== null && button === focusedElement) ?? null;
    onChange(clampedValue);
  };
  const stepOnArrow = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    changeBy(event.key === 'ArrowUp' ? step : -step);
  };

  return (
    <span className="design-system-number-stepper" role="group" aria-label={accessibleName} onKeyDown={stepOnArrow}>
      <button ref={lowerButton} type="button" aria-label={lowerLabel} disabled={!canLower} onClick={() => changeBy(-step)}>−</button>
      <output className="design-system-number-stepper-value" aria-label={`${value} ${unitText}`}>
        <span key={changeCount} className="design-system-number-stepper-number" data-change={direction}>{value}</span>
      </output>
      <button ref={raiseButton} type="button" aria-label={raiseLabel} disabled={!canRaise} onClick={() => changeBy(step)}>+</button>
    </span>
  );
}
