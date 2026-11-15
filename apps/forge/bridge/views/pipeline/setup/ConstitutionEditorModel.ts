/**
 * The constitution editor's model, pure. The markdown splits into lines as the Board splits it; a line is known by its text and its
 * occurrence among equal lines, the way an annotation anchors to it, so a tag follows its line while the text above it changes and goes
 * when the line itself changes. The text in the textarea follows the facts until User types, and then stays User's until a save lands or
 * User discards it.
 */
import type { SourceAnnotation, SourceAnnotationKind } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody }                     from '../../../api/CommandClient.ts';

const LINE_BREAK = /\r?\n/u;

const HEADING_LINE = /^#{1,2}(?:\s|$)/u;

const TAG_TEXTS: Readonly<Record<SourceAnnotationKind, string>> = {
  'contributing':      'CONTRIBUTING.md',
  'research':          'research',
  'installed-default': 'default',
};

export interface SourceTag {
  readonly text:  string;
  /** The source path, shown as the tag's title; `null` when the source has no file. */
  readonly title: string | null;
}

export interface MirrorLine {
  /** The line's text and its occurrence among equal lines, the way an annotation names it. */
  readonly lineKey: string;
  readonly text:    string;
  /** A `#` or `##` line, drawn in the link colour. */
  readonly heading: boolean;
  readonly tag:     SourceTag | null;
}

/** The text in the textarea and the facts it started from: the markdown and the constitution revision User saw. */
export interface EditorText {
  readonly text:         string;
  readonly baseMarkdown: string;
  readonly baseRevision: number;
}

export interface ConstitutionVersion {
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

function tagOf(annotation: SourceAnnotation): SourceTag {
  return { text: TAG_TEXTS[annotation.kind], title: annotation.path };
}

/** The lines the mirror draws: a tag only on a line an annotation anchors, and on no other. */
function mirrorLinesOf(markdown: string, annotations: readonly SourceAnnotation[]): MirrorLine[] {
  const tagsByLineKey = new Map(annotations.map((annotation) => [lineKeyOf(annotation.lineText, annotation.occurrence), tagOf(annotation)]));
  const lines = linesOf(markdown);
  const lineKeys = lineKeysOf(lines);
  return lines.map((text, i) => {
    const lineKey = lineKeys[i] ?? lineKeyOf(text, 1);
    return {
      lineKey, text, heading: HEADING_LINE.test(text), tag: tagsByLineKey.get(lineKey) ?? null,
    };
  });
}

/** The keys of the lines in `current` that `previous` did not hold: what a new draft changed or added. */
function changedLineKeysBetween(previous: string, current: string): ReadonlySet<string> {
  const previousKeys = new Set(lineKeysOf(linesOf(previous)));
  return new Set(lineKeysOf(linesOf(current)).filter((lineKey) => !previousKeys.has(lineKey)));
}

function editorTextOf(version: ConstitutionVersion): EditorText {
  return { text: version.markdown, baseMarkdown: version.markdown, baseRevision: version.revision };
}

function textIsUnsaved(editorText: EditorText): boolean {
  return editorText.text !== editorText.baseMarkdown;
}

/**
 * Newer facts replace the text only while User has nothing unsaved; unsaved text keeps the revision User saw, so its save is refused.
 * Facts older than a save that landed are the ones before it, still on their way out.
 */
function followedTextOf(editorText: EditorText, facts: ConstitutionVersion): EditorText {
  if (facts.revision < editorText.baseRevision) return editorText;
  if (editorText.baseMarkdown === facts.markdown && editorText.baseRevision === facts.revision) return editorText;
  return textIsUnsaved(editorText) ? editorText : editorTextOf(facts);
}

/** After a refusal User saves on top of the facts as they are now: the text stays, the base becomes the facts. */
function rebasedTextOf(editorText: EditorText, facts: ConstitutionVersion): EditorText {
  return { text: editorText.text, baseMarkdown: facts.markdown, baseRevision: facts.revision };
}

/** A landed save made the saved text the next revision; text typed since stays unsaved. */
function savedTextOf(editorText: EditorText, saved: ConstitutionVersion): EditorText {
  return { text: editorText.text, baseMarkdown: saved.markdown, baseRevision: saved.revision + 1 };
}

/** The whole markdown at the revision User saw; `null` while the text is what that revision holds. */
function saveCommandOf(setupId: string, editorText: EditorText): ControlCommandBody | null {
  if (!textIsUnsaved(editorText)) return null;
  return {
    kind: 'pipeline-constitution-edit', setupId, revision: editorText.baseRevision, markdown: editorText.text
  };
}

/** "- Use TypeScript in strict mode. · research, tsconfig.json": one item of the list a screen reader reads for the tags. */
function sourceListItemsOf(lines: readonly MirrorLine[]): string[] {
  return lines.flatMap((line) => {
    if (line.tag === null) return [];
    const source = line.tag.title === null || line.tag.title === line.tag.text ? line.tag.text : `${line.tag.text}, ${line.tag.title}`;
    return [`${line.text} · ${source}`];
  });
}

export const ConstitutionEditorModel = Object.freeze({
  linesOf,
  mirrorLinesOf,
  changedLineKeysBetween,
  editorTextOf,
  textIsUnsaved,
  followedTextOf,
  rebasedTextOf,
  savedTextOf,
  saveCommandOf,
  sourceListItemsOf,
});
