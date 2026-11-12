/** A section head or a field's name in small capitals: 11 px, semibold, tracked, muted. The element is the caller's, so a head stays a head. */
export interface MicroCapsLabelProps {
  readonly text:     string;
  readonly element?: 'span' | 'div' | 'h2' | 'h3';
  readonly id?:      string;
}

export function MicroCapsLabel({ text, element = 'span', id }: MicroCapsLabelProps) {
  switch (element) {
    case 'div':
      return <div className="gaia-micro-caps" id={id}>{text}</div>;
    case 'h2':
      return <h2 className="gaia-micro-caps" id={id}>{text}</h2>;
    case 'h3':
      return <h3 className="gaia-micro-caps" id={id}>{text}</h3>;
    default:
      return <span className="gaia-micro-caps" id={id}>{text}</span>;
  }
}
