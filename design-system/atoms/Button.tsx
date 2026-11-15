/**
 * The bordered button: secondary, primary, danger or ghost, or a link drawn as one. Every word arrives as a prop; a variant is a `data-*`
 * attribute, never a class. A button is 36px tall; `compact` makes it 30px and `dense` 26px, for a dense row, so the two exclude each
 * other in the props type.
 */
import type { ReactNode, Ref } from 'react';

/** `quiet` is the outlined secondary button; `ghost` has no border and no ground, for a step back such as Cancel. */
export type ButtonEmphasis = 'quiet' | 'primary' | 'danger' | 'ghost';

/** `link` tints a quiet button in the link colour, for the one action a view offers beside its primary. */
export type ButtonTint = 'link';

/** The smaller heights: `compact` (30px) or `dense` (26px), never both. */
type ButtonSizeFlags = { readonly compact?: boolean; readonly dense?: never } | { readonly dense?: boolean; readonly compact?: never };

export type ButtonProps = ButtonSizeFlags & {
  readonly label:           string;
  /** A glyph or inline SVG before the label. */
  readonly leading?:        ReactNode;
  readonly emphasis?:       ButtonEmphasis;
  /** Rings a primary button now and then, the next step a view waits on. */
  readonly attention?:      boolean;
  readonly tint?:           ButtonTint;
  /** A link drawn as a button; with it, `onPress` is not used. */
  readonly href?:           string;
  readonly onPress?:        () => void;
  readonly disabled?:       boolean;
  /** A toggle: sets `aria-pressed`. */
  readonly pressed?:        boolean;
  /** A disclosure or popover trigger: sets `aria-expanded`, with `controls` naming what it opens. */
  readonly expanded?:       boolean;
  readonly controls?:       string;
  readonly accessibleName?: string;
  readonly buttonRef?:      Ref<HTMLButtonElement>;
};

const flagAttribute = (isSet: boolean | undefined) => (isSet === true ? '' : undefined);

export function Button(props: ButtonProps) {
  const {
    label, leading, emphasis = 'quiet', attention = false, tint, href, onPress, disabled = false, pressed, expanded, controls, accessibleName,
    buttonRef
  } = props;
  const emphasisAttributes = {
    'data-primary':   flagAttribute(emphasis === 'primary'),
    'data-danger':    flagAttribute(emphasis === 'danger'),
    'data-ghost':     flagAttribute(emphasis === 'ghost'),
    'data-attention': flagAttribute(attention),
    'data-tint':      tint,
    'data-compact':   flagAttribute(props.compact),
    'data-dense':     flagAttribute(props.dense),
  };
  const leadingGlyph = leading === undefined ? null : <span className="design-system-button-leading">{leading}</span>;
  if (href !== undefined) {
    return (
      <a className="design-system-button" href={href} aria-label={accessibleName} {...emphasisAttributes}>
        {leadingGlyph}
        {label}
      </a>
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      className="design-system-button"
      aria-label={accessibleName}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      onClick={onPress}
      {...emphasisAttributes}
    >
      {leadingGlyph}
      {label}
    </button>
  );
}
