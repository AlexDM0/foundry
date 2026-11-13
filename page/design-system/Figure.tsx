/**
 * One figure: a mono value and its words. Stacked, it is an 18 px value over its 12 px label; inline, the value at body size sits before its
 * label on one line, for a view that has no room for a row of stacked figures. The value is a machine value, so it is set in mono with
 * tabular figures.
 */
export type FigureForm = 'stacked' | 'inline';

export interface FigureProps {
  readonly value: string;
  readonly label: string;
  readonly form?: FigureForm;
}

export function Figure({ value, label, form = 'stacked' }: FigureProps) {
  return (
    <div className="gaia-figure" data-form={form}>
      <span className="gaia-figure-value">{value}</span>
      <span className="gaia-figure-label">{label}</span>
    </div>
  );
}
