import { writeFileAtomically }                                from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                       from '../../shared/utils/JsonTextUtil.ts';
import { ASSISTANT_CHATS_FORMAT_VERSION, type AssistantChat } from './AssistantChatsIngestion.ts';

export function createAssistantChatsWriter(chatsFilePath: string): { write(chats: readonly AssistantChat[]): void } {
  function write(chats: readonly AssistantChat[]): void {
    const storedChats = chats.map(({ sequence, incidentIds, messageNumber }) => ({ sequence, incidentIds, messageNumber }));
    writeFileAtomically(chatsFilePath, JsonTextUtil.storedFileTextOf({ version: ASSISTANT_CHATS_FORMAT_VERSION, chats: storedChats }));
  }
  return { write };
}
