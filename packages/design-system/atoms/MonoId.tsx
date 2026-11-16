/**
 * An id in the mono face with tabular figures, as text. Its ink is the tertiary one unless a tone says otherwise, and its size the small one
 * unless a size says otherwise; `compact` is the micro size, for an id on a small pill. Its weight is its surroundings' unless a weight says
 * otherwise.
 */

/**
 * `subtle` the tertiary ink, `muted` the secondary ink, `strong` the primary ink, `link` the link colour, `inherited` the ink of what holds
 * the id.
 */
export type MonoIdTone = 'subtle' | 'muted' | 'strong' | 'link' | 'inherited';

export type MonoIdWeight = 'regular' | 'medium' | 'bold';

/** `small` the small type size, `pill` the pill's, a little smaller, `micro` the smallest. */
export type MonoIdSize = 'small' | 'pill' | 'micro';

/** `compact` is the micro size by its older name: a size or `compact`, never both. */
export type MonoIdScale =
  | { readonly size?: MonoIdSize; readonly compact?: never }
  | { readonly compact?: boolean; readonly size?: never };

export type MonoIdProps = MonoIdScale & {
  readonly text:    string;
  readonly tone?:   MonoIdTone;
  /** Absent, the id takes the weight of what holds it. */
  readonly weight?: MonoIdWeight;
};

export function MonoId({
  text, tone = 'subtle', compact = false, size, weight
}: MonoIdProps) {
  const sizeShown: MonoIdSize = compact ? 'micro' : size ?? 'small';
  return (
    <span
      className="design-system-mono-id"
      data-tone={tone === 'subtle' ? undefined : tone}
      data-size={sizeShown === 'small' ? undefined : sizeShown}
      data-weight={weight}
    >
      {text}
    </span>
  );
}
