/**
 * The comment on a selection, lines or a diagram node: its number and where it points, the quote, the text field, what the agent gets,
 * Cancel and `Send to agent ⌘↵`. Cmd/Ctrl+Enter sends; the forge's refusal shows verbatim and keeps the text. A sent comment closes the
 * popover and lands in the chat as its own message.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent
} from 'react';

import type { MarkdownBlock }              from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardCommentAnchorDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import { Button }                          from '../../../lib/design-system/DesignSystemInterface.ts';
import { useControlCommand }               from '../../shell/ControlCommandSender.ts';
import { CommentPopoverModel }             from './CommentPopoverModel.ts';
import { AGENT_NAMES }                     from './ProposalModel.ts';
import type { DocumentPlace }              from './TicketDocumentCommands.ts';

export interface CommentDraft {
  readonly commentNumber: number;
  readonly anchor:        BoardCommentAnchorDocument;
}

export interface CommentPopoverProps {
  readonly place:        DocumentPlace;
  readonly draft:        CommentDraft;
  readonly blocks:       readonly MarkdownBlock[];
  readonly onClose:      () => void;
  /** The text the field opens with, such as a comment a screen shows half written. */
  readonly initialText?: string;
}

export function sendKeyIsPressed(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return (event.metaKey || event.ctrlKey) && event.key === 'Enter';
}

export function CommentPopover({
  place, draft, blocks, onClose, initialText = ''
}: CommentPopoverProps) {
  const fieldId = useId();
  const [text, setText] = useState(initialText);
  const field = useRef<HTMLTextAreaElement>(null);
  // The popover opens on User's own selection, to take the comment at once.
  useEffect(() => field.current?.focus(), []);
  const content = CommentPopoverModel.popoverContentOf(draft.commentNumber, draft.anchor, blocks);
  const sender = useControlCommand(CommentPopoverModel.commandOf(place, draft.anchor, text), { onApplied: onClose });
  const agentName = AGENT_NAMES[place.document].toLowerCase();
  return (
    <div className="board-document-popover" role="dialog" aria-label={`Comment for the ${agentName}`}>
      <div className="board-document-popover-head">
        <span className="board-document-micro">Comment</span>
        <span className="board-document-mono">{content.heading}</span>
      </div>
      {content.section === null ? null : <div className="board-document-popover-section">{content.section}</div>}
      {content.quote === null ? null : <div className="board-document-popover-quote">{`“${content.quote}”`}</div>}
      <label className="board-visually-hidden" htmlFor={fieldId}>Your comment</label>
      <textarea
        id={fieldId}
        className="board-textarea board-document-popover-input"
        rows={2}
        value={text}
        ref={field}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          if (!sendKeyIsPressed(event)) return;
          event.preventDefault();
          void sender.send();
        }}
      />
      {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
      <div className="board-document-popover-foot">
        <span className="board-document-note">{content.note}</span>
        <Button label="Cancel" dense onPress={onClose} />
        <Button label="Send to agent ⌘↵" emphasis="primary" dense disabled={!sender.enabled} onPress={() => void sender.send()} />
      </div>
    </div>
  );
}
