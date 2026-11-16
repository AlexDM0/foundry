/**
 * The square icon button: it shows a package glyph or a drawing of the caller's, hidden from the accessibility tree, under its name. A
 * disabled one is drawn faded and calls nothing.
 */
import type { ReactNode, Ref } from 'react';

export type IconGlyph = 'close';

const GLYPH_TEXT: Readonly<Record<IconGlyph, string>> = { close: '×' };

/** The drawing an icon button shows: one of the package's glyphs, or a drawing the caller makes, such as an inline SVG. */
type IconButtonDrawing = { readonly glyph: IconGlyph; readonly drawing?: never } | { readonly drawing: ReactNode; readonly glyph?: never };

export type IconButtonProps = IconButtonDrawing & {
  readonly accessibleName:      string;
  /** The tooltip the pointer shows. */
  readonly title?:              string;
  readonly onPress:             () => void;
  readonly disabled?:           boolean;
  /** The element that describes this one, such as the tooltip a `Tooltip` around it hands it. */
  readonly 'aria-describedby'?: string;
  readonly buttonRef?:          Ref<HTMLButtonElement>;
};

export function IconButton({
  glyph, drawing, accessibleName, title, onPress, disabled = false, 'aria-describedby': describingElementId, buttonRef
}: IconButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="design-system-icon-button"
      aria-label={accessibleName}
      aria-describedby={describingElementId}
      title={title}
      disabled={disabled}
      onClick={onPress}
    >
      <span aria-hidden="true">{glyph === undefined ? drawing : GLYPH_TEXT[glyph]}</span>
    </button>
  );
}
