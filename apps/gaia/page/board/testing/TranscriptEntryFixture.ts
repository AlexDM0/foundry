/**
 * A transcript entry as Gaia's relay serves it, for the conversation views' specs: an unstamped, plain entry of its cursor's first key,
 * carrying no tool, act or picture unless the fields say otherwise. Test-only.
 */
import type { BoardTranscriptEntryDocument } from '../../@types/board/ConversationDocument.ts';

type ExampleEntryFields = Partial<BoardTranscriptEntryDocument> & Pick<BoardTranscriptEntryDocument, 'cursor' | 'role' | 'text'>;

export function exampleTranscriptEntry(fields: ExampleEntryFields): BoardTranscriptEntryDocument {
  return {
    entryKey:        `${fields.cursor}.0`,
    at:              null,
    toolName:        null,
    parentToolUseId: null,
    toolUseId:       null,
    asksUser:        false,
    model:           null,
    tokens:          null,
    clientAct:       null,
    sentBy:          null,
    chatSequence:    null,
    incidentIds:     [],
    pictures:        [],
    ...fields,
  };
}
