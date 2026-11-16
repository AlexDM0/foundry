/**
 * A run of text in one role of the type scale, with adjective flags for weight, ink, font and alignment. The element is the caller's
 * choice, never the role's: a page-sized name can be an `h2` on one page and a `span` in a card. `muted` and `subtle` are two inks, so they
 * exclude each other in the props type.
 */
import type { ReactNode } from 'react';

import type { SpacingStep } from '../constants/Spacing.ts';
import { SpacingStyleUtil } from '../utils/SpacingStyleUtil.ts';

/** The roles of the type scale: the first four are set in the display face, the rest in the interface face. */
export type TypeRole = 'display' | 'phase' | 'page' | 'section' | 'title' | 'lead' | 'body' | 'tab' | 'small' | 'pill' | 'micro';

export type TextElement = 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/** Secondary ink (`muted`) or tertiary ink (`subtle`), never both. */
type InkFlags = { readonly muted?: boolean; readonly subtle?: never } | { readonly subtle?: boolean; readonly muted?: never };

export type TextProps = InkFlags & {
  readonly typeRole?:     TypeRole;
  /** A heading level or a paragraph; a span by default. */
  readonly element?:      TextElement;
  readonly bold?:         boolean;
  readonly mono?:         boolean;
  readonly struck?:       boolean;
  readonly centered?:     boolean;
  readonly marginTop?:    SpacingStep;
  readonly marginBottom?: SpacingStep;
  readonly id?:           string;
  readonly children:      ReactNode;
};

const flagAttribute = (isSet: boolean | undefined) => (isSet === true ? '' : undefined);

export function Text(props: TextProps) {
  const {
    typeRole = 'body', element: Element = 'span', id, children
  } = props;
  const ink = props.muted === true ? 'muted' : props.subtle === true ? 'subtle' : undefined;
  return (
    <Element
      className="design-system-text"
      id={id}
      data-type-role={typeRole}
      data-ink={ink}
      data-bold={flagAttribute(props.bold)}
      data-mono={flagAttribute(props.mono)}
      data-struck={flagAttribute(props.struck)}
      data-centered={flagAttribute(props.centered)}
      style={SpacingStyleUtil.marginStyleOf(props)}
    >
      {children}
    </Element>
  );
}
