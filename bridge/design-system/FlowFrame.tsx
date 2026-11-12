/**
 * A labelled frame around a run of flow nodes that belong together, such as a merge train: a group named by its label, which it also shows
 * as small capitals at its top.
 */
import type { ReactNode } from 'react';

export interface FlowFrameProps {
  readonly label:    string;
  readonly children: ReactNode;
}

export function FlowFrame({ label, children }: FlowFrameProps) {
  return (
    <div className="bridge-flow-frame" role="group" aria-label={label}>
      <span className="bridge-flow-frame-label" aria-hidden="true">{label}</span>
      {children}
    </div>
  );
}
