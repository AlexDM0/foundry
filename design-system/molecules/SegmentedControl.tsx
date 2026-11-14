/**
 * A choice of one among a few, drawn as joined segments: the chosen segment is pressed, each may show a count after its label, and a click
 * hands the segment's value on. The group is named by the label element `labelledBy` points at. A size sets its height; `fill` makes it as
 * wide as its holder, its segments in equal columns; `mono` sets the labels in the mono face; `separated` draws each segment as a button of
 * its own, out of the tray. It keeps no margin: its holder spaces it.
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
  /** Sets the labels in the mono face, for machine text such as times. */
  readonly mono?:      boolean;
  /** Each segment an outlined button of its own with no tray, 36px high or 32px compact, the pressed one in the orange tint. */
  readonly separated?: boolean;
}

export function SegmentedControl<Value extends string>({
  labelledBy, options, selected, onSelect, optionRef, size, fill = false, mono = false, separated = false
}: SegmentedControlProps<Value>) {
  const fillStyle = fill ? { [SEGMENT_COUNT_PROPERTY]: String(options.length) } as CSSProperties : undefined;
  return (
    <div
      className="design-system-segments"
      role="group"
      aria-labelledby={labelledBy}
      data-size={size}
      data-fill={fill ? '' : undefined}
      data-mono={mono ? '' : undefined}
      data-separated={separated ? '' : undefined}
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
                <span className="design-system-segment-count">{option.count}</span>
              </>
            )}
        </button>
      ))}
    </div>
  );
}
