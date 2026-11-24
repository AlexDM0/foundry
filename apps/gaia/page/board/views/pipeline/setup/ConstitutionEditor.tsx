/** The constitution's Edit view: the board's Markdown editor with a source tag after each line an annotation anchors. */
import { useMemo } from 'react';

import type { BoardSourceAnnotationDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { MarkdownEditor }                     from '../../../markdown-editor/MarkdownEditor.tsx';
import type { EditorVersion }                 from '../../../markdown-editor/MarkdownEditorModel.ts';
import { ConstitutionEditorModel }            from './ConstitutionEditorModel.ts';

export interface ConstitutionEditorProps {
  readonly setupId:     string;
  readonly version:     EditorVersion;
  readonly annotations: readonly BoardSourceAnnotationDocument[];
  /** The agent is writing a draft: a caret blinks after the last line. */
  readonly drafting:    boolean;
  /** The entity whose document it edits; absent in single mode. */
  readonly entityKey?:  string | null;
}

export function ConstitutionEditor({
  setupId, version, annotations, drafting, entityKey = null
}: ConstitutionEditorProps) {
  const markerOf = useMemo(() => ConstitutionEditorModel.sourceTagsOf(annotations), [annotations]);
  return (
    <MarkdownEditor
      label="Constitution markdown"
      version={version}
      saveCommandOf={(editorText) => ConstitutionEditorModel.saveCommandOf(setupId, editorText, entityKey)}
      markerOf={markerOf}
      markerListLabel="Sources the pipeline agent named"
      drafting={drafting}
    />
  );
}
