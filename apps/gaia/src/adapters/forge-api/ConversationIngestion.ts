/**
 * The ingestion of what a forge's conversation streams carry: a job stream's `history` (every entry after the cursor) and `message` (one
 * entry), and a profile stream's `line`. Each is checked for the keys Gaia reads and mapped; a malformed one maps to nothing and names its
 * keys, so the caller passes it over.
 */
import type { BoardProfileLine, BoardTranscriptEntry }                                                 from '../../shared/@types/board/BoardConversation.ts';
import type { DocumentReadingFailure }                                                                 from './@types/ForgeDocumentReading.ts';
import type { ForgeProfileLineDocument, ForgeTranscriptEntryDocument, ForgeTranscriptPictureDocument } from './@types/ForgeStreamDocuments.ts';
import { DocumentShapeUtil, type ShapeOf }                                                             from './utils/DocumentShapeUtil.ts';

const OPTIONAL_TEXT = { optional: 'text' } as const;

const TRANSCRIPT_PICTURE_SHAPE = {
  pictureId: 'text',
  name:      { nullable: 'text' },
  mediaType: 'text',
  bytes:     'whole-number',
} as const satisfies ShapeOf<ForgeTranscriptPictureDocument>;

const TRANSCRIPT_ENTRY_SHAPE = {
  cursor:          'text',
  entryKey:        'text',
  role:            'text',
  text:            'text',
  at:              { nullable: 'text' },
  toolName:        OPTIONAL_TEXT,
  parentToolUseId: OPTIONAL_TEXT,
  toolUseId:       OPTIONAL_TEXT,
  asksUser:        { optional: 'boolean' },
  model:           OPTIONAL_TEXT,
  tokens:          { optional: 'whole-number' },
  clientAct:       { optional: { oneOf: ['chat', 'answer', 'interrupt', 'close-input', 'stop'] } },
  sentBy:          { optional: { oneOf: ['user', 'overseer', 'assistant'] } },
  chatSequence:    { optional: 'whole-number' },
  incidentIds:     { optional: 'text-list' },
  pictures:        { optional: { listOf: TRANSCRIPT_PICTURE_SHAPE } },
} as const satisfies ShapeOf<ForgeTranscriptEntryDocument>;

const PROFILE_LINE_SHAPE = { text: 'text' } as const satisfies ShapeOf<ForgeProfileLineDocument>;

export type TranscriptHistoryReading =
  | { readonly entries: readonly BoardTranscriptEntry[] }
  | { readonly entries: null; readonly reason: DocumentReadingFailure };

export type TranscriptMessageReading = { readonly entry: BoardTranscriptEntry } | { readonly entry: null; readonly reason: DocumentReadingFailure };

export type ProfileLineReading = { readonly line: BoardProfileLine } | { readonly line: null; readonly reason: DocumentReadingFailure };

function transcriptEntryOf(entry: ForgeTranscriptEntryDocument): BoardTranscriptEntry {
  return {
    cursor:          entry.cursor,
    entryKey:        entry.entryKey,
    role:            entry.role,
    text:            entry.text,
    at:              entry.at,
    toolName:        entry.toolName ?? null,
    parentToolUseId: entry.parentToolUseId ?? null,
    toolUseId:       entry.toolUseId ?? null,
    asksUser:        entry.asksUser === true,
    model:           entry.model ?? null,
    tokens:          entry.tokens ?? null,
    clientAct:       entry.clientAct ?? null,
    sentBy:          entry.sentBy ?? null,
    chatSequence:    entry.chatSequence ?? null,
    incidentIds:     entry.incidentIds ?? [],
    pictures:        entry.pictures?.map((picture) => ({
      pictureId: picture.pictureId, name: picture.name, mediaType: picture.mediaType, bytes: picture.bytes
    })) ?? [],
  };
}

export class ConversationIngestion {
  /** A history's keys are named from `entries`, such as `entries[2].role`. */
  public historyOf(data: unknown): TranscriptHistoryReading {
    const invalidKeys = DocumentShapeUtil.invalidKeysOf({ entries: data }, { entries: { listOf: TRANSCRIPT_ENTRY_SHAPE } });
    if (invalidKeys.length > 0) return { entries: null, reason: { invalidKeys } };
    return { entries: (data as readonly ForgeTranscriptEntryDocument[]).map(transcriptEntryOf) };
  }

  public messageOf(data: unknown): TranscriptMessageReading {
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(data, TRANSCRIPT_ENTRY_SHAPE);
    if (invalidKeys.length > 0) return { entry: null, reason: { invalidKeys } };
    return { entry: transcriptEntryOf(data as ForgeTranscriptEntryDocument) };
  }

  public profileLineOf(data: unknown): ProfileLineReading {
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(data, PROFILE_LINE_SHAPE);
    if (invalidKeys.length > 0) return { line: null, reason: { invalidKeys } };
    return { line: { text: (data as ForgeProfileLineDocument).text } };
  }
}
