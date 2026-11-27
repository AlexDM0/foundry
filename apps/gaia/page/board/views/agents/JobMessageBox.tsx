/**
 * The job panel's foot: a message to the selected job, which it reads after its next call, sent with the paper-plane Send as a
 * `job-message`. Offered only where the forge offers it (`AgentsModel.takesMessages`); the field clears once the forge applied it.
 */
import { useState } from 'react';

import { PAGE_CONTRACT_VERSIONS } from '../../../../src/shared/constants/PageContractVersions.ts';
import { Icon, IconButton }       from '../../../lib/design-system/DesignSystemInterface.ts';
import { useControlCommand }      from '../../shared/commands/ControlCommandSender.ts';

export function JobMessageBox({ jobId }: { readonly jobId: string }) {
  const [message, setMessage] = useState('');
  const trimmedMessage = message.trim();
  const sender = useControlCommand(trimmedMessage === '' ? null : {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'job-message', jobId, text: trimmedMessage, pictures: [], incidentId: null
  }, { onApplied: () => setMessage('') });
  return (
    <div className="agents-message-box">
      <div className="agents-message-entry">
        <textarea
          className="board-textarea agents-message-input"
          aria-label="Message"
          placeholder={`Message ${jobId}. It reads it after its next call.`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <IconButton
          drawing={<Icon name="paper-plane" label={null} />}
          accessibleName="Send message"
          accent
          disabled={!sender.enabled}
          onPress={() => void sender.send()}
        />
      </div>
      {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
    </div>
  );
}
