/**
 * A choice of one among a few, drawn as joined segments: the chosen segment is pressed, each may show a count after its label, and a click
 * hands the segment's value on. The group is named by the label element `labelledBy` points at, or by `accessibleName` where no label shows.
 * A size sets its height; `fill` makes it as wide as its holder, its segments in equal columns; `mono` sets the labels in the mono face;
 * `separated` draws each segment as a button of its own, out of the tray; `trailing` sits as the tray's last segment, such as a menu of the
 * choices that do not fit. It keeps no margin: its holder spaces it.
 */
import type { CSSProperties, ReactNode } from 'react';

const SEGMENT_COUNT_PROPERTY = '--segment-count';

export interface SegmentOption<Value extends string> {
  readonly value:           Value;
  readonly label:           string;
  readonly count?:          number;
  /** The segment's name where its label is short for it. */
  readonly accessibleName?: string;
  /** A segment that cannot be chosen now: it shows, and a click hands nothing on. */
  readonly disabled?:       boolean;
}

/** The group is named by a label element on the page or, where none shows, by a name of its own: never both. */
export type SegmentedControlName =
  | { readonly labelledBy: string; readonly accessibleName?: never }
  | { readonly accessibleName: string; readonly labelledBy?: never };

/** A trailing segment sits inside the tray, so separated segments, which have none, take no trailing segment. */
export type SegmentedControlLook =
  | {
    /** Each segment an outlined button of its own with no tray, 36px high or 32px compact, the pressed one in the orange tint. */
    readonly separated?: boolean;
    readonly trailing?:  never;
  }
  | {
    readonly separated?: false;
    /** The tray's last segment, such as a `Menu` with the `segment` trigger holding the choices past the first few. */
    readonly trailing?:  ReactNode;
  };

export type SegmentedControlProps<Value extends string> = SegmentedControlName & SegmentedControlLook & {
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
};

export function SegmentedControl<Value extends string>({
  labelledBy, accessibleName, options, selected, onSelect, optionRef, size, fill = false, mono = false, separated = false, trailing
}: SegmentedControlProps<Value>) {
  const fillStyle = fill ? { [SEGMENT_COUNT_PROPERTY]: String(options.length) } as CSSProperties : undefined;
  return (
    <div
      className="design-system-segments"
      role="group"
      aria-labelledby={labelledBy}
      aria-label={accessibleName}
      data-size={size}
      data-fill={fill ? '' : undefined}
      data-mono={mono ? '' : undefined}
      data-separated={separated ? '' : undefined}
      data-trailing={trailing === undefined ? undefined : ''}
      style={fillStyle}
    >
      {options.map((option) => (
        <button
          key={option.value}
          ref={optionRef === undefined ? undefined : (element) => optionRef(option.value, element)}
          type="button"
          aria-pressed={option.value === selected}
          aria-label={option.accessibleName}
          disabled={option.disabled}
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
      {trailing === undefined ? null : <div className="design-system-segments-trailing">{trailing}</div>}
    </div>
  );
}
