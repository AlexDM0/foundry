/**
 * Code: the document's Markdown in the board's editor, with line numbers and each comment's chip in the gutter. Selected lines, then
 * Cmd/Ctrl+Shift+M or the gutter's `+`, open the same comment popover as Preview, anchored on those lines of the head, so only while the
 * text is the head's; an edit not yet saved is saved first. The text saves with the version User saw once User pauses typing and on blur;
 * the forge merges it onto a newer head, and a refused save keeps User's text.
 */
import { useCallback, useMemo } from 'react';

import { MarkdownBlocks }                    from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardDocumentMessageDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import { MarkdownEditor }                    from '../../markdown-editor/MarkdownEditor.tsx';
import type {
  EditorLine,
  EditorLineMarker,
  EditorLineRange,
  EditorText
} from '../../markdown-editor/MarkdownEditorModel.ts';
import { MarkdownEditorModel }                        from '../../markdown-editor/MarkdownEditorModel.ts';
import { CommentPopover, type CommentDraft }          from './CommentPopover.tsx';
import { CommentPopoverModel }                        from './CommentPopoverModel.ts';
import { DocumentSelectionModel }                     from './DocumentSelectionModel.ts';
import { TicketDocumentCommands, type DocumentPlace } from './TicketDocumentCommands.ts';

/** A pause in typing this long saves the text. */
export const DOCUMENT_SAVE_IDLE_MILLISECONDS = 1500;

/** A document with no version yet is revision 0 in the editor, and its first save names no base. */
const NO_VERSION_REVISION = 0;

export interface DocumentCodeEditorProps {
  readonly place:         DocumentPlace;
  readonly markdown:      string;
  readonly versionNumber: number | null;
  readonly messages:      readonly BoardDocumentMessageDocument[];
  readonly readOnly:      boolean;
  readonly draft:         CommentDraft | null;
  readonly onDraft:       (draft: CommentDraft | null) => void;
  readonly onTextChange?: (text: string) => void;
  readonly onCaretLine?:  (lineNumber: number) => void;
  /** The head line over the editor, Code's own by default. */
  readonly headLine?:     string;
  readonly draftText?:    string;
}

function markersByLineOf(messages: readonly BoardDocumentMessageDocument[]): ReadonlyMap<number, EditorLineMarker> {
  return new Map(messages.flatMap((message): [number, EditorLineMarker][] => {
    if (message.commentNumber === null || message.placement === null || message.state === 'withdrawn') return [];
    const applied = message.state === 'applied';
    return [[message.placement.from, {
      text:  applied ? `✓ C${message.commentNumber}` : `C${message.commentNumber}`,
      title: `Comment C${message.commentNumber}${applied ? ', applied' : ''}`,
      tone:  applied ? 'settled' : 'open',
    }]];
  }));
}

export function saveCommandOf(place: DocumentPlace, editorText: EditorText) {
  if (!MarkdownEditorModel.textIsUnsaved(editorText)) return null;
  const baseVersion = editorText.baseRevision === NO_VERSION_REVISION ? null : editorText.baseRevision;
  return TicketDocumentCommands.saveOf(place, baseVersion, editorText.text);
}

export function DocumentCodeEditor({
  place, markdown, versionNumber, messages, readOnly, draft, onDraft, onTextChange, onCaretLine, headLine, draftText
}: DocumentCodeEditorProps) {
  const blocks = useMemo(() => MarkdownBlocks.blocksOf(markdown), [markdown]);
  const markersByLine = useMemo(() => markersByLineOf(messages), [messages]);
  const markerOf = useCallback((line: EditorLine) => markersByLine.get(line.number) ?? null, [markersByLine]);
  const nextCommentNumber = CommentPopoverModel.nextCommentNumberOf(messages);
  const lineCount = markdown.split('\n').length;
  const commentOnLines = (lines: EditorLineRange): void => {
    if (versionNumber === null) return;
    onDraft({ commentNumber: nextCommentNumber, anchor: DocumentSelectionModel.anchorOfLines(blocks, lineCount, versionNumber, lines) });
  };
  return (
    <section className="board-document-code-view" aria-label="Markdown source">
      <div className="board-document-pane-head">
        <span className="board-document-micro">Markdown</span>
        <span className="board-document-note">{headLine ?? (readOnly ? 'Read-only' : 'Editable · select lines, then ⌘⇧M or the gutter + to comment')}</span>
      </div>
      <MarkdownEditor
        label={`${place.document === 'spec' ? 'Spec' : 'Plan'} markdown`}
        version={{ markdown, revision: versionNumber ?? NO_VERSION_REVISION }}
        saveCommandOf={(editorText) => saveCommandOf(place, editorText)}
        markerOf={markerOf}
        markerListLabel="Comments on the lines"
        gutter={{ onCommentLines: commentOnLines }}
        idleSaveMilliseconds={DOCUMENT_SAVE_IDLE_MILLISECONDS}
        readOnly={readOnly}
        {...(onTextChange === undefined ? {} : { onTextChange })}
        {...(onCaretLine === undefined ? {} : { onCaretLine })}
      />
      {draft === null || draft.anchor.view !== 'code'
        ? null
        : (
          <CommentPopover
            key={JSON.stringify(draft.anchor)}
            place={place}
            draft={draft}
            blocks={blocks}
            onClose={() => onDraft(null)}
            {...(draftText === undefined ? {} : { initialText: draftText })}
          />
        )}
    </section>
  );
}
