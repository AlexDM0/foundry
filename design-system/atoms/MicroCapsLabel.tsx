/**
 * A small-capitals label: a group's name, a field's label or a block's title. Muted by default; the state tone reads the ink of the
 * nearest [data-state] around it, and the error tone the error ink.
 */
export type MicroCapsTone = 'muted' | 'state' | 'error';

export interface MicroCapsLabelProps {
  readonly text:     string;
  readonly element?: 'span' | 'label' | 'div' | 'h3' | 'h4';
  readonly id?:      string;
  /** A `label` element's field. */
  readonly htmlFor?: string;
  readonly tone?:    MicroCapsTone;
}

export function MicroCapsLabel({
  text, element = 'span', id, htmlFor, tone = 'muted'
}: MicroCapsLabelProps) {
  const toneAttribute = tone === 'muted' ? undefined : tone;
  switch (element) {
    case 'label':
      return <label className="design-system-micro-caps" id={id} htmlFor={htmlFor} data-tone={toneAttribute}>{text}</label>;
    case 'div':
      return <div className="design-system-micro-caps" id={id} data-tone={toneAttribute}>{text}</div>;
    case 'h3':
      return <h3 className="design-system-micro-caps" id={id} data-tone={toneAttribute}>{text}</h3>;
    case 'h4':
      return <h4 className="design-system-micro-caps" id={id} data-tone={toneAttribute}>{text}</h4>;
    default:
      return <span className="design-system-micro-caps" id={id} data-tone={toneAttribute}>{text}</span>;
  }
}
