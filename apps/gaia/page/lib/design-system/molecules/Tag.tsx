/**
 * A small tinted chip of text: a status, a warning, a quiet fact. Its tone picks its colours (neutral, a state tone's, warn or error),
 * dashed draws its edge dashed, and it leads with a state dot or a glyph, both hidden from the accessibility tree; while busy a turning ring
 * takes the glyph's place. A change colours it as changed, new or removed (removed struck through), and `pops` lets it pop in. With `href`
 * it is a link, with `onPress` a button, and otherwise plain text. `chip` draws it as a 24px chip on the surface with a hairline edge rather
 * than a pill, such as an item's link.
 */
import type { StateDotShape, StateTone } from '../@types/StateTone.ts';

import { Icon, type IconName } from '../atoms/Icon.tsx';
import { StateDot }            from '../atoms/StateDot.tsx';

export type TagTone = 'neutral' | 'state' | 'warn' | 'error';

export type TagGlyph = 'warning' | 'stopwatch' | 'check' | 'plus';

export type TagChange = 'changed' | 'new' | 'removed';

const GLYPH_ICON: Readonly<Record<TagGlyph, IconName>> = Object.freeze({
  warning:   'exclamation-triangle',
  stopwatch: 'stopwatch',
  check:     'check',
  plus:      'plus',
});

/**
 * A `state` tag takes the colours of its state tone, and a dot takes its fill, so both need `stateTone`; another tone has colours of its
 * own and takes a state tone only for its dot.
 */
export type TagColours =
  | { readonly tone: TagTone; readonly stateTone: StateTone; readonly dot?: boolean; readonly dotShape?: StateDotShape }
  | { readonly tone: Exclude<TagTone, 'state'>; readonly stateTone?: never; readonly dot?: false; readonly dotShape?: never };

/** A glyph leads the text, or while busy a turning ring does: never both. */
export type TagLead =
  | { readonly glyph?: TagGlyph; readonly busy?: false }
  | { readonly busy: true; readonly glyph?: never };

/** A link or a button, never both. */
export type TagAction =
  | { readonly href?: string; readonly onPress?: never }
  | { readonly onPress?: () => void; readonly href?: never };

export type TagProps = TagColours & TagLead & TagAction & {
  readonly text:    string;
  readonly dashed?: boolean;
  /** A 24px chip on the surface with a hairline edge and the small radius, rather than the 20px pill. */
  readonly chip?:   boolean;
  readonly change?: TagChange;
  /** Pops in when it first shows. */
  readonly pops?:   boolean;
  readonly title?:  string;
};

export function Tag({
  text, tone, stateTone, dot = false, dotShape = 'solid', dashed = false, chip = false, glyph, busy = false, change, pops = false, href, onPress,
  title
}: TagProps) {
  const tagAttributes = {
    title,
    'data-tone':       tone,
    'data-state-tone': tone === 'state' ? stateTone : undefined,
    'data-dashed':     dashed ? '' : undefined,
    'data-chip':       chip ? '' : undefined,
    'data-busy':       busy ? '' : undefined,
    'data-change':     change,
    'data-pops':       pops ? '' : undefined,
  };
  const content = (
    <>
      {busy ? <span className="design-system-tag-spinner" aria-hidden="true" /> : null}
      {glyph === undefined ? null : (
        <span className="design-system-tag-glyph"><Icon name={GLYPH_ICON[glyph]} label={null} /></span>
      )}
      {dot && stateTone !== undefined ? <StateDot tone={stateTone} shape={dotShape} /> : null}
      {text}
    </>
  );
  if (href !== undefined) return <a className="design-system-tag" href={href} {...tagAttributes}>{content}</a>;
  if (onPress !== undefined) return <button type="button" className="design-system-tag" onClick={onPress} {...tagAttributes}>{content}</button>;
  return <span className="design-system-tag" {...tagAttributes}>{content}</span>;
}
