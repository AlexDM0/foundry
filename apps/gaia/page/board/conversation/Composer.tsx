/**
 * The box under a chat: its head names the recipient, says through its status tag whether a message sends now or queues, and gives the
 * keys; under it the text box and the paper-plane Send, then the caller's foot controls. Enter sends and Shift + Enter starts a new line;
 * Enter and Send share one send, so both obey every rule of a board control. The text clears once the forge applied the command, unless
 * User changed it while the command was on its way, and stays on a refusal, which shows verbatim under the text box. Inside a chat card,
 * the first letter of a text cues Flint that User types.
 */
import {
  useContext,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react';

import type { BoardCommandDocument } from '../../@types/board/BoardCommandDocument.ts';
import { Tag, type TagProps }        from '../../lib/design-system/DesignSystemInterface.ts';
import type { BoardCommandResult }   from '../api/BoardCommandClient.ts';
import { useControlCommand }         from '../shell/ControlCommandSender.ts';
import { ChatCueRelayContext }       from './ChatCueRelay.ts';
import { CHAT_CUES }                 from './ChatSpriteHabitat.ts';
import { JobLink }                   from './ConversationParts.tsx';
import { SendButton }                from './SendButton.tsx';

export interface ComposerProps {
  /** The text box's accessible name. */
  readonly label:          string;
  readonly recipientLabel: string;
  /** The recipient's job, linked after its label; `null` while there is none. */
  readonly recipientJobId: string | null;
  readonly status:         TagProps | null;
  readonly placeholder:    string;
  readonly sendLabel:      string;
  /** The command the text sends; `null` disables Send and makes Enter send nothing, so an empty text is the caller's rule. */
  readonly commandOf:      (text: string) => BoardCommandDocument | null;
  readonly onApplied?:     (text: string, result: BoardCommandResult) => void;
  /** Shown above the text box, such as the pictures a message carries. */
  readonly attachments?:   ReactNode;
  /** The foot under the text box, such as a button that attaches pictures; without it the composer has no foot. */
  readonly footStart?:     ReactNode;
  readonly onFilesPasted?: (files: readonly File[]) => void;
}

function KeyHints() {
  return (
    <span className="board-composer-key-hints">
      <span className="board-key-hint">
        <kbd>Enter</kbd>
        {' sends'}
      </span>
      <span className="board-key-hint">
        <kbd>Shift</kbd>
        {' + '}
        <kbd>Enter</kbd>
        {' new line'}
      </span>
    </span>
  );
}

export function Composer({
  label, recipientLabel, recipientJobId, status, placeholder, sendLabel, commandOf, onApplied, attachments, footStart, onFilesPasted
}: ComposerProps) {
  const [text, setText] = useState('');
  const cueRelay = useContext(ChatCueRelayContext);
  const sender = useControlCommand(commandOf(text), {
    onApplied: (result) => {
      onApplied?.(text, result);
      setText((currentText) => (currentText === text ? '' : currentText));
    },
  });

  const sendOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sender.send();
  };

  const passPastedFiles = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = [...event.clipboardData.files];
    if (onFilesPasted !== undefined && files.length > 0) onFilesPasted(files);
  };

  return (
    <div className="board-composer">
      <div className="board-composer-head">
        <span className="board-composer-to">To</span>
        <span className="board-composer-recipient">
          {recipientLabel}
          {recipientJobId === null
            ? null
            : (
              <>
                {' '}
                <JobLink jobId={recipientJobId} />
              </>
            )}
        </span>
        {status === null ? null : <Tag {...status} />}
        <KeyHints />
      </div>
      {attachments}
      <div className="board-composer-entry">
        <textarea
          className="board-textarea board-composer-input"
          aria-label={label}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            if (text === '' && event.target.value !== '') cueRelay?.cue(CHAT_CUES.USER_IS_TYPING);
            setText(event.target.value);
          }}
          onKeyDown={sendOnEnter}
          onPaste={passPastedFiles}
        />
        <SendButton accessibleName={sendLabel} enabled={sender.enabled} onPress={() => void sender.send()} />
      </div>
      {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
      {footStart === undefined ? null : <div className="board-composer-foot">{footStart}</div>}
    </div>
  );
}
