/**
 * One thing running now, as a link to it: a live dot for a step an agent runs or a spinner for a check, its mono id, the step, an optional
 * meter and the time it has run. A hover changes only the background.
 */
import type { ReactNode } from 'react';

export interface ActivityRowProps {
  readonly href:     string;
  readonly status:   'step' | 'check';
  readonly idText:   string;
  readonly stepText: string;
  readonly meter?:   ReactNode;
  readonly elapsed:  string;
}

export function ActivityRow({
  href, status, idText, stepText, meter, elapsed
}: ActivityRowProps) {
  return (
    <a className="bridge-activity-row" href={href} data-status={status}>
      <span className="bridge-activity-row-mark" aria-hidden="true" />
      <span className="bridge-activity-row-id">{idText}</span>
      <span className="bridge-activity-row-step">{stepText}</span>
      {meter}
      <span className="bridge-activity-row-elapsed">{elapsed}</span>
    </a>
  );
}
