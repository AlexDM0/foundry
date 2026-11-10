/**
 * The fixed-width state pill of a detail head: without a state of its own it reads the colours of the nearest [data-state] around it, so
 * a state change never shifts the line. A fit-width pill carries its own state.
 */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

export interface StatePillProps {
  readonly label:  string;
  readonly state?: DisplayState;
  readonly width?: 'fixed' | 'fit';
}

export function StatePill({ label, state, width = 'fixed' }: StatePillProps) {
  return (
    <span className="bridge-state-pill" data-state={state} data-width={width === 'fit' ? width : undefined}>
      {label}
    </span>
  );
}
