/**
 * A state's badge, a pill tinted, edged and inked by its tone's row in `tokens.css`, led by a dot in the given shape and, when checked,
 * ended by a check; both are decoration. The quiet palette gives a table row's badge its quieter colours. `fitted` drops the column width
 * that lines badges up, and `shrinkable` lets the badge narrow inside a full row.
 */
import type { StateDotShape, StateTone } from '../@types/StateTone.ts';

import { Icon } from '../atoms/Icon.tsx';

export interface StateBadgeProps {
  readonly tone:        StateTone;
  readonly label:       string;
  readonly palette?:    'standard' | 'quiet';
  readonly dotShape?:   StateDotShape;
  readonly dashed?:     boolean;
  readonly struck?:     boolean;
  readonly checked?:    boolean;
  /** The dot pulses while the work it stands for is under way. */
  readonly pulsing?:    boolean;
  /** Compact is a row's badge: shorter, and only as wide as its word. */
  readonly size?:       'standard' | 'compact';
  /** Only as wide as its word, at the standard height: a badge in a column that need not line up. */
  readonly fitted?:     boolean;
  /** Gives way to its row: it narrows when the row runs out of room, and its word ends in an ellipsis. */
  readonly shrinkable?: boolean;
  readonly title?:      string;
}

export function StateBadge({
  tone, label, palette = 'standard', dotShape = 'solid', dashed = false, struck = false, checked = false, pulsing = false, size = 'standard',
  fitted = false, shrinkable = false, title
}: StateBadgeProps) {
  return (
    <span
      className="design-system-state-badge"
      data-state-tone={tone}
      data-palette={palette === 'quiet' ? palette : undefined}
      data-dot-shape={dotShape === 'solid' ? undefined : dotShape}
      data-dashed={dashed ? '' : undefined}
      data-struck={struck ? '' : undefined}
      data-pulsing={pulsing ? '' : undefined}
      data-size={size === 'compact' ? size : undefined}
      data-fitted={fitted ? '' : undefined}
      data-shrinkable={shrinkable ? '' : undefined}
      title={title}
    >
      <span className="design-system-state-badge-dot" aria-hidden="true" />
      <span className="design-system-state-badge-label">{label}</span>
      {checked
        ? (
          <span className="design-system-state-badge-check"><Icon name="check" label={null} /></span>
        )
        : null}
    </span>
  );
}
