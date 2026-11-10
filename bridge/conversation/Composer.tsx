/**
 * The box under a chat: it names its recipient, says through its status tag whether a message sends now or queues, and sends what its
 * caller makes of the text. Enter sends and Shift + Enter starts a new line; Enter and Send share one send, so both obey every rule of a
 * Bridge control. The text clears once the Overseer applied the command and stays on a refusal, which shows verbatim beside Send.
 */
import {
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react';

import type { ControlCommandBody } from '../api/CommandClient.ts';
import { Button }                  from '../design-system/Button.tsx';
import { Tag, type TagProps }      from '../design-system/Tag.tsx';
import { useControlCommand }       from '../shell/ControlCommandSender.ts';
import { JobLink }                 from './ConversationParts.tsx';

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
  readonly commandOf:      (text: string) => ControlCommandBody | null;
  readonly onApplied?:     (text: string, result: unknown) => void;
  /** Shown above the text box, such as the pictures a message carries. */
  readonly attachments?:   ReactNode;
  /** Shown first in the foot, such as a button that attaches pictures. */
  readonly footStart?:     ReactNode;
  readonly onFilesPasted?: (files: readonly File[]) => void;
}

export function Composer({
  label, recipientLabel, recipientJobId, status, placeholder, sendLabel, commandOf, onApplied, attachments, footStart, onFilesPasted
}: ComposerProps) {
  const [text, setText] = useState('');
  const sender = useControlCommand(commandOf(text), {
    onApplied: (result) => {
      onApplied?.(text, result);
      setText('');
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
    <div className="bridge-composer">
      <div className="bridge-composer-head">
        <span>To</span>
        <span className="bridge-composer-recipient">
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
      </div>
      {attachments}
      <textarea
        className="bridge-textarea bridge-composer-input"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={sendOnEnter}
        onPaste={passPastedFiles}
      />
      <div className="bridge-composer-foot">
        {footStart}
        <span className="bridge-key-hint">
          <kbd>Enter</kbd>
          {' sends'}
        </span>
        <span className="bridge-key-hint">
          <kbd>Shift</kbd>
          {' + '}
          <kbd>Enter</kbd>
          {' new line'}
        </span>
        <span className="bridge-control">
          <Button label={sendLabel} emphasis="primary" disabled={!sender.enabled} onPress={() => void sender.send()} />
          {sender.refusal === null ? null : <span className="bridge-refusal" role="status">{sender.refusal}</span>}
        </span>
      </div>
    </div>
  );
}
