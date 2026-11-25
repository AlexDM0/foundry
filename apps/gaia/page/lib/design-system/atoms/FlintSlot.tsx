/**
 * The place where Flint, the mascot sprite, stands: an empty box, sized by `size` and grounded by `ground`. The box draws no sprite: the
 * host places its sprite in the element that `slotRef` gives it. Each size is at least 50px on a side, the smallest place the sprite fits;
 * `60x50`, a strip's, is 60 wide and 50 high, the 10px beyond a square the room in front of the sprite for its gestures.
 */
import type { Ref } from 'react';

export type FlintSlotSize = '112' | '100' | '60x50';

export type FlintSlotGround = 'page' | 'strip' | 'lane' | 'decision' | 'plain';

export interface FlintSlotProps {
  /** The slot's accessible name; `null` hides it, beside text that already says what Flint is doing. */
  readonly label:    string | null;
  readonly size?:    FlintSlotSize;
  readonly ground?:  FlintSlotGround;
  /** The box's element, for the host that places the sprite in it. */
  readonly slotRef?: Ref<HTMLDivElement>;
}

export function FlintSlot({
  label, size = '100', ground = 'page', slotRef
}: FlintSlotProps) {
  const accessibility = label === null ? { 'aria-hidden': true } : { 'role': 'img', 'aria-label': label };
  return <div className="design-system-flint-slot" data-size={size} data-ground={ground} ref={slotRef} {...accessibility} />;
}
