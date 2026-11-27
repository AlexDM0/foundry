/**
 * Follows one job's transcript through Gaia's relay: a `history` event after the cursor, then a `message` per new entry. The last cursor is
 * kept, so a panel reopened on the same job resumes after it; one log line can give several entries with one cursor, so an entry is known by
 * its `entryKey`.
 */
import { PAGE_CONTRACT_VERSIONS }            from '../../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }               from '../../../src/shared/utils/ContractVersionUtil.ts';
import type { BoardTranscriptEntryDocument } from '../../@types/board/ConversationDocument.ts';
import { BoardApiPaths }                     from './BoardApiPaths.ts';
import {
  BROWSER_RELAY_STREAM_SURROUNDINGS,
  parsedDataOf,
  type RelayEventSource,
  type RelayStreamSurroundings
} from './RelayStreamSource.ts';
import { EVENT_SOURCE_CLOSED_READY_STATE, STREAM_REOPEN_DELAY_MILLISECONDS } from './constants/StreamReopening.ts';

export interface TranscriptStreamHandlers {
  readonly onEntries:  (entries: readonly BoardTranscriptEntryDocument[]) => void;
  /** The `history` event arrived, after its entries and also when it brought none. */
  readonly onHistory?: () => void;
}

export interface TranscriptStream {
  readonly close:      () => void;
  readonly lastCursor: () => string | null;
}

export interface TranscriptStreamOptions {
  readonly after?:        string | null;
  readonly surroundings?: RelayStreamSurroundings;
}

const CONVERSATION_VERSION_KEYS = { majorKey: 'boardVersion' } as const;

function isEntry(value: unknown): value is BoardTranscriptEntryDocument {
  if (typeof value !== 'object' || value === null) return false;
  const {
    cursor, entryKey, role, text, at
  } = value as Partial<Record<keyof BoardTranscriptEntryDocument, unknown>>;
  return typeof cursor === 'string' && typeof entryKey === 'string' && typeof role === 'string' && typeof text === 'string' && (typeof at === 'string' || at === null);
}

/** The conversation document an event carries at this page's version, `null` for anything else. */
function conversationDocumentOf(event: Event): Readonly<Record<string, unknown>> | null {
  const data = parsedDataOf(event);
  return ContractVersionUtil.readMajorOf(data, CONVERSATION_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaBoard) === null ? null : data as Readonly<Record<string, unknown>>;
}

/**
 * The browser's own reconnect sends the last cursor as `Last-Event-ID`; a stream it gave up on is opened again here after the last cursor
 * received. Either way an entry already received is dropped, so a replay never shows a line twice.
 */
function follow(trackerId: string, jobId: string, handlers: TranscriptStreamHandlers, options: TranscriptStreamOptions = {}): TranscriptStream {
  const { openEventSource, schedule } = options.surroundings ?? BROWSER_RELAY_STREAM_SURROUNDINGS;
  let lastCursor = options.after ?? null;
  const receivedEntryKeys = new Set<string>();
  let source: RelayEventSource | null = null;
  let cancelReopen: (() => void) | null = null;
  let closed = false;

  const receive = (entries: readonly unknown[]): void => {
    const fresh = entries.filter(isEntry).filter((entry) => !receivedEntryKeys.has(entry.entryKey));
    if (fresh.length === 0) return;
    fresh.forEach((entry) => receivedEntryKeys.add(entry.entryKey));
    lastCursor = fresh.at(-1)?.cursor ?? lastCursor;
    handlers.onEntries(fresh);
  };

  const connect = (): void => {
    cancelReopen = null;
    if (closed) return;
    const opened = openEventSource(BoardApiPaths.jobStreamPathOf(trackerId, jobId, lastCursor));
    source = opened;
    opened.addEventListener('history', (event) => {
      const document = conversationDocumentOf(event);
      if (document === null || document['kind'] !== 'history') return;
      const { entries } = document;
      receive(Array.isArray(entries) ? entries : []);
      handlers.onHistory?.();
    });
    opened.addEventListener('message', (event) => {
      const document = conversationDocumentOf(event);
      if (document !== null && document['kind'] === 'message') receive([document['entry']]);
    });
    opened.addEventListener('error', () => {
      if (opened.readyState !== EVENT_SOURCE_CLOSED_READY_STATE || closed) return;
      cancelReopen = schedule(connect, STREAM_REOPEN_DELAY_MILLISECONDS);
    });
  };

  connect();
  return {
    close: () => {
      closed = true;
      cancelReopen?.();
      source?.close();
    },
    lastCursor: () => lastCursor,
  };
}

export const TranscriptStreamClient = Object.freeze({ follow });
