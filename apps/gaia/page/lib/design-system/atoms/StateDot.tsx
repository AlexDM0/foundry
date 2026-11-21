/**
 * A state's dot, filled from its tone's row in `tokens.css` and drawn in its shape, round or a diamond: 8px, `small` 7px beside a line of
 * text, `tiny` 6px beside a small one. A change of tone fades from one fill to the next. It is decoration.
 */
import type { StateDotShape, StateTone } from '../@types/StateTone.ts';

interface StateDotLook {
  readonly tone:     StateTone;
  readonly shape?:   StateDotShape;
  /** The dot pulses while the work it stands for is under way. */
  readonly pulsing?: boolean;
}

export type StateDotProps = StateDotLook & (
  | { readonly small?: boolean; readonly tiny?: never }
  | { readonly small?: never; readonly tiny?: boolean }
);

function sizeOf(small: boolean, tiny: boolean): 'small' | 'tiny' | undefined {
  if (small) return 'small';
  return tiny ? 'tiny' : undefined;
}

export function StateDot({
  tone, shape = 'solid', pulsing = false, small = false, tiny = false
}: StateDotProps) {
  return (
    <span
      className="design-system-state-dot"
      data-state-tone={tone}
      data-shape={shape === 'solid' ? undefined : shape}
      data-size={sizeOf(small, tiny)}
      data-pulsing={pulsing ? '' : undefined}
      aria-hidden="true"
    />
  );
}
