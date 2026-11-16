/**
 * An id in the mono face with tabular figures, as a link to its own place. A link inside a clickable card is its own click: it never reaches
 * the card's handler. Its tone is the link colour, or `ink`: the primary ink in the strong weight at rest and the link colour on hover.
 */
export type IdLinkTone = 'link' | 'ink';

export interface IdLinkProps {
  readonly text:      string;
  readonly href:      string;
  readonly tone?:     IdLinkTone;
  /** Brings the id's own item into view in place; `true` when it did, so the link is not followed. */
  readonly onFollow?: () => boolean;
}

export function IdLink({
  text, href, tone = 'link', onFollow
}: IdLinkProps) {
  return (
    <a
      className="design-system-id-link"
      href={href}
      data-tone={tone === 'link' ? undefined : tone}
      onClick={onFollow === undefined
        ? undefined
        : (event) => {
          event.stopPropagation();
          if (onFollow()) event.preventDefault();
        }}
    >
      {text}
    </a>
  );
}
