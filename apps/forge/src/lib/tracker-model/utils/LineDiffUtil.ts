/**
 * The changed lines between two versions of a document as replace hunks, n original lines becoming m, either side possibly empty, and an
 * anchored line range carried from the older version to the newer one. Line numbers are 1-based, and a range includes both ends.
 */
import type { LineRange } from '../@types/TicketDocument.ts';

/** An empty side starts where its lines would stand: an insert's `originalFromLine` is the original line it goes before. */
export interface LineHunk {
  originalFromLine:    number;
  originalLines:       string[];
  replacementFromLine: number;
  replacementLines:    string[];
}

/** Above this many table cells, the lines between the common head and tail become one hunk, not a search for the longest common run. */
const LINE_DIFF_CELL_LIMIT = 4_000_000;

function linesOf(text: string): string[] {
  return text.split('\n');
}

/** The index pairs of a longest run of equal lines common to both, in order; none when the table would pass the cell limit. */
function matchedIndexPairsOf(originalLines: readonly string[], replacementLines: readonly string[]): (readonly [number, number])[] {
  const originalCount    = originalLines.length;
  const replacementCount = replacementLines.length;
  if ((originalCount + 1) * (replacementCount + 1) > LINE_DIFF_CELL_LIMIT) return [];
  const width = replacementCount + 1;
  const commonRunAfter = new Uint32Array((originalCount + 1) * width);
  for (let originalIndex = originalCount - 1; originalIndex >= 0; originalIndex -= 1) {
    for (let replacementIndex = replacementCount - 1; replacementIndex >= 0; replacementIndex -= 1) {
      const cell = originalIndex * width + replacementIndex;
      commonRunAfter[cell] = originalLines[originalIndex] === replacementLines[replacementIndex]
        ? (commonRunAfter[cell + width + 1] ?? 0) + 1
        : Math.max(commonRunAfter[cell + width] ?? 0, commonRunAfter[cell + 1] ?? 0);
    }
  }
  const pairs: (readonly [number, number])[] = [];
  let originalIndex    = 0;
  let replacementIndex = 0;
  while (originalIndex < originalCount && replacementIndex < replacementCount) {
    const cell = originalIndex * width + replacementIndex;
    if (originalLines[originalIndex] === replacementLines[replacementIndex]) {
      pairs.push([originalIndex, replacementIndex]);
      originalIndex    += 1;
      replacementIndex += 1;
    } else if ((commonRunAfter[cell + width] ?? 0) >= (commonRunAfter[cell + 1] ?? 0)) {
      originalIndex += 1;
    } else {
      replacementIndex += 1;
    }
  }
  return pairs;
}

function hunksOf(originalLines: readonly string[], replacementLines: readonly string[]): LineHunk[] {
  let headCount = 0;
  while (headCount < originalLines.length && headCount < replacementLines.length && originalLines[headCount] === replacementLines[headCount]) headCount += 1;
  let tailCount = 0;
  while (
    tailCount < originalLines.length - headCount
    && tailCount < replacementLines.length - headCount
    && originalLines[originalLines.length - 1 - tailCount] === replacementLines[replacementLines.length - 1 - tailCount]
  ) tailCount += 1;
  const originalMiddle    = originalLines.slice(headCount, originalLines.length - tailCount);
  const replacementMiddle = replacementLines.slice(headCount, replacementLines.length - tailCount);
  const boundaries        = [...matchedIndexPairsOf(originalMiddle, replacementMiddle), [originalMiddle.length, replacementMiddle.length] as const];
  const hunks: LineHunk[] = [];
  let originalIndex    = 0;
  let replacementIndex = 0;
  for (const [matchedOriginalIndex, matchedReplacementIndex] of boundaries) {
    if (matchedOriginalIndex > originalIndex || matchedReplacementIndex > replacementIndex) {
      hunks.push({
        originalFromLine:    headCount + originalIndex + 1,
        originalLines:       originalMiddle.slice(originalIndex, matchedOriginalIndex),
        replacementFromLine: headCount + replacementIndex + 1,
        replacementLines:    replacementMiddle.slice(replacementIndex, matchedReplacementIndex),
      });
    }
    originalIndex    = matchedOriginalIndex + 1;
    replacementIndex = matchedReplacementIndex + 1;
  }
  return hunks;
}

function originalLastLineOf(hunk: Readonly<LineHunk>): number {
  return hunk.originalFromLine + hunk.originalLines.length - 1;
}

/** Where one original line stands in the newer version: a line a hunk replaced stands for the hunk's whole replacement; `null` when deleted. */
function lineRangeAfter(line: number, hunks: readonly Readonly<LineHunk>[]): LineRange | null {
  let offset = 0;
  for (const hunk of hunks) {
    if (line < hunk.originalFromLine) break;
    if (line <= originalLastLineOf(hunk)) {
      if (hunk.replacementLines.length === 0) return null;
      return { from: hunk.replacementFromLine, to: hunk.replacementFromLine + hunk.replacementLines.length - 1 };
    }
    offset += hunk.replacementLines.length - hunk.originalLines.length;
  }
  return { from: line + offset, to: line + offset };
}

function hunkTouches(hunk: Readonly<LineHunk>, placement: Readonly<LineRange>): boolean {
  if (hunk.originalLines.length === 0) return hunk.originalFromLine > placement.from && hunk.originalFromLine <= placement.to;
  return hunk.originalFromLine <= placement.to && originalLastLineOf(hunk) >= placement.from;
}

function whitespaceFolded(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/**
 * An anchored range carried to the newer version, whose lines `replacementLines` are. `null` orphans it: every one of its lines was
 * deleted, or a hunk changed it and its quote no longer occurs in the lines it now spans, whitespace runs read as one space.
 */
function placementAfter(
  placement: Readonly<LineRange>,
  quote: string | null,
  hunks: readonly Readonly<LineHunk>[],
  replacementLines: readonly string[]
): LineRange | null {
  const ranges: LineRange[] = [];
  for (let line = placement.from; line <= placement.to; line += 1) {
    const range = lineRangeAfter(line, hunks);
    if (range !== null) ranges.push(range);
  }
  if (ranges.length === 0) return null;
  const after = { from: Math.min(...ranges.map((range) => range.from)), to: Math.max(...ranges.map((range) => range.to)) };
  const changed = hunks.some((hunk) => hunkTouches(hunk, placement));
  if (!changed || quote === null) return after;
  const spannedText = whitespaceFolded(replacementLines.slice(after.from - 1, after.to).join('\n'));
  return spannedText.includes(whitespaceFolded(quote)) ? after : null;
}

export const LineDiffUtil = Object.freeze({
  linesOf, hunksOf, lineRangeAfter, placementAfter
});
