/**
 * A choice of one among a few, drawn as joined segments on a sunken ground; the pressed segment takes the surface. A segment may show a count,
 * and the ground may end with one more control of the caller's, such as a menu of the choices that do not fit.
 */
import type { ReactNode } from 'react';

export interface SegmentOption<Value extends string> {
  readonly value:  Value;
  readonly label:  string;
  readonly count?: number;
}

export interface SegmentedControlProps<Value extends string> {
  /** The group's accessible name, such as "Theme". */
  readonly label:     string;
  readonly options:   readonly SegmentOption<Value>[];
  readonly selected:  Value;
  readonly onSelect:  (value: Value) => void;
  readonly disabled?: boolean;
  /** Drawn after the segments on the same ground; when it holds the selected choice, no segment is pressed. */
  readonly trailing?: ReactNode;
}

export function SegmentedControl<Value extends string>({
  label, options, selected, onSelect, disabled = false, trailing = null
}: SegmentedControlProps<Value>) {
  return (
    <div className="gaia-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="gaia-segment"
          aria-pressed={option.value === selected}
          disabled={disabled}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
          {option.count === undefined ? null : <span className="gaia-segment-count">{option.count}</span>}
        </button>
      ))}
      {trailing}
    </div>
  );
}
