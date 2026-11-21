/**
 * A stamp in its short form, the full stamp on hover. A caller with no stamp renders none: a stamp is never invented. As a `time` element it
 * may carry the machine-readable `dateTime` of the moment it shows.
 */

/** Only a `time` element carries a `dateTime`. */
export type StampElement =
  | { readonly element?: 'span'; readonly dateTime?: never }
  | { readonly element: 'time'; readonly dateTime?: string };

export type StampProps = StampElement & {
  readonly shortText: string;
  readonly fullText?: string;
};

export function Stamp({
  shortText, fullText, element = 'span', dateTime
}: StampProps) {
  return element === 'time'
    ? <time className="design-system-stamp" title={fullText} dateTime={dateTime}>{shortText}</time>
    : <span className="design-system-stamp" title={fullText}>{shortText}</span>;
}
