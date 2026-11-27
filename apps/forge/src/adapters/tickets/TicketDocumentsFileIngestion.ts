/**
 * One ticket's documents record read into the model: a file that cannot be read or parsed, or that breaks its shape, is a `malformed`
 * verdict with its reason, never a throw. Only the current format is read.
 */
import type {
  CommentAnchor,
  DiagramAnchor,
  DocumentApproval,
  DocumentAnswer,
  DocumentMessage,
  DocumentProposal,
  DocumentVersion,
  LineEdit,
  LineRange,
  TicketDocument,
  TicketDocumentKind,
  TicketDocumentRecord
} from '../../domain/tracker-model/@types/TicketDocument.ts';
import { TICKET_DOCUMENT_KINDS, TICKET_DOCUMENTS_FORMAT_VERSION } from '../../domain/tracker-model/@types/TicketDocument.ts';
import { JsonRecordUtil }                                         from '../../lib/json-record/JsonRecordUtil.ts';
import { storedFileTextOf }                                       from '../StoredFileText.ts';
import { StoredValueUtil }                                        from '../utils/StoredValueUtil.ts';

export type TicketDocumentsFileReading =
  | { verdict: 'parsed'; record: TicketDocumentRecord }
  | { verdict: 'malformed'; reason: string };

/** Thrown inside the parse only, and read back as the verdict's reason. */
class RecordShapeProblem extends Error {}

function problem(reason: string): never {
  throw new RecordShapeProblem(reason);
}

function objectAt(value: unknown, where: string): Record<string, unknown> {
  return JsonRecordUtil.recordOf(value) ?? problem(`${where} is not an object`);
}

function textAt(value: unknown, where: string): string {
  return typeof value === 'string' ? value : problem(`${where} is not text`);
}

function countAt(value: unknown, where: string): number {
  return StoredValueUtil.wholeNumberIsAtLeast(value, 0) ? value : problem(`${where} is not a whole number`);
}

function listAt(value: unknown, where: string): unknown[] {
  return Array.isArray(value) ? value : problem(`${where} is not a list`);
}

function oneOf<Value extends string>(value: unknown, allowed: readonly Value[], where: string): Value {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as Value : problem(`${where} is not one of ${allowed.join(', ')}`);
}

/** An optional key: absent stays absent, so the record writes back as it was read. */
function optional<Value>(fields: Record<string, unknown>, key: string, read: (value: unknown) => Value): Partial<Record<string, Value>> {
  return Object.hasOwn(fields, key) ? { [key]: read(fields[key]) } : {};
}

function rangeAt(value: unknown, where: string): LineRange {
  const range = objectAt(value, where);
  return { from: countAt(range['from'], `${where}.from`), to: countAt(range['to'], `${where}.to`) };
}

function versionAt(value: unknown, where: string): DocumentVersion {
  const fields = objectAt(value, where);
  return {
    number:      countAt(fields['number'], `${where}.number`),
    contentHash: textAt(fields['contentHash'], `${where}.contentHash`),
    author:      oneOf(fields['author'], ['person', 'agent'], `${where}.author`),
    ...optional(fields, 'jobId', (jobId) => textAt(jobId, `${where}.jobId`)),
    at:          textAt(fields['at'], `${where}.at`),
    ...optional(fields, 'constitutionCommit', (commit) => textAt(commit, `${where}.constitutionCommit`)),
  };
}

function approvalAt(value: unknown, where: string): DocumentApproval {
  const fields = objectAt(value, where);
  return {
    number:             countAt(fields['number'], `${where}.number`),
    contentHash:        textAt(fields['contentHash'], `${where}.contentHash`),
    by:                 oneOf(fields['by'], ['person', 'pipeline'], `${where}.by`),
    at:                 textAt(fields['at'], `${where}.at`),
    constitutionCommit: textAt(fields['constitutionCommit'], `${where}.constitutionCommit`),
    ...optional(fields, 'onSpecNumber', (number) => countAt(number, `${where}.onSpecNumber`)),
    ...optional(fields, 'onSpecContentHash', (hash) => textAt(hash, `${where}.onSpecContentHash`)),
  };
}

function diagramAt(value: unknown, where: string): DiagramAnchor {
  const fields = objectAt(value, where);
  return {
    lines:       rangeAt(fields['lines'], `${where}.lines`),
    diagramKind: textAt(fields['diagramKind'], `${where}.diagramKind`),
    nodeId:      textAt(fields['nodeId'], `${where}.nodeId`),
    nodeLabel:   textAt(fields['nodeLabel'], `${where}.nodeLabel`),
  };
}

function anchorAt(value: unknown, where: string): CommentAnchor {
  const fields = objectAt(value, where);
  return {
    view:             oneOf(fields['view'], ['preview', 'code'], `${where}.view`),
    versionNumber:    countAt(fields['versionNumber'], `${where}.versionNumber`),
    lines:            rangeAt(fields['lines'], `${where}.lines`),
    ...optional(fields, 'columns', (columns) => rangeAt(columns, `${where}.columns`)),
    sectionPath:      listAt(fields['sectionPath'], `${where}.sectionPath`).map((heading, index) => textAt(heading, `${where}.sectionPath[${index}]`)),
    ...optional(fields, 'quote', (quote) => textAt(quote, `${where}.quote`)),
    surroundingLines: rangeAt(fields['surroundingLines'], `${where}.surroundingLines`),
    ...optional(fields, 'diagram', (diagram) => diagramAt(diagram, `${where}.diagram`)),
  };
}

function textOrNullAt(value: unknown, where: string): string | null {
  return value === null ? null : textAt(value, where);
}

function answerAt(value: unknown, where: string): DocumentAnswer {
  const fields = objectAt(value, where);
  return {
    question: textAt(fields['question'], `${where}.question`),
    choice:   textOrNullAt(fields['choice'], `${where}.choice`),
    note:     textOrNullAt(fields['note'], `${where}.note`),
  };
}

function messageAt(value: unknown, where: string): DocumentMessage {
  const fields = objectAt(value, where);
  return {
    messageId: textAt(fields['messageId'], `${where}.messageId`),
    ...optional(fields, 'commentNumber', (number) => countAt(number, `${where}.commentNumber`)),
    ...optional(fields, 'decisionId', (decisionId) => textAt(decisionId, `${where}.decisionId`)),
    ...optional(fields, 'answer', (answer) => answerAt(answer, `${where}.answer`)),
    ...optional(fields, 'anchor', (anchor) => anchorAt(anchor, `${where}.anchor`)),
    ...optional(fields, 'placement', (placement) => rangeAt(placement, `${where}.placement`)),
    ...optional(fields, 'orphaned', (orphaned) => (orphaned === true ? true as const : problem(`${where}.orphaned is not true`))),
    text:      textAt(fields['text'], `${where}.text`),
    from:      oneOf(fields['from'], ['person', 'board'], `${where}.from`),
    state:     oneOf(fields['state'], ['queued', 'sent', 'applied', 'withdrawn'], `${where}.state`),
    queuedAt:  textAt(fields['queuedAt'], `${where}.queuedAt`),
    ...optional(fields, 'deliveryNumber', (number) => countAt(number, `${where}.deliveryNumber`)),
    ...optional(fields, 'agentTurn', (number) => countAt(number, `${where}.agentTurn`)),
  };
}

function linesAt(value: unknown, where: string): string[] {
  return listAt(value, where).map((line, index) => textAt(line, `${where}[${index}]`));
}

function editAt(value: unknown, where: string): LineEdit {
  const fields = objectAt(value, where);
  return {
    fromLine:         countAt(fields['fromLine'], `${where}.fromLine`),
    toLine:           countAt(fields['toLine'], `${where}.toLine`),
    originalLines:    linesAt(fields['originalLines'], `${where}.originalLines`),
    replacementLines: linesAt(fields['replacementLines'], `${where}.replacementLines`),
  };
}

function proposalAt(value: unknown, where: string): DocumentProposal {
  const fields = objectAt(value, where);
  return {
    proposalId: textAt(fields['proposalId'], `${where}.proposalId`),
    jobId:      textAt(fields['jobId'], `${where}.jobId`),
    baseNumber: fields['baseNumber'] === null ? null : countAt(fields['baseNumber'], `${where}.baseNumber`),
    edits:      listAt(fields['edits'], `${where}.edits`).map((edit, index) => editAt(edit, `${where}.edits[${index}]`)),
    summary:    textAt(fields['summary'], `${where}.summary`),
    ...optional(fields, 'answersMessageId', (messageId) => textAt(messageId, `${where}.answersMessageId`)),
    ...optional(fields, 'forSpecNumber', (number) => countAt(number, `${where}.forSpecNumber`)),
    state:      oneOf(fields['state'], ['proposed', 'applied', 'discarded', 'conflicted'], `${where}.state`),
    ...optional(fields, 'appliedNumber', (number) => countAt(number, `${where}.appliedNumber`)),
    at:         textAt(fields['at'], `${where}.at`),
  };
}

function documentAt(value: unknown, where: string): TicketDocument {
  const fields = objectAt(value, where);
  const listOf = <Item>(key: string, read: (item: unknown, itemWhere: string) => Item): Item[] => listAt(fields[key], `${where}.${key}`)
    .map((item, index) => read(item, `${where}.${key}[${index}]`));
  return {
    kind:               oneOf<TicketDocumentKind>(fields['kind'], TICKET_DOCUMENT_KINDS, `${where}.kind`),
    versions:           listOf('versions', versionAt),
    approvals:          listOf('approvals', approvalAt),
    messages:           listOf('messages', messageAt),
    proposals:          listOf('proposals', proposalAt),
    proposalMode:       oneOf(fields['proposalMode'], ['ask-first', 'auto-apply'], `${where}.proposalMode`),
    ...optional(fields, 'readyAtNumber', (number) => countAt(number, `${where}.readyAtNumber`)),
    nextMessageNumber:  countAt(fields['nextMessageNumber'], `${where}.nextMessageNumber`),
    nextCommentNumber:  countAt(fields['nextCommentNumber'], `${where}.nextCommentNumber`),
    nextProposalNumber: countAt(fields['nextProposalNumber'], `${where}.nextProposalNumber`),
  };
}

function recordOf(value: unknown): TicketDocumentRecord {
  const fields = objectAt(value, 'the record');
  if (fields['version'] !== TICKET_DOCUMENTS_FORMAT_VERSION) problem(`version is not ${TICKET_DOCUMENTS_FORMAT_VERSION}`);
  const documents = listAt(fields['documents'], 'documents').map((document, index) => documentAt(document, `documents[${index}]`));
  const kinds = documents.map((document) => document.kind);
  if (new Set(kinds).size !== kinds.length) problem('documents holds a kind twice');
  return {
    version:  TICKET_DOCUMENTS_FORMAT_VERSION,
    ticketId: textAt(fields['ticketId'], 'ticketId'),
    openedAt: textAt(fields['openedAt'], 'openedAt'),
    documents,
  };
}

function parsedRecordOf(text: string): TicketDocumentsFileReading {
  const parsed = StoredValueUtil.parsedJsonOf(text);
  if (parsed.verdict === 'unparseable') return { verdict: 'malformed', reason: parsed.problem };
  try {
    return { verdict: 'parsed', record: recordOf(parsed.value) };
  } catch (error) {
    if (error instanceof RecordShapeProblem) return { verdict: 'malformed', reason: error.message };
    throw error;
  }
}

export class TicketDocumentsFileIngestion {
  constructor(private readonly recordFilePath: string) {}

  read(): TicketDocumentsFileReading {
    const stored = storedFileTextOf(this.recordFilePath);
    if (stored.verdict === 'absent') return { verdict: 'malformed', reason: 'the file is missing' };
    if (stored.verdict === 'unreadable') return { verdict: 'malformed', reason: stored.reason };
    return parsedRecordOf(stored.text);
  }

  static parsedRecordOf(text: string): TicketDocumentsFileReading {
    return parsedRecordOf(text);
  }
}
