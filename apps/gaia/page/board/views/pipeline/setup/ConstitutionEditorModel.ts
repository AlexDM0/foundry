/**
 * What the constitution step hands the board's Markdown editor, pure: a source tag on each line an annotation anchors by its text and
 * occurrence, so a tag follows its line while the text above it changes and goes when the line itself changes, and the save that sends the
 * whole markdown with the revision User saw.
 */
import { PAGE_CONTRACT_VERSIONS }             from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }          from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardSourceAnnotationDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardSourceAnnotationKind }     from '../../../../@types/board/BoardVocabulary.ts';
import {
  MarkdownEditorModel,
  type EditorLine,
  type EditorLineMarker,
  type EditorText
} from '../../../markdown-editor/MarkdownEditorModel.ts';

const TAG_TEXTS: Readonly<Record<BoardSourceAnnotationKind, string>> = {
  'contributing':      'CONTRIBUTING.md',
  'research':          'research',
  'installed-default': 'default',
};

/** The source tag of each line an annotation anchors, by the line's key; the source path is the tag's title. */
function sourceTagsOf(annotations: readonly BoardSourceAnnotationDocument[]): (line: EditorLine) => EditorLineMarker | null {
  const tagsByLineKey = new Map(annotations.map((annotation): [string, EditorLineMarker] => [
    MarkdownEditorModel.lineKeyOf(annotation.lineText, annotation.occurrence),
    { text: TAG_TEXTS[annotation.kind], title: annotation.path, tone: 'neutral' },
  ]));
  return (line) => tagsByLineKey.get(line.lineKey) ?? null;
}

/** The whole markdown at the revision User saw, with the entity it edits; `null` while the text is what that revision holds. */
function saveCommandOf(setupId: string, editorText: EditorText, entityKey: string | null = null): BoardCommandDocument | null {
  if (!MarkdownEditorModel.textIsUnsaved(editorText)) return null;
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand,
    kind:                'pipeline-constitution-edit',
    setupId,
    revision:            editorText.baseRevision,
    markdown:            editorText.text,
    draftedFrom:         null,
    entity:              entityKey,
  };
}

export const ConstitutionEditorModel = Object.freeze({ sourceTagsOf, saveCommandOf });
