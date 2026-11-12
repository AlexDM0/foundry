/**
 * A choice of one among a few, drawn as joined segments: the chosen segment is pressed, each may show a count after its label, and a click
 * hands the segment's value on. The group is named by the label element `labelledBy` points at. A size sets its height; `fill` makes it as
 * wide as its holder, its segments in equal columns.
 */
import type { CSSProperties } from 'react';

const SEGMENT_COUNT_PROPERTY = '--segment-count';

export interface SegmentOption<Value extends string> {
  readonly value:           Value;
  readonly label:           string;
  readonly count?:          number;
  /** The segment's name where its label is short for it. */
  readonly accessibleName?: string;
}

export interface SegmentedControlProps<Value extends string> {
  readonly labelledBy: string;
  readonly options:    readonly SegmentOption<Value>[];
  /** `null` while no segment is the choice. */
  readonly selected:   Value | null;
  readonly onSelect:   (value: Value) => void;
  /** Hands each segment's button on, so a caller can move the focus to one. */
  readonly optionRef?: (value: Value, element: HTMLButtonElement | null) => void;
  /** `standard` 30px high, `compact` 26px for a row among many; absent, the segments keep their own height. */
  readonly size?:      'standard' | 'compact';
  readonly fill?:      boolean;
}

export function SegmentedControl<Value extends string>({
  labelledBy, options, selected, onSelect, optionRef, size, fill = false
}: SegmentedControlProps<Value>) {
  const fillStyle = fill ? { [SEGMENT_COUNT_PROPERTY]: String(options.length) } as CSSProperties : undefined;
  return (
    <div
      className="bridge-segments"
      role="group"
      aria-labelledby={labelledBy}
      data-size={size}
      data-fill={fill ? '' : undefined}
      style={fillStyle}
    >
      {options.map((option) => (
        <button
          key={option.value}
          ref={optionRef === undefined ? undefined : (element) => optionRef(option.value, element)}
          type="button"
          aria-pressed={option.value === selected}
          aria-label={option.accessibleName}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
          {option.count === undefined
            ? null
            : (
              <>
                {' '}
                <span className="bridge-segment-count">{option.count}</span>
              </>
            )}
        </button>
      ))}
    </div>
  );
}
