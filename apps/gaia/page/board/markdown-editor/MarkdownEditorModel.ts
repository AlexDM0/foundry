/**
 * The shared Markdown editor's model, pure. The text splits into lines as the forge splits it, and a line is known by its text and its
 * occurrence among equal lines, so a mark keyed that way follows its line while the text above it changes; the text follows the facts until
 * User types, then stays User's until a save lands or User discards it.
 */

const LINE_BREAK = /\r?\n/u;

const HEADING_LINE = /^#{1,2}(?:\s|$)/u;

/** A quote line and a code fence, which read quieter than the text. */
const MUTED_LINE = /^(?:>|```|~~~)/u;

export interface EditorLine {
  /** The line's text and its occurrence among equal lines. */
  readonly lineKey: string;
  /** From 1. */
  readonly number:  number;
  readonly text:    string;
  /** A `#` or `##` line, drawn bold. */
  readonly heading: boolean;
  /** A `>` quote line or a code fence, drawn muted. */
  readonly muted:   boolean;
}

/** `open`: something waits on the line, such as a comment the agent has not answered; `settled`: it was answered. */
export type EditorMarkerTone = 'neutral' | 'open' | 'settled';

export interface EditorLineMarker {
  readonly text:  string;
  /** What the marker stands for, as its title and in the list a screen reader reads; `null` when its text says it. */
  readonly title: string | null;
  readonly tone:  EditorMarkerTone;
}

/** Both ends included, from 1. */
export interface EditorLineRange {
  readonly from: number;
  readonly to:   number;
}

/** The text in the textarea and the facts it started from: the markdown and the revision User saw. */
export interface EditorText {
  readonly text:         string;
  readonly baseMarkdown: string;
  readonly baseRevision: number;
  /**
   * After a save landed, until its revision is read as the text sent: the facts that save was made on. The forge merges a save made on an
   * older revision, so the saved revision may read otherwise, and text typed since then goes back on the facts it was truly made on.
   */
  readonly savedFrom?:   EditorVersion;
}

export interface EditorVersion {
  readonly markdown: string;
  readonly revision: number;
}

function linesOf(markdown: string): string[] {
  return markdown.split(LINE_BREAK);
}

function lineKeyOf(text: string, occurrence: number): string {
  return JSON.stringify([text, occurrence]);
}

/** Each line's key, in order: its text and how many equal lines came before it, plus one. */
function lineKeysOf(lines: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((text) => {
    const occurrence = (seen.get(text) ?? 0) + 1;
    seen.set(text, occurrence);
    return lineKeyOf(text, occurrence);
  });
}

function editorLinesOf(markdown: string): EditorLine[] {
  const lines = linesOf(markdown);
  const lineKeys = lineKeysOf(lines);
  return lines.map((text, i) => ({
    lineKey: lineKeys[i] ?? lineKeyOf(text, 1), number: i + 1, text, heading: HEADING_LINE.test(text), muted: MUTED_LINE.test(text),
  }));
}

/** The keys of the lines in `current` that `previous` did not hold: what a new draft changed or added. */
function changedLineKeysBetween(previous: string, current: string): ReadonlySet<string> {
  const previousKeys = new Set(lineKeysOf(linesOf(previous)));
  return new Set(lineKeysOf(linesOf(current)).filter((lineKey) => !previousKeys.has(lineKey)));
}

function editorTextOf(version: EditorVersion): EditorText {
  return { text: version.markdown, baseMarkdown: version.markdown, baseRevision: version.revision };
}

function textIsUnsaved(editorText: EditorText): boolean {
  return editorText.text !== editorText.baseMarkdown;
}

function withBaseOf(editorText: EditorText, base: EditorVersion): EditorText {
  return { text: editorText.text, baseMarkdown: base.markdown, baseRevision: base.revision };
}

/**
 * Newer facts replace the text only while User has nothing unsaved; unsaved text keeps the revision User saw, so its save goes on that
 * revision. Facts older than a save that landed are the ones before it, still on their way out. Once the saved revision is read as the text
 * sent, it is the base; read otherwise, or passed over, unsaved text goes back on the facts the save was made on.
 */
function followedTextOf(editorText: EditorText, facts: EditorVersion): EditorText {
  if (facts.revision < editorText.baseRevision) return editorText;
  const { savedFrom } = editorText;
  if (editorText.baseMarkdown === facts.markdown && editorText.baseRevision === facts.revision) {
    return savedFrom === undefined ? editorText : withBaseOf(editorText, facts);
  }
  if (!textIsUnsaved(editorText)) return editorTextOf(facts);
  return savedFrom === undefined ? editorText : withBaseOf(editorText, savedFrom);
}

/** After a refusal User saves on top of the facts as they are now: the text stays, the base becomes the facts. */
function rebasedTextOf(editorText: EditorText, facts: EditorVersion): EditorText {
  return { text: editorText.text, baseMarkdown: facts.markdown, baseRevision: facts.revision };
}

/**
 * A landed save made `saved`: the text sent, at the revision the forge wrote, which it read on top of `savedFrom`. Text typed since stays
 * unsaved.
 */
function savedTextOf(editorText: EditorText, saved: EditorVersion, savedFrom: EditorVersion): EditorText {
  return { ...withBaseOf(editorText, saved), savedFrom };
}

/** The line an offset of the text stands on, from 1. */
function lineNumberAt(text: string, offset: number): number {
  return linesOf(text.slice(0, Math.max(0, offset))).length;
}

/** The lines a selection touches; a selection that ends at the very start of a line leaves that line out, as a line selection does. */
function selectedLinesOf(text: string, selectionStart: number, selectionEnd: number): EditorLineRange {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const from = lineNumberAt(text, start);
  const endsAtLineStart = end > start && (text[end - 1] === '\n');
  const to = Math.max(from, lineNumberAt(text, endsAtLineStart ? end - 1 : end));
  return { from, to };
}

function lineIsIn(lineNumber: number, range: EditorLineRange | null): boolean {
  return range !== null && range.from <= lineNumber && lineNumber <= range.to;
}

/** "- Use TypeScript in strict mode. · research, tsconfig.json": one item of the list a screen reader reads for the markers. */
function markerListItemsOf(lines: readonly EditorLine[], markerOf: (line: EditorLine) => EditorLineMarker | null): string[] {
  return lines.flatMap((line) => {
    const marker = markerOf(line);
    if (marker === null) return [];
    const said = marker.title === null || marker.title === marker.text ? marker.text : `${marker.text}, ${marker.title}`;
    return [`${line.text} · ${said}`];
  });
}

export const MarkdownEditorModel = Object.freeze({
  linesOf,
  lineKeyOf,
  editorLinesOf,
  changedLineKeysBetween,
  editorTextOf,
  textIsUnsaved,
  followedTextOf,
  rebasedTextOf,
  savedTextOf,
  lineNumberAt,
  selectedLinesOf,
  lineIsIn,
  markerListItemsOf,
});
