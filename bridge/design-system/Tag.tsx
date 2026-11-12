/**
 * A small tinted chip of text: a status, a warning, a quiet fact. Its tone picks its colours (neutral, a display state's, warn or error),
 * dashed draws its edge dashed, and it leads with a state dot or a glyph, both hidden from the accessibility tree; while busy a turning ring
 * takes the glyph's place. A change colours it as changed, new or removed (removed struck through), and `pops` lets it pop in. With `href`
 * it is a link, with `onPress` a button, and otherwise plain text.
 */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

import { StateDot } from './StateDot.tsx';

export type TagTone = 'neutral' | 'state' | 'warn' | 'error';

export type TagGlyph = 'warning' | 'stopwatch' | 'check' | 'plus';

export type TagChange = 'changed' | 'new' | 'removed';

const GLYPH_PATH: Readonly<Record<TagGlyph, string>> = Object.freeze({
  warning:   'M8 2.5l6 11H2z M8 6.5v3.5 M8 11.6v0.4',
  stopwatch: 'M13.2 9.2a5.2 5.2 0 1 1-10.4 0a5.2 5.2 0 1 1 10.4 0z M8 9.2V6.4 M6.4 1.8h3.2',
  check:     'M3 8.5l3.2 3.2L13 4.5',
  plus:      'M8 3v10 M3 8h10',
});

export interface TagProps {
  readonly text:     string;
  readonly tone:     TagTone;
  /** The state whose colours a `state` tag takes, and whose fill its dot takes. */
  readonly state?:   DisplayState;
  /** A state dot before the text; it needs `state`. */
  readonly dot?:     boolean;
  readonly dashed?:  boolean;
  readonly glyph?:   TagGlyph;
  /** Work under way: a turning ring in the glyph's place. */
  readonly busy?:    boolean;
  readonly change?:  TagChange;
  /** Pops in when it first shows. */
  readonly pops?:    boolean;
  readonly href?:    string;
  readonly onPress?: () => void;
  readonly title?:   string;
}

export function Tag({
  text, tone, state, dot = false, dashed = false, glyph, busy = false, change, pops = false, href, onPress, title
}: TagProps) {
  const tagAttributes = {
    title,
    'data-tone':   tone,
    'data-state':  tone === 'state' ? state : undefined,
    'data-dashed': dashed ? '' : undefined,
    'data-busy':   busy ? '' : undefined,
    'data-change': change,
    'data-pops':   pops ? '' : undefined,
  };
  const content = (
    <>
      {busy ? <span className="bridge-tag-spinner" aria-hidden="true" /> : null}
      {busy || glyph === undefined ? null : (
        <svg className="bridge-tag-glyph" viewBox="0 0 16 16" aria-hidden="true">
          <path d={GLYPH_PATH[glyph]} />
        </svg>
      )}
      {dot && state !== undefined ? <StateDot state={state} /> : null}
      {text}
    </>
  );
  if (href !== undefined) return <a className="bridge-tag" href={href} {...tagAttributes}>{content}</a>;
  if (onPress !== undefined) return <button type="button" className="bridge-tag" onClick={onPress} {...tagAttributes}>{content}</button>;
  return <span className="bridge-tag" {...tagAttributes}>{content}</span>;
}
