/**
 * A card that stands out from the text around it: `state` is tinted in a display state's colours, such as a ticket's state card; `warn` is
 * a surface with a warn rule down its left edge, such as a quoted reason. Its title, when given, heads it.
 */
import type { ReactNode } from 'react';

import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

export type CalloutTone = 'state' | 'warn';

export interface CalloutProps {
  readonly tone:     CalloutTone;
  /** The state whose colours a `state` callout takes; ignored for the warn tone. */
  readonly state?:   DisplayState;
  readonly title?:   string;
  readonly children: ReactNode;
}

export function Callout({
  tone, state, title, children
}: CalloutProps) {
  return (
    <div className="bridge-callout" data-tone={tone} data-state={tone === 'state' ? state : undefined}>
      {title === undefined ? null : <h3 className="bridge-callout-title">{title}</h3>}
      {children}
    </div>
  );
}
