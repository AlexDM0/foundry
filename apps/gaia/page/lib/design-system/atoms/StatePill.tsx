/**
 * The fixed-width state pill of a detail head: without a tone of its own it reads the colours of the nearest [data-state-tone] around it,
 * so a state change never shifts the line. A fit-width pill carries its own tone. The flags draw a dashed edge and a struck label.
 */
import type { StateTone } from '../@types/StateTone.ts';

export interface StatePillProps {
  readonly label:   string;
  readonly tone?:   StateTone;
  readonly dashed?: boolean;
  readonly struck?: boolean;
  readonly width?:  'fixed' | 'fit';
}

export function StatePill({
  label, tone, dashed = false, struck = false, width = 'fixed'
}: StatePillProps) {
  return (
    <span
      className="design-system-state-pill"
      data-state-tone={tone}
      data-dashed={dashed ? '' : undefined}
      data-struck={struck ? '' : undefined}
      data-width={width === 'fit' ? width : undefined}
    >
      {label}
    </span>
  );
}
