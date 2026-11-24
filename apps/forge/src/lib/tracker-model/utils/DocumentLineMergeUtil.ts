/**
 * Line changes of a ticket document carried onto newer text: a three-way merge of a person's text made on an older version with the head,
 * and an agent's line edits made on an older version mapped onto the head, each applying only where the lines it changes still stand.
 * Line numbers are 1-based, and a range includes both ends.
 */
import type { LineEdit } from '../@types/TicketDocument.ts';
import type { LineHunk } from './LineDiffUtil.ts';
import { LineDiffUtil }  from './LineDiffUtil.ts';

/**
 * `overriddenHeadHunks` are the head's changes that overlapped the person's and gave way to them, in the base's numbering; empty when no
 * change overlapped.
 */
export interface LineMerge {
  mergedLines:         string[];
  overriddenHeadHunks: LineHunk[];
}

interface SidedHunk {
  side:  'head' | 'person';
  hunk:  LineHunk;
  /** The base lines it changes as 0-based indexes, `end` excluded; equal for an insert. */
  start: number;
  end:   number;
}

function sidedHunkOf(side: SidedHunk['side'], hunk: LineHunk): SidedHunk {
  const start = hunk.originalFromLine - 1;
  return {
    side, hunk, start, end: start + hunk.originalLines.length
  };
}

/** Two changes overlap when they change a common base line, or both insert at one place, or one inserts at the other's first line. */
function hunksOverlap(first: Readonly<SidedHunk>, second: Readonly<SidedHunk>): boolean {
  if (first.start < second.end && second.start < first.end) return true;
  return first.start === second.start && (first.start === first.end || second.start === second.end);
}

function hunksAreEqual(first: Readonly<LineHunk>, second: Readonly<LineHunk>): boolean {
  return first.originalFromLine === second.originalFromLine
    && first.originalLines.length === second.originalLines.length
    && first.replacementLines.length === second.replacementLines.length
    && first.replacementLines.every((line, index) => line === second.replacementLines[index]);
}

/** The changes in base order, each run of overlapping ones as one cluster. */
function clustersOf(sidedHunks: readonly SidedHunk[]): SidedHunk[][] {
  const ordered = [...sidedHunks].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters: SidedHunk[][] = [];
  for (const sidedHunk of ordered) {
    const lastCluster = clusters.at(-1);
    if (lastCluster !== undefined && lastCluster.some((clustered) => hunksOverlap(clustered, sidedHunk))) lastCluster.push(sidedHunk);
    else clusters.push([sidedHunk]);
  }
  return clusters;
}

/** The base lines from `start` to `end` with the given changes, which all lie inside them, applied. */
function linesWithHunksApplied(baseLines: readonly string[], start: number, end: number, sidedHunks: readonly SidedHunk[]): string[] {
  const lines: string[] = [];
  let index = start;
  for (const sidedHunk of [...sidedHunks].sort((a, b) => a.start - b.start)) {
    lines.push(...baseLines.slice(index, sidedHunk.start), ...sidedHunk.hunk.replacementLines);
    index = sidedHunk.end;
  }
  lines.push(...baseLines.slice(index, end));
  return lines;
}

/**
 * The head and the person's text, both made from the base, merged: every change that overlaps no change of the other side applies, a change
 * both made alike applies once, and where the two overlap the person's text wins and the head's change is returned as overridden.
 */
function mergeOf(baseLines: readonly string[], headLines: readonly string[], personLines: readonly string[]): LineMerge {
  const sidedHunks = [
    ...LineDiffUtil.hunksOf(baseLines, headLines).map((hunk) => sidedHunkOf('head', hunk)),
    ...LineDiffUtil.hunksOf(baseLines, personLines).map((hunk) => sidedHunkOf('person', hunk)),
  ];
  const mergedLines: string[]          = [];
  const overriddenHeadHunks: LineHunk[] = [];
  let index = 0;
  for (const cluster of clustersOf(sidedHunks)) {
    const start = Math.min(...cluster.map((sidedHunk) => sidedHunk.start));
    const end   = Math.max(...cluster.map((sidedHunk) => sidedHunk.end));
    const headHunks   = cluster.filter((sidedHunk) => sidedHunk.side === 'head');
    const personHunks = cluster.filter((sidedHunk) => sidedHunk.side === 'person');
    const [onlyHeadHunk]   = headHunks;
    const [onlyPersonHunk] = personHunks;
    const madeAlike = headHunks.length === 1 && personHunks.length === 1 && onlyHeadHunk !== undefined && onlyPersonHunk !== undefined
      && hunksAreEqual(onlyHeadHunk.hunk, onlyPersonHunk.hunk);
    const winningHunks = personHunks.length === 0 || madeAlike ? headHunks : personHunks;
    if (!madeAlike && personHunks.length > 0) overriddenHeadHunks.push(...headHunks.map((sidedHunk) => sidedHunk.hunk));
    mergedLines.push(...baseLines.slice(index, start), ...linesWithHunksApplied(baseLines, start, end, winningHunks));
    index = end;
  }
  mergedLines.push(...baseLines.slice(index));
  return { mergedLines, overriddenHeadHunks };
}

function linesStandAt(lines: readonly string[], fromLine: number, expectedLines: readonly string[]): boolean {
  if (fromLine < 1 || fromLine - 1 + expectedLines.length > lines.length) return false;
  return expectedLines.every((expectedLine, offset) => lines[fromLine - 1 + offset] === expectedLine);
}

function editIsWellFormed(edit: Readonly<LineEdit>): boolean {
  return Number.isSafeInteger(edit.fromLine) && Number.isSafeInteger(edit.toLine) && edit.fromLine >= 1
    && edit.toLine - edit.fromLine + 1 === edit.originalLines.length;
}

/** No two edits change a common line or insert at one place. */
function editsAreApart(edits: readonly Readonly<LineEdit>[]): boolean {
  const ordered = [...edits].sort((a, b) => a.fromLine - b.fromLine);
  return ordered.every((edit, index) => {
    const next = ordered[index + 1];
    return next === undefined || (edit.toLine < next.fromLine && !(edit.fromLine === next.fromLine && edit.toLine < edit.fromLine));
  });
}

/**
 * The edits, made on `baseLines`, carried onto `headLines`: each edit's start moves by the lines the changes wholly before it added or
 * removed. `null` when an edit is malformed, two edits meet, or an edit's original lines do not stand on the base or at its place on the
 * head, which a change of the head to those lines brings about.
 */
function editsOnHeadOf(baseLines: readonly string[], headLines: readonly string[], edits: readonly Readonly<LineEdit>[]): LineEdit[] | null {
  if (!edits.every(editIsWellFormed) || !editsAreApart(edits)) return null;
  if (!edits.every((edit) => edit.originalLines.length === 0 ? edit.fromLine <= baseLines.length + 1 : linesStandAt(baseLines, edit.fromLine, edit.originalLines))) {
    return null;
  }
  const headHunks = LineDiffUtil.hunksOf(baseLines, headLines).map((hunk) => sidedHunkOf('head', hunk));
  const mapped: LineEdit[] = [];
  for (const edit of edits) {
    const editHunk = sidedHunkOf('person', {
      originalFromLine: edit.fromLine, originalLines: edit.originalLines, replacementFromLine: edit.fromLine, replacementLines: edit.replacementLines
    });
    if (headHunks.some((headHunk) => hunksOverlap(headHunk, editHunk))) return null;
    const offset = headHunks
      .filter((headHunk) => headHunk.end <= editHunk.start)
      .reduce((sum, headHunk) => sum + headHunk.hunk.replacementLines.length - headHunk.hunk.originalLines.length, 0);
    const fromLine = edit.fromLine + offset;
    if (!linesStandAt(headLines, fromLine, edit.originalLines) && edit.originalLines.length > 0) return null;
    mapped.push({
      fromLine, toLine: edit.toLine + offset, originalLines: [...edit.originalLines], replacementLines: [...edit.replacementLines]
    });
  }
  return mapped;
}

/** The lines with the edits, all made on them and apart from each other, applied; from the last edit up, so no edit moves another. */
function linesWithEditsApplied(lines: readonly string[], edits: readonly Readonly<LineEdit>[]): string[] {
  const result = [...lines];
  for (const edit of [...edits].sort((a, b) => b.fromLine - a.fromLine)) result.splice(edit.fromLine - 1, edit.originalLines.length, ...edit.replacementLines);
  return result;
}

/** Where each edit's replacement stands once all are applied, in edit order; an edit that only removes lines has none. */
function replacementRangesOf(edits: readonly Readonly<LineEdit>[]): { from: number; to: number }[] {
  const ordered = [...edits].sort((a, b) => a.fromLine - b.fromLine);
  let offset = 0;
  return ordered.flatMap((edit) => {
    const from = edit.fromLine + offset;
    offset += edit.replacementLines.length - edit.originalLines.length;
    return edit.replacementLines.length === 0 ? [] : [{ from, to: from + edit.replacementLines.length - 1 }];
  });
}

export const DocumentLineMergeUtil = Object.freeze({
  mergeOf, editsOnHeadOf, linesWithEditsApplied, replacementRangesOf
});
