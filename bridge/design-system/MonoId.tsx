/** An id in the mono face with tabular figures, as text or as a link to its own place. */
export function MonoId({ text }: { readonly text: string }) {
  return <span className="bridge-ticket-id">{text}</span>;
}

export interface IdLinkProps {
  readonly text:      string;
  readonly href:      string;
  /** Brings the id's own item into view in place; `true` when it did, so the link is not followed. */
  readonly onFollow?: () => boolean;
}

/** A link inside a clickable card is its own click: it never reaches the card's handler. */
export function IdLink({ text, href, onFollow }: IdLinkProps) {
  return (
    <a
      className="bridge-id-link"
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
