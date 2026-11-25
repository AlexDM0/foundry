/**
 * Split: Code on the left, Preview on the right, the Preview drawn from the text User types, saved or not, and kept on the block of the
 * line the caret stands on. The agent may work meanwhile: its edit lands on User's newer text, never over it.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { MarkdownBlocks }                    from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardDocumentMessageDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import type { CommentDraft }                 from './CommentPopover.tsx';
import { DocumentBlocks }                    from './DocumentBlocks.tsx';
import { DocumentCodeEditor }                from './DocumentCodeEditor.tsx';
import type { DocumentPlace }                from './TicketDocumentCommands.ts';

export interface DocumentSplitViewProps {
  readonly place:             DocumentPlace;
  readonly markdown:          string;
  readonly versionNumber:     number | null;
  readonly messages:          readonly BoardDocumentMessageDocument[];
  readonly readOnly:          boolean;
  readonly draft:             CommentDraft | null;
  readonly onDraft:           (draft: CommentDraft | null) => void;
  readonly onTextChange:      (text: string) => void;
  /** The line a screen shows the caret on before User moves it. */
  readonly caretLineAtMount?: number | null;
  /** Told the line the caret stands on each time it moves. */
  readonly onCaretLine?:      (lineNumber: number) => void;
}

/** The element of the innermost block that holds a line, by the line attributes the blocks carry. */
function blockElementAt(container: HTMLElement, line: number): HTMLElement | null {
  const holding = [...container.querySelectorAll<HTMLElement>('[data-from-line]')].filter((element) => (
    Number(element.dataset['fromLine']) <= line && line <= Number(element.dataset['toLine'])
  ));
  return holding.at(-1) ?? null;
}

export function DocumentSplitView({
  place, markdown, versionNumber, messages, readOnly, draft, onDraft, onTextChange, caretLineAtMount = null, onCaretLine
}: DocumentSplitViewProps) {
  const [shownText, setShownText] = useState(markdown);
  const [caretLine, setCaretLine] = useState<number | null>(caretLineAtMount);
  const preview = useRef<HTMLElement>(null);
  const blocks = useMemo(() => MarkdownBlocks.blocksOf(shownText), [shownText]);
  const followText = (text: string): void => {
    setShownText(text);
    onTextChange(text);
  };
  const followCaret = useCallback((lineNumber: number): void => {
    setCaretLine(lineNumber);
    onCaretLine?.(lineNumber);
  }, [onCaretLine]);

  useEffect(() => {
    if (caretLine === null || preview.current === null) return;
    blockElementAt(preview.current, caretLine)?.scrollIntoView?.({ block: 'nearest' });
  }, [caretLine, shownText]);

  return (
    <div className="board-document-split">
      <DocumentCodeEditor
        place={place}
        markdown={markdown}
        versionNumber={versionNumber}
        messages={messages}
        readOnly={readOnly}
        draft={draft}
        onDraft={onDraft}
        onTextChange={followText}
        onCaretLine={followCaret}
        headLine={caretLine === null ? 'Select lines, then ⌘⇧M to comment' : `You are typing on line ${caretLine}`}
      />
      <section ref={preview} className="board-document-split-preview" aria-label="Live preview">
        <div className="board-document-pane-head">
          <span className="board-document-micro">Preview</span>
          <span className="board-document-note">Follows the cursor</span>
        </div>
        <div className="board-document-article" data-follows-caret="">
          <DocumentBlocks blocks={blocks} />
        </div>
      </section>
    </div>
  );
}
