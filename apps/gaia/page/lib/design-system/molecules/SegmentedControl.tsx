/**
 * A choice of one among a few, drawn as joined segments: the chosen one pressed, each with an optional count after its label, a click handing its
 * value on. The group is named by `labelledBy`'s element or by `accessibleName`. `fill`, `mono`, `separated` and a size shape it, `trailing` sits
 * as the tray's last segment, and it keeps no margin: its holder spaces it.
 */
import type { CSSProperties, ReactNode } from 'react';

const SEGMENT_COUNT_PROPERTY = '--segment-count';

export interface SegmentOption<Value extends string> {
  readonly value:           Value;
  readonly label:           string;
  readonly count?:          number;
  /** Draws the count in the accent colours, in a pill of its own, for a count that calls for the viewer. */
  readonly accentedCount?:  boolean;
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
                <span className="design-system-segment-count" data-accented={option.accentedCount === true ? '' : undefined}>{option.count}</span>
              </>
            )}
        </button>
      ))}
      {trailing === undefined ? null : <div className="design-system-segments-trailing">{trailing}</div>}
    </div>
  );
}
