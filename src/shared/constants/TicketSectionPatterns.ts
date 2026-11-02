/** How a ticket body's sections and its Acceptance items are read, shared by the release's reading and the Markdown renderer. */
export const TICKET_SECTION_PATTERNS = {
  SECTION_BOUNDARY:     /^#{1,2}[ \t]/,
  CODE_FENCE:           /^[ \t]*(```|~~~)/,
  /** A trailing carriage return still matches, so a writer splitting a CRLF body on line feeds finds the heading. */
  ACCEPTANCE_HEADING:   /^## Acceptance[ \t]*\r?$/,
  /** Captures the item's number and the text after it; the text stops before a carriage return, so a CRLF line still matches. */
  ACCEPTANCE_ITEM_LINE: /^A(\d+)\.(?:[ \t]+(.*)|$)/,
} as const;
