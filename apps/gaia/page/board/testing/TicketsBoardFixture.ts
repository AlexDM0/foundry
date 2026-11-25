/**
 * Small synthetic boards in the page's board contract holding exactly what the Tickets view reads, for its model specs, its DOM spec and
 * the painted Tickets screens: tickets with the forge's draft facts and document summaries, two epics, and the jobs, decisions and filing
 * drafts a board holds. Test-only.
 */
import type { BoardDecisionDocument } from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }         from '../../@types/board/BoardDocument.ts';
import type { BoardJobDocument }      from '../../@types/board/BoardJobDocuments.ts';
import type {
  BoardEpicDocument,
  BoardFilingDraftDocument,
  BoardTicketDocument,
  BoardTicketDocumentSummaryDocument,
  BoardTicketDocumentsSummaryDocument,
  BoardTicketDraftDocument
} from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState, BoardDocumentStanding, BoardTicketStatus } from '../../@types/board/BoardVocabulary.ts';
import {
  boardStateFixture,
  exampleAskingDecision,
  exampleTicket,
  ticketCountByStatusOf
} from './BoardStateFixture.ts';

/** A committed ticket filed on the example day; `priority` also sets the priority the forge resolves, unless `facts` is given. */
export function exampleTicketsTicket(id: string, fields: Partial<BoardTicketDocument> = {}): BoardTicketDocument {
  const base = exampleTicket({
    id,
    title:    `Example ticket ${id}`,
    updated:  '2026-10-29T09:00:00',
    filed:    '2026-10-29T09:00:00',
    bodyHtml: `<p>Body of example ticket ${id}.</p>`,
  });
  return {
    ...base,
    ...fields,
    facts: fields.facts ?? { ...base.facts, resolvedPriority: fields.priority ?? 'normal' },
  };
}

function documentSummary(standing: BoardDocumentStanding, headNumber: number | null): BoardTicketDocumentSummaryDocument {
  return { standing, headNumber, approvedNumber: standing === 'approved' ? headNumber : null };
}

/** A spec-then-plan ticket's documents: the spec at its standing and head, then the plan, unwritten unless named. */
export function exampleDocumentsSummary(
  spec: readonly [BoardDocumentStanding, number | null],
  plan: readonly [BoardDocumentStanding, number | null] = ['unwritten', null],
): BoardTicketDocumentsSummaryDocument {
  return { spec: documentSummary(...spec), plan: documentSummary(...plan), buildHeld: false };
}

/** A draft of the spec-then-plan route as the forge serves where it stands: nothing waits and no agent writes unless the fields say so. */
export function exampleDraft(fields: Partial<BoardTicketDraftDocument> & Pick<BoardTicketDraftDocument, 'stage'>): BoardTicketDraftDocument {
  return {
    waitsOnUser: null, agent: null, waitingSince: null, ...fields
  };
}

/** A spec or plan agent's question on its document, anchored nowhere in particular. */
export function exampleDocumentQuestion(id: string, ticketId: string, document: 'spec' | 'plan', openedAt: string): BoardDecisionDocument {
  return exampleAskingDecision({
    id, jobId: null, ticketIds: [ticketId], askedBy: `${document}-agent`, document, openedAt
  });
}

/** An open filing draft with no ticket yet: waiting on User with one question unless the fields say otherwise. */
export function exampleFilingDraft(id: string, fields: Partial<BoardFilingDraftDocument> = {}): BoardFilingDraftDocument {
  return {
    id,
    title:             `Example filing draft ${id}`,
    claimOwner:        null,
    openedAt:          '2026-10-29T11:00:00',
    state:             'waiting',
    openQuestionCount: 1,
    questions:         [],
    ...fields,
  };
}

/** An epic's roll-up counted from the board's tickets that name it, as the forge counts it. */
function exampleEpicRollup(key: string, title: string, slot: number, tickets: readonly BoardTicketDocument[]): BoardEpicDocument {
  const members = tickets.filter((ticket) => ticket.epics.includes(key));
  const counts: Partial<Record<BoardTicketStatus, number>> = {};
  for (const member of members) counts[member.status] = (counts[member.status] ?? 0) + 1;
  return {
    key, title, slot, ticketIds: members.map((member) => member.id), ticketCountByStatus: ticketCountByStatusOf(counts), tokens: 0, span: null
  };
}

/** An epic as `exampleTicketsBoard` names it: its key, title and colour slot. */
export interface ExampleTicketsEpic {
  readonly key:   string;
  readonly title: string;
  readonly slot:  number;
}

export const EXAMPLE_TICKETS_EPICS: readonly ExampleTicketsEpic[] = [
  { key: 'billing', title: 'Example billing', slot: 4 },
  { key: 'checkout', title: 'Example checkout', slot: 2 },
];

export interface ExampleTicketsBoardFields {
  readonly tickets:          readonly BoardTicketDocument[];
  /** The display state the forge serves, where it differs from the stored status. */
  readonly displayStates?:   Readonly<Record<string, BoardDisplayState>>;
  readonly waitingOn?:       Readonly<Record<string, readonly string[]>>;
  readonly epics?:           readonly ExampleTicketsEpic[];
  readonly jobs?:            readonly BoardJobDocument[];
  readonly decisions?:       readonly BoardDecisionDocument[];
  readonly filingDrafts?:    readonly BoardFilingDraftDocument[];
  readonly questionHistory?: BoardDocument['questionHistory'];
}

/** The fixture's board with only the given tickets, epics, jobs, decisions and filing drafts: no job or decision unless given. */
export function exampleTicketsBoard(fields: ExampleTicketsBoardFields): BoardDocument {
  const board = boardStateFixture();
  return {
    ...board,
    jobs:            fields.jobs ?? [],
    decisions:       fields.decisions ?? [],
    questionHistory: fields.questionHistory ?? [],
    page:            {
      ...board.page,
      progress: { ...board.page.progress, tasks: [], log: [] },
      facts:    {
        ...board.page.facts,
        rows:    [],
        tickets: fields.tickets.map((ticket) => ({
          ticketId:           ticket.id,
          ownRowPosition:     null,
          reviewBarPositions: [],
          displayState:       fields.displayStates?.[ticket.id] ?? ticket.status,
          waitingOnTicketIds: fields.waitingOn?.[ticket.id] ?? [],
          entity:             null,
          stage:              null,
        })),
        epics:  (fields.epics ?? EXAMPLE_TICKETS_EPICS).map((epic) => exampleEpicRollup(epic.key, epic.title, epic.slot, fields.tickets)),
        drafts: fields.filingDrafts ?? [],
      },
      tickets: fields.tickets,
    },
  };
}
