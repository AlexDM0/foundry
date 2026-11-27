/**
 * A number changed only in steps, by a lower and a raise button or ArrowDown and ArrowUp, clamped to its bounds; a button that cannot step is
 * disabled and hands the focus to the other, so the group keeps it. The standard stepper is one box with the value in a field; a compact one is
 * two small buttons around the value as text, perhaps after a leading text such as "4 /".
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
