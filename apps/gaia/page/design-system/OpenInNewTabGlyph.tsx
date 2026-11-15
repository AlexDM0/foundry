/**
 * The "Open in new tab" arrow, one of Gaia's drawn shapes, for a button's `leading` or an icon button's drawing. It is stroked in the colour
 * of what holds it and hidden: the button's label names it.
 */
export function OpenInNewTabGlyph() {
  return (
    <svg className="gaia-open-in-new-tab-glyph" aria-hidden="true" width="13" height="13" viewBox="0 0 13 13">
      <path d="M5 2.5H2.5v8h8V8" />
      <path d="M7.5 2h3.5v3.5" />
      <path d="M11 2 6 7" />
    </svg>
  );
}
