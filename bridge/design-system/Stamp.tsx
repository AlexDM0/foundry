/** A stamp in its short form, the full stamp on hover. A caller with no stamp renders none: a stamp is never invented. */
export interface StampProps {
  readonly shortText: string;
  readonly fullText?: string;
  readonly element?:  'span' | 'time';
}

export function Stamp({ shortText, fullText, element = 'span' }: StampProps) {
  return element === 'time'
    ? <time className="bridge-stamp" title={fullText}>{shortText}</time>
    : <span className="bridge-stamp" title={fullText}>{shortText}</span>;
}
