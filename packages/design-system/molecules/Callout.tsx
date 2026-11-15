/**
 * A card that stands out from the text around it: `state` is tinted in a state tone's colours, such as the card of an item's state; `warn` is
 * a surface with a warn rule down its left edge, such as a quoted reason. Its title, when given, heads it, as an `h3` unless the screen picks
 * another element.
 */
import type { ReactNode } from 'react';

import type { StateTone } from '../@types/StateTone.ts';

import { Text, type TextElement } from '../atoms/Text.tsx';

export type CalloutTone = 'state' | 'warn';

/** A `state` callout takes the colours of its state tone; a `warn` callout has colours of its own, so it takes none. */
type CalloutColours = { readonly tone: 'state'; readonly stateTone: StateTone } | { readonly tone: 'warn'; readonly stateTone?: never };

export type CalloutProps = CalloutColours & {
  readonly title?:        string;
  /** The title's heading level, chosen by the screen; an `h3` by default. */
  readonly titleElement?: TextElement;
  readonly children:      ReactNode;
};

export function Callout({
  tone, stateTone, title, titleElement = 'h3', children
}: CalloutProps) {
  return (
    <div className="design-system-callout" data-tone={tone} data-state-tone={stateTone}>
      {title === undefined ? null : <Text typeRole="title" element={titleElement} marginBottom="two">{title}</Text>}
      {children}
    </div>
  );
}
