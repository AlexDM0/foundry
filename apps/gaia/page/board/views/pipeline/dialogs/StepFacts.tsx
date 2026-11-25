/** A step dialog's facts box, such as when the step runs: its lines on the page ground, inside a hairline edge. */
import type { ReactNode } from 'react';

export interface StepFactsProps {
  readonly children: ReactNode;
}

export function StepFacts({ children }: StepFactsProps) {
  return <div className="board-pipeline-dialog-facts">{children}</div>;
}
