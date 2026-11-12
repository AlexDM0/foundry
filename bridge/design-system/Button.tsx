/**
 * The three button forms of the Bridge: the bordered button (quiet, primary or danger, or a link drawn as one), the text button in the
 * link colour, and the square icon button. Every word arrives as a prop; a variant is a `data-*` attribute, never a class.
 */
import type { ReactNode, Ref } from 'react';

export type ButtonEmphasis = 'quiet' | 'primary' | 'danger';

/** `link` tints a quiet button in the link colour, for the one action a view offers beside its primary. */
export type ButtonTint = 'link';

export interface ButtonProps {
  readonly label:           string;
  /** A glyph or inline SVG before the label. */
  readonly leading?:        ReactNode;
  readonly emphasis?:       ButtonEmphasis;
  /** Draws a band of light across a primary button now and then, the next step a view waits on. */
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
}

export function Button({
  label, leading, emphasis = 'quiet', attention = false, tint, href, onPress, disabled = false, pressed, expanded, controls, accessibleName,
  buttonRef
}: ButtonProps) {
  const emphasisAttributes = {
    'data-primary':   emphasis === 'primary' ? '' : undefined,
    'data-danger':    emphasis === 'danger' ? '' : undefined,
    'data-attention': attention ? '' : undefined,
    'data-tint':      tint,
  };
  if (href !== undefined) {
    return (
      <a className="bridge-button" href={href} aria-label={accessibleName} {...emphasisAttributes}>
        {leading}
        {label}
      </a>
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      className="bridge-button"
      aria-label={accessibleName}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      onClick={onPress}
      {...emphasisAttributes}
    >
      {leading}
      {label}
    </button>
  );
}

export interface TextButtonProps {
  readonly label:    string;
  /** A link in the button's look; without it the text button is a button calling `onPress`. */
  readonly href?:    string;
  readonly onPress?: () => void;
}

export function TextButton({ label, href, onPress }: TextButtonProps) {
  if (href !== undefined) return <a className="bridge-link-button" href={href}>{label}</a>;
  return <button type="button" className="bridge-link-button" onClick={onPress}>{label}</button>;
}

export type IconGlyph = 'close';

const GLYPH_TEXT: Readonly<Record<IconGlyph, string>> = { close: '×' };

export interface IconButtonProps {
  readonly glyph:          IconGlyph;
  readonly accessibleName: string;
  readonly onPress:        () => void;
  readonly buttonRef?:     Ref<HTMLButtonElement>;
}

export function IconButton({
  glyph, accessibleName, onPress, buttonRef
}: IconButtonProps) {
  return (
    <button ref={buttonRef} type="button" className="bridge-icon-button" aria-label={accessibleName} onClick={onPress}>
      <span aria-hidden="true">{GLYPH_TEXT[glyph]}</span>
    </button>
  );
}
