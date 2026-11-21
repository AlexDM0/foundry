/**
 * The index arithmetic of a reorderable list: the order a move gives, where a dragged row lands under the pointer, how far a move may go
 * inside the row's band, and how the rows between shift. A band is a run of rows that share a band name; a row never leaves its own.
 */

/** A row's box on the vertical axis, in client pixels, measured once when a drag starts. */
export interface RowBox {
  readonly top:    number;
  readonly height: number;
}

/** Which way a row slides to make room for the dragged row: `up`, `down` or not at all. */
export type RowShift = 'up' | 'down' | null;

/** The original indices in the order that moving the row at `fromIndex` to `toIndex` gives. */
function reorderedIndicesOf(count: number, fromIndex: number, toIndex: number): number[] {
  const indices = Array.from({ length: count }, (_unused, index) => index);
  const [movedIndex] = indices.splice(fromIndex, 1);
  if (movedIndex === undefined) return indices;
  indices.splice(toIndex, 0, movedIndex);
  return indices;
}

/** The index the dragged row lands at with the pointer at `pointerY`: one past every other row whose middle is above the pointer. */
function dropIndexAt(pointerY: number, rowBoxes: readonly RowBox[], fromIndex: number): number {
  return rowBoxes.filter((box, index) => index !== fromIndex && box.top + box.height / 2 < pointerY).length;
}

/** `toIndex` held inside the run of rows that share the band of the row at `fromIndex`. */
function clampedToBand(bands: readonly (string | undefined)[], fromIndex: number, toIndex: number): number {
  const band = bands[fromIndex];
  let firstIndex = fromIndex;
  while (firstIndex > 0 && bands[firstIndex - 1] === band) firstIndex -= 1;
  let lastIndex = fromIndex;
  while (lastIndex < bands.length - 1 && bands[lastIndex + 1] === band) lastIndex += 1;
  return Math.min(lastIndex, Math.max(firstIndex, toIndex));
}

/** How the row at `index` slides while the row at `fromIndex` is dragged to `toIndex`: the rows it passes move into its place. */
function shiftOf(index: number, fromIndex: number, toIndex: number): RowShift {
  if (toIndex > fromIndex && index > fromIndex && index <= toIndex) return 'up';
  if (toIndex < fromIndex && index < fromIndex && index >= toIndex) return 'down';
  return null;
}

/** How far a passed row slides: the dragged row's height and the gap that follows it (or comes before it, for the last row). */
function slotSpanOf(rowBoxes: readonly RowBox[], fromIndex: number): number {
  const draggedBox = rowBoxes[fromIndex];
  if (draggedBox === undefined) return 0;
  const neighbourBox = rowBoxes[fromIndex + 1] ?? rowBoxes[fromIndex - 1];
  if (neighbourBox === undefined) return draggedBox.height;
  const gap = neighbourBox.top > draggedBox.top
    ? neighbourBox.top - (draggedBox.top + draggedBox.height)
    : draggedBox.top - (neighbourBox.top + neighbourBox.height);
  return draggedBox.height + Math.max(0, gap);
}

/** Where the drop line sits, in pixels below the first row's top: the edge of the landing row the dragged row passes; `null` for no move. */
function dropLineOffsetOf(rowBoxes: readonly RowBox[], fromIndex: number, toIndex: number): number | null {
  const firstBox = rowBoxes[0];
  const landingBox = rowBoxes[toIndex];
  if (toIndex === fromIndex || firstBox === undefined || landingBox === undefined) return null;
  const edge = toIndex < fromIndex ? landingBox.top : landingBox.top + landingBox.height;
  return edge - firstBox.top;
}

export const ReorderIndexUtil = Object.freeze({
  reorderedIndicesOf, dropIndexAt, clampedToBand, shiftOf, slotSpanOf, dropLineOffsetOf
});
