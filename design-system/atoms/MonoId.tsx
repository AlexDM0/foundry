/**
 * An id in the mono face with tabular figures, as text. Its ink is the tertiary one unless a tone says otherwise, and `compact` sets it in
 * the micro size, for an id on a small pill. Its weight is its surroundings' unless a weight says otherwise.
 */

/**
 * `subtle` the tertiary ink, `muted` the secondary ink, `strong` the primary ink, `link` the link colour, `inherited` the ink of what holds
 * the id.
 */
export type MonoIdTone = 'subtle' | 'muted' | 'strong' | 'link' | 'inherited';

export type MonoIdWeight = 'regular' | 'medium' | 'bold';

export interface MonoIdProps {
  readonly text:     string;
  readonly tone?:    MonoIdTone;
  readonly compact?: boolean;
  /** Absent, the id takes the weight of what holds it. */
  readonly weight?:  MonoIdWeight;
}

export function MonoId({
  text, tone = 'subtle', compact = false, weight
}: MonoIdProps) {
  return (
    <span className="design-system-mono-id" data-tone={tone === 'subtle' ? undefined : tone} data-compact={compact ? '' : undefined} data-weight={weight}>
      {text}
    </span>
  );
}
