/**
 * A small tinted chip of text: a status, a warning, a quiet fact. Its tone picks its colours (neutral, a display state's, warn or error),
 * dashed draws its edge dashed, and it leads with a state dot or a glyph, both hidden from the accessibility tree. With `href` it is a link,
 * with `onPress` a button, and otherwise plain text.
 */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

import { StateDot } from './StateDot.tsx';

export type TagTone = 'neutral' | 'state' | 'warn' | 'error';

export type TagGlyph = 'warning';

const GLYPH_PATH: Readonly<Record<TagGlyph, string>> = { warning: 'M8 2.5l6 11H2z M8 6.5v3.5 M8 11.6v0.4' };

export interface TagProps {
  readonly text:     string;
  readonly tone:     TagTone;
  /** The state whose colours a `state` tag takes, and whose fill its dot takes. */
  readonly state?:   DisplayState;
  /** A state dot before the text; it needs `state`. */
  readonly dot?:     boolean;
  readonly dashed?:  boolean;
  readonly glyph?:   TagGlyph;
  readonly href?:    string;
  readonly onPress?: () => void;
  readonly title?:   string;
}

export function Tag({
  text, tone, state, dot = false, dashed = false, glyph, href, onPress, title
}: TagProps) {
  const tagAttributes = {
    title,
    'data-tone':   tone,
    'data-state':  tone === 'state' ? state : undefined,
    'data-dashed': dashed ? '' : undefined,
  };
  const content = (
    <>
      {glyph === undefined ? null : (
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
