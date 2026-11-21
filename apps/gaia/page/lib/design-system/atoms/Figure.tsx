/**
 * One figure: a mono value and its words, with a hairline on its left. Stacked, a 17px value stands over its 12px label; inline, the value
 * at 15px sits before its label on one line, and a row of inline figures draws its hairlines only between them. A tone colours the value,
 * such as `accent` for a value that calls for a look.
 */
import type { StateTone } from '../@types/StateTone.ts';

export type FigureForm = 'stacked' | 'inline';

export interface FigureProps {
  readonly value: string;
  readonly label: string;
  readonly form?: FigureForm;
  readonly tone?: StateTone;
}

export function Figure({
  value, label, form = 'stacked', tone
}: FigureProps) {
  return (
    <div className="design-system-figure" data-form={form} data-state-tone={tone}>
      <span className="design-system-figure-value">{value}</span>
      <span className="design-system-figure-label">{label}</span>
    </div>
  );
}
