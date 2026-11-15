/**
 * The job panel's foot: a message to the selected job, which it reads after its next call, sent with the paper-plane Send as a
 * `job-message`. Offered only where `AgentsModel.takesMessages` says so; the field clears once the Overseer applied it.
 */
import { useState } from 'react';

import { SendButton }        from '../../conversation/SendButton.tsx';
import { useControlCommand } from '../../shell/ControlCommandSender.ts';

export function JobMessageBox({ jobId }: { readonly jobId: string }) {
  const [message, setMessage] = useState('');
  const trimmedMessage = message.trim();
  const sender = useControlCommand(trimmedMessage === '' ? null : { kind: 'job-message', jobId, text: trimmedMessage }, { onApplied: () => setMessage(''), });
  return (
    <div className="agents-message-box">
      <div className="agents-message-entry">
        <textarea
          className="bridge-textarea agents-message-input"
          aria-label="Message"
          placeholder={`Message ${jobId}. It reads it after its next call.`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <SendButton accessibleName="Send message" enabled={sender.enabled} onPress={() => void sender.send()} />
      </div>
      {sender.refusal === null ? null : <span className="bridge-refusal" role="status">{sender.refusal}</span>}
    </div>
  );
}
