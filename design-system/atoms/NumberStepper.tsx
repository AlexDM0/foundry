/**
 * A number changed only in steps: its read-only value between a lower and a raise button, with ArrowDown and ArrowUp on the group doing
 * the same. Each change is clamped to the minimum and to the maximum when there is one, and a button that cannot step is disabled.
 */
import type { KeyboardEvent } from 'react';

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
  const canLower = value > minimum;
  const canRaise = value < maximum;
  const changeBy = (difference: number): void => {
    const clampedValue = Math.min(maximum, Math.max(minimum, value + difference));
    if (clampedValue !== value) onChange(clampedValue);
  };
  const stepOnArrow = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    changeBy(event.key === 'ArrowUp' ? step : -step);
  };

  return (
    <span className="design-system-number-stepper" role="group" aria-label={accessibleName} onKeyDown={stepOnArrow}>
      <button type="button" aria-label={lowerLabel} disabled={!canLower} onClick={() => changeBy(-step)}>−</button>
      <output className="design-system-number-stepper-value" aria-label={`${value} ${unitText}`}>{value}</output>
      <button type="button" aria-label={raiseLabel} disabled={!canRaise} onClick={() => changeBy(step)}>+</button>
    </span>
  );
}
