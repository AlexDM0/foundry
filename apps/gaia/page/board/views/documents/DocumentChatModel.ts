/**
 * A document agent's chat, pure: the job's transcript as `ChatThreadModel` reads it, its own user lines left out since the document's
 * messages stand for them, each placed before the turn it opened (`agentTurn`). The agent works while its newest turn has not ended; on a
 * comment older than User's latest change, a notice says its edit lands on User's text.
 */
import type { BoardTranscriptEntryDocument } from '../../../@types/board/ConversationDocument.ts';
import type {
  BoardDocumentMessageDocument,
  BoardDocumentProposalDocument,
  BoardEffectReadingDocument,
  BoardLineRangeDocument,
  BoardTicketDocumentDocument
} from '../../../@types/board/TicketDocumentsDocument.ts';
import { ChatThreadModelUtil, type ToolCall }        from '../../conversation/ChatThreadModel.ts';
import { CommentPopoverModel, type AnchorLineParts } from './CommentPopoverModel.ts';
import type {
  AgentTurnProgress,
  AnsweredQuestionModel,
  DocumentQuestions,
  OpenQuestionModel
} from './DocumentQuestionsModel.ts';
import { ProposalModel, type OpenProposalModel } from './ProposalModel.ts';

export interface ChatMessageItem {
  readonly kind:        'message';
  readonly key:         string;
  readonly messageId:   string;
  /** `C2 · § 4 Acceptance › A3 · line 29 · Preview`; `null` for a message about the whole document. */
  readonly anchorLine:  string | null;
  readonly anchorParts: AnchorLineParts | null;
  readonly quote:       string | null;
  /** Where the comment stands on the head version, which its card jumps to; `null` when unanchored or orphaned. */
  readonly placement:   BoardLineRangeDocument | null;
  readonly orphaned:    boolean;
  /** The agent is answering it now. */
  readonly answering:   boolean;
  /** An edit the agent proposed for it waits on User. */
  readonly hasOpenEdit: boolean;
  readonly text:        string;
}

export interface ChatBoardNoteItem {
  readonly kind: 'board-note';
  readonly key:  string;
  readonly text: string;
}

export interface ChatAgentTurnItem {
  readonly kind:    'agent-turn';
  readonly key:     string;
  readonly prose:   string;
  readonly working: boolean;
}

export interface ChatProposalItem {
  readonly kind:          'proposal';
  readonly key:           string;
  readonly proposal:      OpenProposalModel;
  /** The comment an Apply closes, `null` for an edit that answers none. */
  readonly closesComment: number | null;
}

export interface ChatProposalNoteItem {
  readonly kind:          'proposal-note';
  readonly key:           string;
  readonly text:          string;
  /** The edited lines' numbers in the text: "20, 37–39". */
  readonly editedNumbers: string;
}

export interface ChatEffectCardItem {
  readonly kind:            'effect-card';
  readonly key:             string;
  readonly placeCount:      number;
  readonly unresolvedCount: number;
}

export interface ChatOpenQuestionItem {
  readonly kind:     'open-question';
  readonly key:      string;
  readonly question: OpenQuestionModel;
}

export interface ChatAnsweredQuestionItem {
  readonly kind:     'answered-question';
  readonly key:      string;
  readonly answered: AnsweredQuestionModel;
}

export type DocumentChatItem =
  | ChatMessageItem
  | ChatBoardNoteItem
  | ChatAgentTurnItem
  | ChatProposalItem
  | ChatProposalNoteItem
  | ChatEffectCardItem
  | ChatOpenQuestionItem
  | ChatAnsweredQuestionItem;

export interface QueuedMessageItem {
  readonly messageId:   string;
  readonly anchorLine:  string | null;
  readonly anchorParts: AnchorLineParts | null;
  readonly text:        string;
}

export interface DocumentChat {
  readonly items:              readonly DocumentChatItem[];
  readonly queued:             readonly QueuedMessageItem[];
  /** The agent's newest turn has not ended. */
  readonly working:            boolean;
  /** The comment the agent answers now, `null` while it answers none. */
  readonly answeringComment:   number | null;
  /** The version the message the agent answers was made on, `null` while it answers none. */
  readonly answeringOnVersion: number | null;
  /** Where the message the agent answers stands on the head, `null` while it answers none or its text is gone. */
  readonly answeringLines:     BoardLineRangeDocument | null;
  /** The newest call of the working turn, `null` while it calls nothing. */
  readonly runningCall:        ToolCall | null;
}

const USER_ROLE = 'user';

/** The transcript in turns: a turn starts at each of the job's user lines, so the user line numbered n opens turn n. */
function turnsOf(entries: readonly BoardTranscriptEntryDocument[]): BoardTranscriptEntryDocument[][] {
  const turns: BoardTranscriptEntryDocument[][] = [[]];
  for (const entry of entries) {
    if (entry.role === USER_ROLE && entry.parentToolUseId === null) turns.push([]);
    else turns.at(-1)?.push(entry);
  }
  return turns;
}

function anchorPartsOf(message: BoardDocumentMessageDocument): AnchorLineParts | null {
  return message.anchor === null || message.commentNumber === null ? null : CommentPopoverModel.anchorLinePartsOf(message.commentNumber, message.anchor, message.placement);
}

function anchorLineOf(message: BoardDocumentMessageDocument): string | null {
  return message.anchor === null || message.commentNumber === null ? null : CommentPopoverModel.anchorLineOf(message.commentNumber, message.anchor, message.placement);
}

type MessageChatItem = ChatMessageItem | ChatBoardNoteItem | ChatAnsweredQuestionItem;

function messageItemOf(message: BoardDocumentMessageDocument, answering: boolean, hasOpenEdit: boolean, answered: AnsweredQuestionModel | undefined): MessageChatItem {
  if (message.from === 'board') return { kind: 'board-note', key: message.messageId, text: message.text };
  if (answered !== undefined) return { kind: 'answered-question', key: message.messageId, answered };
  return {
    kind:        'message',
    key:         message.messageId,
    messageId:   message.messageId,
    anchorLine:  anchorLineOf(message),
    anchorParts: anchorPartsOf(message),
    quote:       message.anchor === null ? null : message.anchor.diagram?.nodeLabel ?? message.anchor.quote,
    placement:   message.placement,
    orphaned:    message.orphaned,
    answering,
    hasOpenEdit,
    text:        message.text,
  };
}

function queuedItemOf(message: BoardDocumentMessageDocument): QueuedMessageItem {
  return {
    messageId: message.messageId, anchorLine: anchorLineOf(message), anchorParts: anchorPartsOf(message), text: message.text
  };
}

function agentTurnItemsOf(entries: readonly BoardTranscriptEntryDocument[], turnNumber: number): ChatAgentTurnItem[] {
  return ChatThreadModelUtil.threadItemsOf(entries, []).flatMap((item): ChatAgentTurnItem[] => (
    item.kind === 'agent-turn' ? [{
      kind: 'agent-turn', key: `${turnNumber}.${item.key}`, prose: item.prose, working: item.working
    }] : []
  ));
}

function runningCallOf(entries: readonly BoardTranscriptEntryDocument[]): ToolCall | null {
  const lastTurn = ChatThreadModelUtil.threadItemsOf(entries, []).findLast((item) => item.kind === 'agent-turn');
  if (lastTurn?.kind !== 'agent-turn' || !lastTurn.working) return null;
  return lastTurn.toolFold?.calls.findLast((call) => call.state === 'running') ?? null;
}

function proposalItemOf(document: BoardTicketDocumentDocument, proposal: BoardDocumentProposalDocument): DocumentChatItem[] {
  if (proposal.state === 'proposed') {
    const answered = document.messages.find((message) => message.messageId === proposal.answersMessageId) ?? null;
    return [{
      kind:          'proposal',
      key:           proposal.proposalId,
      proposal:      ProposalModel.openProposalOf(document.document, proposal),
      closesComment: answered?.commentNumber ?? null,
    }];
  }
  const note = ProposalModel.settledNoteOf(proposal);
  return note === null ? [] : [{
    kind: 'proposal-note', key: proposal.proposalId, text: note, editedNumbers: ProposalModel.editedNumbersOf(proposal)
  }];
}

function effectCardOf(reading: BoardEffectReadingDocument | null): ChatEffectCardItem[] {
  if (reading?.state !== 'read') return [];
  return [{
    kind:            'effect-card',
    key:             `effect.${reading.versionNumber}`,
    placeCount:      reading.references.length,
    unresolvedCount: reading.entries.filter((entry) => entry.change === 'unresolved').length,
  }];
}

const NO_QUESTIONS: DocumentQuestions = { open: [], answered: [] };

/** The newest turn the transcript holds and whether the agent is still in it, for the answers its turns settle. */
function agentTurnProgressOf(entries: readonly BoardTranscriptEntryDocument[]): AgentTurnProgress {
  const turns = turnsOf(entries);
  const working = turns.flatMap((turnEntries, turnNumber) => agentTurnItemsOf(turnEntries, turnNumber)).at(-1)?.working ?? false;
  return { newestTurn: turns.length - 1, working };
}

function documentChatOf(
  document: BoardTicketDocumentDocument,
  entries: readonly BoardTranscriptEntryDocument[],
  effectReading: BoardEffectReadingDocument | null,
  questions: DocumentQuestions = NO_QUESTIONS,
): DocumentChat {
  const turns = turnsOf(entries);
  const turnItems = turns.map((turnEntries, turnNumber) => agentTurnItemsOf(turnEntries, turnNumber));
  const working = turnItems.flat().at(-1)?.working ?? false;
  const lastTurnNumber = turns.length - 1;
  const shown = document.messages.filter((message) => message.state !== 'queued' && message.state !== 'withdrawn');
  const takenIn = (message: BoardDocumentMessageDocument): number | null => (
    message.agentTurn !== null && message.agentTurn <= lastTurnNumber ? message.agentTurn : null
  );
  const answeringMessage = working ? shown.findLast((message) => message.from === 'person' && takenIn(message) === lastTurnNumber) ?? null : null;
  const turnOfMessage = new Map(shown.map((message) => [message.messageId, takenIn(message)]));
  const turnOfProposal = (proposal: BoardDocumentProposalDocument): number | null => (
    proposal.answersMessageId === null ? null : turnOfMessage.get(proposal.answersMessageId) ?? null
  );
  const messagesWithOpenEdits = new Set(document.proposals.flatMap((proposal) => (
    proposal.state === 'proposed' && proposal.answersMessageId !== null ? [proposal.answersMessageId] : []
  )));
  const answeredByMessage = new Map(questions.answered.map((answered) => [answered.messageId, answered]));
  const itemOf = (message: BoardDocumentMessageDocument): MessageChatItem => (
    messageItemOf(message, message === answeringMessage, messagesWithOpenEdits.has(message.messageId), answeredByMessage.get(message.messageId))
  );
  // An answer waiting for the agent's turn to end is not a message User may take back: it stands as its card, not in the queue.
  const answeredItemOf = (answered: AnsweredQuestionModel): ChatAnsweredQuestionItem => ({ kind: 'answered-question', key: answered.messageId, answered });
  const queuedAnswers = questions.answered.filter((answered) => answered.waitsForAgent).map(answeredItemOf);
  const openQuestionItems = questions.open.map((question): ChatOpenQuestionItem => ({ kind: 'open-question', key: question.decisionId, question }));

  // The effect reading answers User's newest ask, so its card stands under that ask, before the agent's reply.
  const turnOfNewestAsk = shown.reduce<number | null>((newest, message) => {
    const turn = takenIn(message);
    return message.from === 'person' && turn !== null && (newest === null || turn > newest) ? turn : newest;
  }, null);
  const effectCard = effectCardOf(effectReading);
  const items: DocumentChatItem[] = turnItems.flatMap((agentItems, turnNumber) => [
    ...shown.filter((message) => takenIn(message) === turnNumber).map(itemOf),
    ...turnNumber === turnOfNewestAsk ? effectCard : [],
    ...agentItems,
    ...document.proposals.filter((proposal) => turnOfProposal(proposal) === turnNumber).flatMap((proposal) => proposalItemOf(document, proposal)),
  ]);

  return {
    items: [
      ...items,
      ...shown.filter((message) => takenIn(message) === null).map(itemOf),
      ...document.proposals.filter((proposal) => turnOfProposal(proposal) === null).flatMap((proposal) => proposalItemOf(document, proposal)),
      ...turnOfNewestAsk === null ? effectCard : [],
      ...queuedAnswers,
      ...openQuestionItems,
    ],
    queued:             document.messages.filter((message) => message.state === 'queued' && message.decisionId === null).map(queuedItemOf),
    working,
    answeringComment:   answeringMessage?.commentNumber ?? null,
    answeringOnVersion: answeringMessage?.anchor?.versionNumber ?? null,
    answeringLines:     answeringMessage?.placement ?? null,
    runningCall:        runningCallOf(turns.at(-1) ?? []),
  };
}

export interface UserEditReading {
  readonly document:  BoardTicketDocumentDocument;
  readonly chat:      DocumentChat;
  /** User's text differs from the head in Code or Split. */
  readonly editing:   boolean;
  /** The line User's caret stands on in Code or Split, `null` elsewhere. */
  readonly caretLine: number | null;
}

/**
 * "You changed line 34 while the agent works. It proposes against v6, so its edit to lines 17–23 lands on your text, not over it.": while
 * the agent works on a comment made on an older version, once User saved a version since or is typing; `null` otherwise.
 */
function userEditNoticeOf({
  document, chat, editing, caretLine
}: UserEditReading): string | null {
  const startedOn = chat.answeringOnVersion;
  if (!chat.working || startedOn === null || document.head === null) return null;
  const savedSince = [...document.versions, document.head].some((version) => version.number > startedOn && version.author === 'person');
  if (!savedSince && !editing) return null;
  const changed = caretLine === null ? `the ${document.document}` : `line ${caretLine}`;
  const edit = chat.answeringLines === null ? 'its edit' : `its edit to ${CommentPopoverModel.linesTextOf(chat.answeringLines)}`;
  return `You changed ${changed} while the agent works. It proposes against v${document.head.number}, so ${edit} lands on your text, not over it.`;
}

export const DocumentChatModel = Object.freeze({
  documentChatOf, turnsOf, agentTurnProgressOf, userEditNoticeOf
});
