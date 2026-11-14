/**
 * An id in the mono face with tabular figures, as a link to its own place. A link inside a clickable card is its own click: it never reaches
 * the card's handler.
 */
export interface IdLinkProps {
  readonly text:      string;
  readonly href:      string;
  /** Brings the id's own item into view in place; `true` when it did, so the link is not followed. */
  readonly onFollow?: () => boolean;
}

export function IdLink({ text, href, onFollow }: IdLinkProps) {
  return (
    <a
      className="design-system-id-link"
      href={href}
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
