/**
 * A card that stands out from the text around it: `state` is tinted in a state tone's colours, such as the card of an item's state; `warn` is
 * a surface with a warn rule down its left edge, such as a quoted reason, or with `tinted` the warn tint with a 4px left edge, such as a
 * held item; `error` is the failure tint with a 4px left edge; `neutral` is a plain surface, `dashed` for what is only incomplete. Its title,
 * when given, heads it, as an `h3` unless the screen picks another element; its actions, when given, sit at the end of its line.
 */
import type { ReactNode } from 'react';

import type { StateTone } from '../@types/StateTone.ts';

import { Text, type TextElement } from '../atoms/Text.tsx';

export type CalloutTone = 'state' | 'warn' | 'error' | 'neutral';

/**
 * A `state` callout takes the colours of its state tone; every other tone has colours of its own, so it takes none. Only a `warn` callout
 * can be `tinted`, and only a `neutral` one `dashed`.
 */
type CalloutColours =
  | { readonly tone: 'state'; readonly stateTone: StateTone; readonly tinted?: never; readonly dashed?: never }
  | { readonly tone: 'warn'; readonly stateTone?: never; readonly tinted?: boolean; readonly dashed?: never }
  | { readonly tone: 'error'; readonly stateTone?: never; readonly tinted?: never; readonly dashed?: never }
  | { readonly tone: 'neutral'; readonly stateTone?: never; readonly tinted?: never; readonly dashed?: boolean };

export type CalloutProps = CalloutColours & {
  readonly title?:        string;
  /** The title's heading level, chosen by the screen; an `h3` by default. */
  readonly titleElement?: TextElement;
  /** Controls at the end of the callout's line, such as its buttons. */
  readonly actions?:      ReactNode;
  readonly children:      ReactNode;
};

const flagAttribute = (isSet: boolean | undefined) => (isSet === true ? '' : undefined);

export function Callout({
  tone, stateTone, tinted, dashed, title, titleElement = 'h3', actions, children
}: CalloutProps) {
  const heading = title === undefined ? null : <Text typeRole="title" element={titleElement} marginBottom="two">{title}</Text>;
  const lookAttributes = {
    'data-tone':       tone,
    'data-state-tone': stateTone,
    'data-tinted':     flagAttribute(tinted),
    'data-dashed':     flagAttribute(dashed),
  };
  if (actions === undefined) {
    return (
      <div className="design-system-callout" {...lookAttributes}>
        {heading}
        {children}
      </div>
    );
  }
  return (
    <div className="design-system-callout" data-with-actions="" {...lookAttributes}>
      <div className="design-system-callout-body">
        {heading}
        {children}
      </div>
      <div className="design-system-callout-actions">{actions}</div>
    </div>
  );
}
