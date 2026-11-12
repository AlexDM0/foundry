/** One figure: an 18 px mono value over its 12 px label. The value is a machine value, so it is set in mono with tabular figures. */
export interface FigureProps {
  readonly value: string;
  readonly label: string;
}

export function Figure({ value, label }: FigureProps) {
  return (
    <div className="gaia-figure">
      <span className="gaia-figure-value">{value}</span>
      <span className="gaia-figure-label">{label}</span>
    </div>
  );
}
