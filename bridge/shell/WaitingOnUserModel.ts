/**
 * What waits on User, pure, from the facts already on the board: open decisions (the ones an Assistant escalated apart), draft tickets,
 * filing drafts waiting on an answer, tickets ready for review and tickets waiting for User's merge accept. The header pill and the tab
 * counts read this one aggregate. It orders by the stamp strings, which one writer wrote, so no clock decides the order; ages are only shown.
 */
import type { DisplayState }                                              from '../../src/lib/tracker-model/@types/Task.ts';
import type { MergeQueueDocument, PageDraftDocument, PageTicketDocument } from '../@types/BoardStateDocument.ts';
import type { ConversationBoardDocument }                                 from '../@types/ConversationDocuments.ts';
import { OpenDecisionsUtil }                                              from '../conversation/OpenDecisionsUtil.ts';
import { DraftWordingUtil }                                               from '../utils/DraftWordingUtil.ts';
import { DetailRoute }                                                    from './DetailRoute.ts';
import { HashRouter, type BridgeTab }                                     from './HashRouter.ts';

export type AttentionKind = 'escalated-question' | 'question' | 'draft-ticket' | 'filing-draft' | 'review' | 'merge-accept';

export type TabCountTone = 'waiting' | 'escalated' | 'neutral';

export type AttentionStampWord = 'opened' | 'filed' | 'ready since' | 'reviewed';

export type AttentionActionLabel = 'Answer' | 'Ready' | 'Review' | 'Accept';

export interface AttentionAction {
  readonly label:   AttentionActionLabel;
  readonly href:    string;
  readonly primary: boolean;
}

export interface AttentionItem {
  /** `decision:E3`, `ticket:009`, `draft:D2`, `merge-accept:005`. */
  readonly key:                     string;
  readonly kind:                    AttentionKind;
  /** `E3`, `#009`, `D2`. */
  readonly idText:                  string;
  /** A decision's tickets; empty for a ticket's or a draft's own row. */
  readonly ticketIds:               readonly string[];
  readonly subject:                 string;
  readonly jobId:                   string | null;
  readonly askedBy:                 string | null;
  /** Set only for a decision Overseer code opened, whose kind the row names. */
  readonly decisionKind:            string | null;
  readonly escalatedFromIncidentId: string | null;
  /** The fixed words of a ticket's or a draft's row. */
  readonly metaText:                string | null;
  /** What the age counts from; empty when the board does not hold it. */
  readonly stamp:                   string;
  readonly stampWord:               AttentionStampWord;
  readonly action:                  AttentionAction;
}

export interface WaitingOnUser {
  /** Oldest first. */
  readonly escalated:      readonly AttentionItem[];
  /** Oldest first across kinds; a tie keeps the key order. */
  readonly byAge:          readonly AttentionItem[];
  readonly total:          number;
  readonly escalatedCount: number;
}

export interface TabCount {
  readonly count:     number;
  readonly tone:      TabCountTone;
  readonly ariaLabel: string;
}

export type TabCounts = Partial<Readonly<Record<BridgeTab, TabCount>>>;

/** The board fields this model reads; `BoardStateDocument` and `ConversationBoardDocument` together satisfy it unchanged. */
export interface WaitingOnUserBoard extends Pick<ConversationBoardDocument, 'decisions' | 'questionHistory'> {
  readonly incidents: readonly unknown[];
  readonly page?:       {
    readonly tickets: readonly Pick<PageTicketDocument, 'id' | 'title' | 'status' | 'filed' | 'updated'>[];
    readonly payload: { readonly boardFacts: { readonly drafts?: readonly PageDraftDocument[] } };
  };
  readonly mergeQueue?: MergeQueueDocument;
}

/** How a row names its kind, and the state whose colours it takes; an escalated row takes the error colours instead. */
export interface AttentionKindWording {
  readonly text:  string;
  readonly state: DisplayState;
}

export const ATTENTION_KIND_WORDING: Readonly<Record<AttentionKind, AttentionKindWording>> = {
  'escalated-question': { text: 'Escalated', state: 'ready-for-review' },
  'question':           { text: 'Question', state: 'ready-for-review' },
  'draft-ticket':       { text: 'Draft', state: 'draft' },
  'filing-draft':       { text: 'Draft', state: 'draft' },
  'review':             { text: 'Review', state: 'ready-for-review' },
  'merge-accept':       { text: 'Accept', state: 'ready-for-review' },
};

export const NOTHING_WAITING: WaitingOnUser = {
  escalated: [], byAge: [], total: 0, escalatedCount: 0
};

const AGENT_QUESTION_KIND = 'agent-question';

const DRAFT_STATUS = 'draft';

const READY_FOR_REVIEW_STATUS = 'ready-for-review';

const WAITING_DRAFT_STATE = 'waiting';

const QUESTIONS_HREF = HashRouter.fragmentOf({ tab: 'questions', item: null });

const KANBAN_COUNTED_KINDS: ReadonlySet<AttentionKind> = new Set(['draft-ticket', 'filing-draft', 'review', 'merge-accept']);

type BoardDecision = WaitingOnUserBoard['decisions'][number];

type BoardTicket = NonNullable<WaitingOnUserBoard['page']>['tickets'][number];

function kanbanHrefOf(item: Parameters<typeof DetailRoute.itemTextOf>[0]): string {
  return HashRouter.fragmentOf({ tab: 'kanban', item: DetailRoute.itemTextOf(item) });
}

function emptyItemFields(): Pick<AttentionItem, 'ticketIds' | 'jobId' | 'askedBy' | 'decisionKind' | 'escalatedFromIncidentId' | 'metaText'> {
  return {
    ticketIds: [], jobId: null, askedBy: null, decisionKind: null, escalatedFromIncidentId: null, metaText: null,
  };
}

function decisionItemOf(decision: BoardDecision, escalated: boolean, board: WaitingOnUserBoard): AttentionItem {
  return {
    key:                     `decision:${decision.id}`,
    kind:                    escalated ? 'escalated-question' : 'question',
    idText:                  decision.id,
    ticketIds:               decision.ticketIds,
    subject:                 decision.questions[0]?.question ?? decision.context,
    jobId:                   decision.jobId,
    askedBy:                 decision.askedBy,
    decisionKind:            decision.kind === AGENT_QUESTION_KIND ? null : decision.kind,
    escalatedFromIncidentId: escalated ? OpenDecisionsUtil.escalatingIncidentIdOf(board.questionHistory ?? [], decision.id) : null,
    metaText:                null,
    stamp:                   decision.openedAt,
    stampWord:               'opened',
    action:                  { label: 'Answer', href: QUESTIONS_HREF, primary: escalated },
  };
}

/** A draft ticket's filing stamp; `updated` stands in on a board that does not serve it, since only a transition stamps `updated`. */
function draftTicketItemOf(ticket: BoardTicket): AttentionItem {
  return {
    ...emptyItemFields(),
    key:       `ticket:${ticket.id}`,
    kind:      'draft-ticket',
    idText:    `#${ticket.id}`,
    subject:   ticket.title,
    metaText:  'draft ticket, no row yet',
    stamp:     ticket.filed ?? ticket.updated,
    stampWord: 'filed',
    action:    { label: 'Ready', href: kanbanHrefOf({ form: 'ticket', ticketId: ticket.id }), primary: false },
  };
}

function reviewItemOf(ticket: BoardTicket): AttentionItem {
  return {
    ...emptyItemFields(),
    key:       `ticket:${ticket.id}`,
    kind:      'review',
    idText:    `#${ticket.id}`,
    subject:   ticket.title,
    metaText:  'ready for User\'s review',
    stamp:     ticket.updated,
    stampWord: 'ready since',
    action:    { label: 'Review', href: kanbanHrefOf({ form: 'ticket', ticketId: ticket.id }), primary: false },
  };
}

function filingDraftItemOf(draft: PageDraftDocument): AttentionItem {
  return {
    ...emptyItemFields(),
    key:       `draft:${draft.id}`,
    kind:      'filing-draft',
    idText:    draft.id,
    subject:   draft.title,
    metaText:  DraftWordingUtil.stateLineOf(draft),
    stamp:     draft.openedAt,
    stampWord: 'opened',
    action:    { label: 'Answer', href: kanbanHrefOf({ form: 'draft', draftId: draft.id }), primary: false },
  };
}

function mergeAcceptItemOf(ticketId: string, target: string, ticket: BoardTicket | undefined): AttentionItem {
  return {
    ...emptyItemFields(),
    key:       `merge-accept:${ticketId}`,
    kind:      'merge-accept',
    idText:    `#${ticketId}`,
    subject:   ticket?.title ?? `#${ticketId}`,
    metaText:  `reviewed, waits for User's accept on ${target}`,
    stamp:     ticket?.updated ?? '',
    stampWord: 'reviewed',
    action:    { label: 'Accept', href: kanbanHrefOf({ form: 'ticket', ticketId }), primary: false },
  };
}

function oldestFirst(first: AttentionItem, second: AttentionItem): number {
  if (first.stamp !== second.stamp) return first.stamp < second.stamp ? -1 : 1;
  if (first.key === second.key) return 0;
  return first.key < second.key ? -1 : 1;
}

function itemsOf(board: WaitingOnUserBoard): AttentionItem[] {
  const tickets = board.page?.tickets ?? [];
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const decisions = OpenDecisionsUtil.openDecisionsOf(board).map(({ decision, escalated }) => decisionItemOf(decision, escalated, board));
  const draftTickets = tickets.filter((ticket) => ticket.status === DRAFT_STATUS).map(draftTicketItemOf);
  const filingDrafts = (board.page?.payload.boardFacts.drafts ?? []).filter((draft) => draft.state === WAITING_DRAFT_STATE).map(filingDraftItemOf);
  const reviews = tickets.filter((ticket) => ticket.status === READY_FOR_REVIEW_STATUS).map(reviewItemOf);
  const mergeAccepts = (board.mergeQueue?.targets ?? []).flatMap((target) => (target.waitingForMerge ?? [])
    .map((entry) => mergeAcceptItemOf(entry.ticketId, target.target, ticketById.get(entry.ticketId))));
  return [...decisions, ...draftTickets, ...filingDrafts, ...reviews, ...mergeAccepts];
}

function waitingOnUserOf(board: WaitingOnUserBoard): WaitingOnUser {
  const items = itemsOf(board).toSorted(oldestFirst);
  const escalated = items.filter((item) => item.kind === 'escalated-question');
  return {
    escalated,
    byAge:          items.filter((item) => item.kind !== 'escalated-question'),
    total:          items.length,
    escalatedCount: escalated.length,
  };
}

function waitsWord(count: number): string {
  return count === 1 ? 'waits' : 'wait';
}

function plural(count: number, singular: string, pluralWord: string): string {
  return count === 1 ? singular : pluralWord;
}

function questionsTabCountOf(board: WaitingOnUserBoard, waiting: WaitingOnUser): TabCount | null {
  const count = board.decisions.length;
  if (count === 0) return null;
  const lead = `Questions, ${count} ${plural(count, 'question', 'questions')} ${waitsWord(count)} on User`;
  return {
    count,
    tone:      waiting.escalatedCount > 0 ? 'escalated' : 'waiting',
    ariaLabel: waiting.escalatedCount > 0 ? `${lead}, ${waiting.escalatedCount} escalated` : lead,
  };
}

function kanbanTabCountOf(waiting: WaitingOnUser): TabCount | null {
  const count = waiting.byAge.filter((item) => KANBAN_COUNTED_KINDS.has(item.kind)).length;
  if (count === 0) return null;
  return { count, tone: 'waiting', ariaLabel: `Kanban, ${count} ${waitsWord(count)} on User` };
}

function assistantTabCountOf(board: WaitingOnUserBoard): TabCount | null {
  const count = board.incidents.length;
  if (count === 0) return null;
  return { count, tone: 'neutral', ariaLabel: `Assistant, ${count} ${plural(count, 'incident', 'incidents')} the Assistant is settling` };
}

/** Questions, Kanban and the Assistant, each only while its count is above zero; Intake never, since its drafts and questions count elsewhere. */
function tabCountsOf(board: WaitingOnUserBoard, waiting: WaitingOnUser): TabCounts {
  const questions = questionsTabCountOf(board, waiting);
  const kanban = kanbanTabCountOf(waiting);
  const assistant = assistantTabCountOf(board);
  return {
    ...(questions === null ? {} : { questions }),
    ...(kanban === null ? {} : { kanban }),
    ...(assistant === null ? {} : { assistant }),
  };
}

/** `Waiting on User: 5, 1 escalated`, `Waiting on User: 2`, or `Waiting on User: none`. */
function pillAriaLabelOf(waiting: WaitingOnUser): string {
  if (waiting.total === 0) return 'Waiting on User: none';
  return waiting.escalatedCount > 0 ? `Waiting on User: ${waiting.total}, ${waiting.escalatedCount} escalated` : `Waiting on User: ${waiting.total}`;
}

export const WaitingOnUserModel = Object.freeze({ waitingOnUserOf, tabCountsOf, pillAriaLabelOf });
