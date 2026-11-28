/**
 * What waits on User, pure, from the board's facts: open decisions, draft tickets but one an agent is writing, filing drafts waiting on an
 * answer, and tickets ready for review or for User's merge accept. The board document and the monitor snapshot share this one list. It
 * orders by the stamp strings, which one writer wrote, so no clock decides the order; ages are only shown.
 */
import type { DraftState }                          from '../../domain/tracker-model/@types/Draft.ts';
import type { MonitorAttentionEntry }               from './@types/MonitorSnapshot.ts';
import { DraftWordingUtil }                         from './utils/DraftWordingUtil.ts';
import { OpenDecisionsUtil, type EscalationRecord } from './utils/OpenDecisionsUtil.ts';

export type AttentionEntry = MonitorAttentionEntry;

interface AttentionDecision {
  readonly id:        string;
  readonly kind:      string;
  readonly ticketIds: readonly string[];
  readonly jobId:     string | null;
  readonly askedBy:   string;
  readonly questions: readonly { readonly question: string }[];
  readonly context:   string;
  readonly openedAt:  string;
}

interface AttentionTicket {
  readonly id:      string;
  readonly title:   string;
  readonly status:  string;
  readonly filed?:  string;
  readonly updated: string;
  /** Where a ticket being written stands; absent or `null` for a draft whose intake shapes it, which waits on User. */
  readonly draft?:  { readonly waitsOnUser: string | null } | null;
}

interface AttentionDraft {
  readonly id:                string;
  readonly title:             string;
  readonly state:             DraftState;
  readonly openQuestionCount: number;
  readonly openedAt:          string;
}

/** The board fields the list reads; Hephaestus's state and the served board document both fit unchanged. */
export interface AttentionBoard {
  readonly decisions:        readonly AttentionDecision[];
  readonly questionHistory?: readonly EscalationRecord[];
  readonly page?:            {
    readonly tickets: readonly AttentionTicket[];
    readonly payload: { readonly boardFacts: { readonly drafts?: readonly AttentionDraft[] } };
  };
  readonly mergeQueue?:      {
    readonly targets: readonly { readonly target: string; readonly waitingForMerge?: readonly { readonly ticketId: string }[] }[];
  };
}

const AGENT_QUESTION_KIND = 'agent-question';

const DRAFT_STATUS = 'draft';

const READY_FOR_REVIEW_STATUS = 'ready-for-review';

const WAITING_DRAFT_STATE = 'waiting';

function emptyEntryFields(): Pick<AttentionEntry, 'ticketIds' | 'jobId' | 'askedBy' | 'decisionKind' | 'escalatedFromIncidentId' | 'metaText'> {
  return {
    ticketIds: [], jobId: null, askedBy: null, decisionKind: null, escalatedFromIncidentId: null, metaText: null,
  };
}

function decisionEntryOf(decision: AttentionDecision, escalated: boolean, board: AttentionBoard): AttentionEntry {
  return {
    key:                     `decision:${decision.id}`,
    kind:                    escalated ? 'escalated-question' : 'question',
    idText:                  decision.id,
    ticketIds:               [...decision.ticketIds],
    subject:                 decision.questions[0]?.question ?? decision.context,
    jobId:                   decision.jobId,
    askedBy:                 decision.askedBy,
    decisionKind:            decision.kind === AGENT_QUESTION_KIND ? null : decision.kind,
    escalatedFromIncidentId: escalated ? OpenDecisionsUtil.escalatingIncidentIdOf(board.questionHistory ?? [], decision.id) : null,
    metaText:                null,
    stamp:                   decision.openedAt,
    stampWord:               'opened',
    actionLabel:             'Answer',
    target:                  { subject: 'decision', id: decision.id },
  };
}

/** A draft ticket's filing stamp; `updated` stands in on a board that does not serve it, since only a transition stamps `updated`. */
function draftTicketEntryOf(ticket: AttentionTicket): AttentionEntry {
  return {
    ...emptyEntryFields(),
    key:         `ticket:${ticket.id}`,
    kind:        'draft-ticket',
    idText:      `#${ticket.id}`,
    subject:     ticket.title,
    metaText:    'draft ticket, no row yet',
    stamp:       ticket.filed ?? ticket.updated,
    stampWord:   'filed',
    actionLabel: 'Ready',
    target:      { subject: 'ticket', id: ticket.id },
  };
}

function reviewEntryOf(ticket: AttentionTicket): AttentionEntry {
  return {
    ...emptyEntryFields(),
    key:         `ticket:${ticket.id}`,
    kind:        'review',
    idText:      `#${ticket.id}`,
    subject:     ticket.title,
    metaText:    'ready for User\'s review',
    stamp:       ticket.updated,
    stampWord:   'ready since',
    actionLabel: 'Review',
    target:      { subject: 'ticket', id: ticket.id },
  };
}

function filingDraftEntryOf(draft: AttentionDraft): AttentionEntry {
  return {
    ...emptyEntryFields(),
    key:         `draft:${draft.id}`,
    kind:        'filing-draft',
    idText:      draft.id,
    subject:     draft.title,
    metaText:    DraftWordingUtil.stateLineOf(draft),
    stamp:       draft.openedAt,
    stampWord:   'opened',
    actionLabel: 'Answer',
    target:      { subject: 'draft', id: draft.id },
  };
}

function mergeAcceptEntryOf(ticketId: string, target: string, ticket: AttentionTicket | undefined): AttentionEntry {
  return {
    ...emptyEntryFields(),
    key:         `merge-accept:${ticketId}`,
    kind:        'merge-accept',
    idText:      `#${ticketId}`,
    subject:     ticket?.title ?? `#${ticketId}`,
    metaText:    `reviewed, waits for User's accept on ${target}`,
    stamp:       ticket?.updated ?? '',
    stampWord:   'reviewed',
    actionLabel: 'Accept',
    target:      { subject: 'ticket', id: ticketId },
  };
}

/** A spec-then-plan draft waits on User only while its stage names a wait; until then its agent writes it. */
function draftWaitsOnUser(ticket: AttentionTicket): boolean {
  return ticket.status === DRAFT_STATUS && (ticket.draft === undefined || ticket.draft === null || ticket.draft.waitsOnUser !== null);
}

function oldestFirst(first: AttentionEntry, second: AttentionEntry): number {
  if (first.stamp !== second.stamp) return first.stamp < second.stamp ? -1 : 1;
  if (first.key === second.key) return 0;
  return first.key < second.key ? -1 : 1;
}

/** Escalated entries first, then every other kind; each part oldest first, a tie in the key order. */
export function attentionEntriesOf(board: AttentionBoard): AttentionEntry[] {
  const tickets = board.page?.tickets ?? [];
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const decisions = OpenDecisionsUtil.openDecisionsOf(board).map(({ decision, escalated }) => decisionEntryOf(decision, escalated, board));
  const draftTickets = tickets.filter(draftWaitsOnUser).map(draftTicketEntryOf);
  const filingDrafts = (board.page?.payload.boardFacts.drafts ?? []).filter((draft) => draft.state === WAITING_DRAFT_STATE).map(filingDraftEntryOf);
  const reviews = tickets.filter((ticket) => ticket.status === READY_FOR_REVIEW_STATUS).map(reviewEntryOf);
  const mergeAccepts = (board.mergeQueue?.targets ?? []).flatMap((target) => (target.waitingForMerge ?? [])
    .map((entry) => mergeAcceptEntryOf(entry.ticketId, target.target, ticketById.get(entry.ticketId))));
  const entries = [...decisions, ...draftTickets, ...filingDrafts, ...reviews, ...mergeAccepts].toSorted(oldestFirst);
  return [...entries.filter((entry) => entry.kind === 'escalated-question'), ...entries.filter((entry) => entry.kind !== 'escalated-question')];
}
