/**
 * A number changed only in steps: its read-only value between a lower and a raise button, with ArrowDown and ArrowUp on the group doing
 * the same. Each change is clamped to the minimum and to the maximum when there is one, and a button that cannot step is disabled; a step
 * that disables the button holding the focus hands the focus to the other one, so the group keeps it. A disabled stepper steps on nothing.
 * A changed value rises in when it grew and drops in when it shrank. The standard stepper is one box with the value in a field; a compact
 * one is two small buttons around the value as text, which a leading text such as "4 /" may precede.
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
  /** Both buttons off and the arrow keys ignored, such as while a change is on its way. */
  readonly disabled?:      boolean;
  readonly compact?:       boolean;
  /** Text before the value, read with it, such as the part of the value in use: "4 /" before a limit of 5. */
  readonly leadingText?:   string;
}

export function NumberStepper({
  accessibleName, value, step, minimum, maximum = Number.POSITIVE_INFINITY, unitText, lowerLabel, raiseLabel, onChange, disabled = false, compact = false,
  leadingText
}: NumberStepperProps) {
  const lowerButton = useRef<HTMLButtonElement | null>(null);
  const raiseButton = useRef<HTMLButtonElement | null>(null);
  /** The button that held the focus at the last step, up to the render that step causes. */
  const buttonFocusedAtStep = useRef<HTMLButtonElement | null>(null);
  const { changeCount, direction } = useValueChange(value);
  const canLower = !disabled && value > minimum;
  const canRaise = !disabled && value < maximum;

  useLayoutEffect(() => {
    const focusedButton = buttonFocusedAtStep.current;
    buttonFocusedAtStep.current = null;
    if (focusedButton === null || !focusedButton.disabled) return;
    const otherButton = focusedButton === lowerButton.current ? raiseButton.current : lowerButton.current;
    if (otherButton !== null && !otherButton.disabled) otherButton.focus();
  });

  const changeBy = (difference: number): void => {
    if (disabled) return;
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

  const valueText = leadingText === undefined ? `${value}` : `${leadingText} ${value}`;
  return (
    <span className="design-system-number-stepper" role="group" aria-label={accessibleName} data-compact={compact ? '' : undefined} onKeyDown={stepOnArrow}>
      <button ref={lowerButton} type="button" aria-label={lowerLabel} disabled={!canLower} onClick={() => changeBy(-step)}>−</button>
      <output className="design-system-number-stepper-value" aria-label={`${valueText} ${unitText}`}>
        {leadingText === undefined ? null : <span className="design-system-number-stepper-leading">{leadingText}</span>}
        <span key={changeCount} className="design-system-number-stepper-number" data-change={direction}>{value}</span>
      </output>
      <button ref={raiseButton} type="button" aria-label={raiseLabel} disabled={!canRaise} onClick={() => changeBy(step)}>+</button>
    </span>
  );
}
