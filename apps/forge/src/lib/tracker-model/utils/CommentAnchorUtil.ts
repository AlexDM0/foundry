/**
 * A comment anchor on a ticket document that forge makes itself, as a page makes one on lines chosen in Code: the lines, the headings above
 * them and the lines around them, with no quote. A copy carries every field the anchor has, and no other.
 */
import type { CommentAnchor, LineRange } from '../@types/TicketDocument.ts';

const SURROUNDING_LINE_COUNT = 2;

const HEADING_PATTERN = /^(#{1,6})\s+(.*?)\s*#*\s*$/u;

const FENCE_PATTERN = /^\s*(```|~~~)/u;

interface OpenHeading {
  level: number;
  text:  string;
}

/** The headings above the line, outermost first; a heading line is in its own section, and a fenced block holds no heading. */
function sectionPathAt(lines: readonly string[], lineNumber: number): string[] {
  const openHeadings: OpenHeading[] = [];
  let insideFence = false;
  for (const line of lines.slice(0, lineNumber)) {
    if (FENCE_PATTERN.test(line)) insideFence = !insideFence;
    const heading = insideFence ? null : HEADING_PATTERN.exec(line);
    if (heading === null) continue;
    const level = heading[1]?.length ?? 1;
    while ((openHeadings.at(-1)?.level ?? 0) >= level) openHeadings.pop();
    openHeadings.push({ level, text: heading[2] ?? '' });
  }
  return openHeadings.map((heading) => heading.text);
}

function anchorOfLines(versionText: string, versionNumber: number, lines: LineRange): CommentAnchor {
  const versionLines = versionText.endsWith('\n') ? versionText.slice(0, -1).split('\n') : versionText.split('\n');
  return {
    view:             'code',
    versionNumber,
    lines:            { from: lines.from, to: lines.to },
    sectionPath:      sectionPathAt(versionLines, lines.from),
    surroundingLines: { from: Math.max(1, lines.from - SURROUNDING_LINE_COUNT), to: Math.min(Math.max(versionLines.length, 1), lines.to + SURROUNDING_LINE_COUNT) },
  };
}

function copyOf(anchor: Readonly<CommentAnchor>): CommentAnchor {
  return {
    view:             anchor.view,
    versionNumber:    anchor.versionNumber,
    lines:            { from: anchor.lines.from, to: anchor.lines.to },
    ...(anchor.columns === undefined ? {} : { columns: { from: anchor.columns.from, to: anchor.columns.to } }),
    sectionPath:      [...anchor.sectionPath],
    ...(anchor.quote === undefined ? {} : { quote: anchor.quote }),
    surroundingLines: { from: anchor.surroundingLines.from, to: anchor.surroundingLines.to },
    ...(anchor.diagram === undefined ? {} : {
      diagram: {
        lines:       { from: anchor.diagram.lines.from, to: anchor.diagram.lines.to },
        diagramKind: anchor.diagram.diagramKind,
        nodeId:      anchor.diagram.nodeId,
        nodeLabel:   anchor.diagram.nodeLabel,
      },
    }),
  };
}

export const CommentAnchorUtil = Object.freeze({ anchorOfLines, copyOf });
