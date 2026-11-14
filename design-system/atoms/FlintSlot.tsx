/**
 * The place where Flint, the mascot sprite, stands: a square box that centres the placeholder drawing, sized by `size` and grounded
 * by `ground`. The drawing reads its colours from the theme. `pose` is carried as `data-flint-pose` for the character that replaces the
 * placeholder; the placeholder draws every pose the same.
 */
export type FlintSlotSize = '112' | '100' | '98' | '84' | '76';

export type FlintSlotGround = 'page' | 'strip' | 'lane' | 'decision' | 'plain';

export type FlintPose = 'idle' | 'waving' | 'typing' | 'thinking' | 'waiting' | 'happy' | 'reviewing';

/** The sprite's side in CSS pixels for each box size. */
const SPRITE_SIZE_OF_SLOT: Readonly<Record<FlintSlotSize, number>> = Object.freeze({
  112: 84,
  100: 74,
  98:  74,
  84:  62,
  76:  56,
});

export interface FlintSlotProps {
  /** The slot's accessible name; `null` hides it, beside text that already says what Flint is doing. */
  readonly label:   string | null;
  readonly size?:   FlintSlotSize;
  readonly ground?: FlintSlotGround;
  readonly pose?:   FlintPose;
}

export function FlintSlot({
  label, size = '100', ground = 'page', pose = 'idle'
}: FlintSlotProps) {
  const accessibility = label === null ? { 'aria-hidden': true } : { 'role': 'img', 'aria-label': label };
  const spriteSize = SPRITE_SIZE_OF_SLOT[size];
  return (
    <div className="design-system-flint-slot" data-size={size} data-ground={ground} data-flint-pose={pose} {...accessibility}>
      <svg className="design-system-flint-sprite" viewBox="-31.2 -50 62.5 62.5" width={spriteSize} height={spriteSize} aria-hidden="true">
        <ellipse className="design-system-flint-shadow" cx="0" cy="10" rx="13" ry="2.5" />
        <path className="design-system-flint-body" d="M0 -50 L20 -24 L0 0 L-20 -24Z" />
        <rect className="design-system-flint-eye" x="-4" y="-30" width="4" height="8" />
        <rect className="design-system-flint-eye" x="5" y="-30" width="4" height="8" />
      </svg>
    </div>
  );
}
