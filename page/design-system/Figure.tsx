/**
 * One figure: a mono value and its words, with a hairline on its left. Stacked, it is a 17 px value over its 12 px label; inline (folded),
 * the value at 15 px sits before its label on one line, for a view that has no room for a row of stacked figures. A value that waits on
 * User or stands at a limit takes the orange text.
 */
export type FigureForm = 'stacked' | 'inline';

export interface FigureProps {
  readonly value:      string;
  readonly label:      string;
  readonly form?:      FigureForm;
  /** The value waits on User or stands at a limit. */
  readonly attention?: boolean;
}

export function Figure({
  value, label, form = 'stacked', attention = false
}: FigureProps) {
  return (
    <div className="gaia-figure" data-form={form} data-attention={attention ? '' : undefined}>
      <span className="gaia-figure-value">{value}</span>
      <span className="gaia-figure-label">{label}</span>
    </div>
  );
}
