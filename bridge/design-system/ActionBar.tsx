/** The footer bar of a screen: what the screen is doing at its start, its actions at its end. */
import type { ReactNode } from 'react';

export interface ActionBarProps {
  /** The bar's accessible name. */
  readonly label: string;
  readonly start: ReactNode;
  readonly end:   ReactNode;
}

export function ActionBar({ label, start, end }: ActionBarProps) {
  return (
    <section className="bridge-action-bar" aria-label={label}>
      <div className="bridge-action-bar-start">{start}</div>
      <div className="bridge-action-bar-end">{end}</div>
    </section>
  );
}
