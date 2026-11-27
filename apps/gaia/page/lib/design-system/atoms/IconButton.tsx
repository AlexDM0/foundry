/**
 * The square icon button: it shows a package glyph or a drawing of the caller's, hidden from the accessibility tree, under its name. A
 * disabled one is drawn faded and calls nothing. `accent` draws the primary action beside a text box, such as Send: an orange block as
 * tall as its row, its drawing at 18px.
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
  /** The orange block of the primary action beside a text box, as tall as its row. */
  readonly accent?:             boolean;
  /** The element that describes this one, such as the tooltip a `Tooltip` around it hands it. */
  readonly 'aria-describedby'?: string;
  readonly buttonRef?:          Ref<HTMLButtonElement>;
};

export function IconButton({
  glyph, drawing, accessibleName, title, onPress, disabled = false, accent = false, 'aria-describedby': describingElementId, buttonRef
}: IconButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="design-system-icon-button"
      data-accent={accent ? '' : undefined}
      aria-label={accessibleName}
      aria-describedby={describingElementId}
      title={title}
      disabled={disabled}
      onClick={onPress}
    >
      <span className="design-system-icon-button-drawing" aria-hidden="true">{glyph === undefined ? drawing : GLYPH_TEXT[glyph]}</span>
    </button>
  );
}
