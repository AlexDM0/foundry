/**
 * The arithmetic of the fill and slot meters: how far a fill bar reaches, and which cells a slot meter draws. A count below zero counts as
 * zero, so a meter never draws backwards.
 */
export type SlotCell = 'filled' | 'empty' | 'over';

const FULL_PERCENT = 100;

/** How far `used` reaches into `limit`, as a percent clamped to 0..100; 0 for a limit of zero or less, which nothing can fill. */
function fillPercentOf(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(FULL_PERCENT, Math.max(0, (used / limit) * FULL_PERCENT));
}

/** `limit` cells, the first `filled` of them filled, then one `over` cell for each filled past the limit. */
function slotCellsOf(filled: number, limit: number): readonly SlotCell[] {
  const cellCount = Math.max(0, Math.floor(limit));
  const filledCount = Math.max(0, Math.floor(filled));
  const filledWithinLimit = Math.min(filledCount, cellCount);
  return [
    ...Array.from({ length: filledWithinLimit }, (): SlotCell => 'filled'),
    ...Array.from({ length: cellCount - filledWithinLimit }, (): SlotCell => 'empty'),
    ...Array.from({ length: filledCount - filledWithinLimit }, (): SlotCell => 'over'),
  ];
}

export const MeterUtil = Object.freeze({ fillPercentOf, slotCellsOf });
