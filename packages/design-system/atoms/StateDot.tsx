/**
 * A state's dot, filled from its tone's row in `tokens.css` and drawn in its shape, round or a diamond: 8px, `small` 7px beside a line of
 * text, `tiny` 6px beside a small one. It is decoration.
 */
import type { StateDotShape, StateTone } from '../@types/StateTone.ts';

interface StateDotLook {
  readonly tone:   StateTone;
  readonly shape?: StateDotShape;
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
  tone, shape = 'solid', small = false, tiny = false
}: StateDotProps) {
  return (
    <span
      className="design-system-state-dot"
      data-state-tone={tone}
      data-shape={shape === 'solid' ? undefined : shape}
      data-size={sizeOf(small, tiny)}
      aria-hidden="true"
    />
  );
}
