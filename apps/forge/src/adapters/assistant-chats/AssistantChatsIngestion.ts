/** `assistant-chats.json` in the Assistant's job folder, its numbered chats past the first message: read, validate, map. */
import { JsonRecordUtil }         from '../../lib/json-record/JsonRecordUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';
import { StoredValueUtil }        from '../utils/StoredValueUtil.ts';

export const ASSISTANT_CHATS_FORMAT_VERSION = 1;

/** A chat past the first message: the incidents it delivered, or the number of User's `job message` it carries. */
export interface AssistantChat {
  sequence:      number;
  incidentIds:   readonly string[];
  messageNumber: number | null;
}

export type AssistantChatsReading =
  | { verdict: 'readable'; chats: AssistantChat[] }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

type ChatReading = { verdict: 'readable'; chat: AssistantChat } | { verdict: 'unreadable'; reason: string };

function chatReadingOf(value: unknown, index: number): ChatReading {
  const chat = JsonRecordUtil.recordOf(value);
  if (chat === undefined) return { verdict: 'unreadable', reason: `its chats[${index}] is not an object` };
  const { sequence, incidentIds, messageNumber } = chat;
  if (!StoredValueUtil.wholeNumberIsAtLeast(sequence, 1)) return { verdict: 'unreadable', reason: `its chats[${index}].sequence is not a whole number of at least 1` };
  if (!Array.isArray(incidentIds) || !incidentIds.every((incidentId) => typeof incidentId === 'string')) {
    return { verdict: 'unreadable', reason: `its chats[${index}].incidentIds is not a list of incident ids` };
  }
  if (messageNumber !== null && !StoredValueUtil.wholeNumberIsAtLeast(messageNumber, 1)) {
    return { verdict: 'unreadable', reason: `its chats[${index}].messageNumber is neither a whole number of at least 1 nor null` };
  }
  return { verdict: 'readable', chat: { sequence, incidentIds: incidentIds as string[], messageNumber } };
}

export class AssistantChatsIngestion {
  constructor(private readonly chatsFilePath: string) {}

  /** Never throws: a file that exists but cannot be read, parsed or trusted whole is `unreadable`, never `absent`. */
  read(): AssistantChatsReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.chatsFilePath, ASSISTANT_CHATS_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const storedChats = stored.document['chats'];
    if (!Array.isArray(storedChats)) return { verdict: 'unreadable', reason: 'its chats is not a list' };
    const chats: AssistantChat[] = [];
    for (const [index, storedChat] of (storedChats as unknown[]).entries()) {
      const chatReading = chatReadingOf(storedChat, index);
      if (chatReading.verdict === 'unreadable') return chatReading;
      chats.push(chatReading.chat);
    }
    return { verdict: 'readable', chats };
  }
}
