/**
 * The ticket drafts and filing drafts as rows: the ones that wait on User, oldest wait first, each with its stage track, what waits and the
 * one action that answers it, and the ones an agent writes, each with its agent at work. Where a draft stands is the forge's (`draft` on
 * each ticket being written); this model only words it and picks the route its action opens.
 */
import type { BoardDocument }                                               from '../../../@types/board/BoardDocument.ts';
import type { BoardFilingDraftDocument, BoardTicketDocument }               from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState, BoardDraftStage, BoardTicketDocumentKind } from '../../../@types/board/BoardVocabulary.ts';
import { BoardRouter, type BoardRoute }                                     from '../../../shared/BoardRouter.ts';
import { CountTextUtil }                                                    from '../../../shared/utils/CountTextUtil.ts';
import { DraftWordsUtil }                                                   from '../../utils/DraftWordsUtil.ts';
import { DetailRoute }                                                      from '../routing/DetailRoute.ts';
import { TicketRowFactsUtil, type RowEpic, type RowMoment }                 from './TicketRowFactsUtil.ts';
import { TicketSegmentUtil }                                                from './TicketSegmentUtil.ts';

/** `done` drawn with its check, `user` in the waiting orange, `agent` while an agent writes it, `upcoming` not reached yet. */
export type DraftStepStatus = 'done' | 'user' | 'agent' | 'upcoming';

export interface DraftStep {
  readonly label:  string;
  readonly status: DraftStepStatus;
}

export interface DraftRowBase {
  readonly key:        string;
  readonly idText:     string;
  /** The ticket the row is, `null` for a filing draft; the tickets habitat finds a row by it. */
  readonly ticketId:   string | null;
  readonly title:      string;
  readonly epic:       RowEpic | null;
  /** "from `J4`", the job that filed it; `null` when no job did. */
  readonly originText: string | null;
  readonly steps:      readonly DraftStep[];
  /** Where the id opens: the document being written, else the ticket's or the draft's detail. */
  readonly openRoute:  BoardRoute;
}

export interface WaitingDraftRowModel extends DraftRowBase {
  readonly waitsText:    string;
  readonly actionLabel:  string;
  readonly actionRoute:  BoardRoute;
  readonly sinceText:    string | null;
  /** Orders the rows, oldest wait first; only ever shown otherwise. */
  readonly waitingSince: string | null;
}

export interface DraftAgentModel {
  readonly jobId:      string;
  readonly roleText:   string;
  readonly tokensText: string | null;
  /** The state its dot looks as. */
  readonly dotState:   BoardDisplayState;
}

export interface WritingDraftRowModel extends DraftRowBase {
  /** `null` while no agent writes it yet. */
  readonly agent:      DraftAgentModel | null;
  /** What stands beside the dashed dot while no agent writes it: "no agent yet", or a filing draft's "ready to resume". */
  readonly idleText:   string;
  /** The page with its agent at work; `null` with no agent to watch. */
  readonly watchRoute: BoardRoute | null;
  readonly sinceText:  string | null;
}

export interface DraftRows {
  /** Oldest wait first. */
  readonly waiting: readonly WaitingDraftRowModel[];
  readonly writing: readonly WritingDraftRowModel[];
}

const DOCUMENT_WORDS: Readonly<Record<BoardTicketDocumentKind, string>> = { spec: 'spec', plan: 'plan' };

const DOCUMENT_STEP_LABELS: Readonly<Record<BoardTicketDocumentKind, string>> = { spec: 'Spec', plan: 'Plan' };

const TICKET_REVIEW_LABEL = 'Ticket review';

const SHAPE_LABEL = 'Shape';

const FILING_LABEL = 'Filing';

const DONE_MARK = '✓ ';

const FILING_DRAFT_WAITING_STATE = 'waiting';

const NO_AGENT_YET_TEXT = 'no agent yet';

/** The document a stage writes: the plan from its stage on, the spec before it. */
function documentOfStage(stage: BoardDraftStage): BoardTicketDocumentKind {
  return stage === 'spec' || stage === 'spec-review' ? 'spec' : 'plan';
}

function stepOf(label: string, status: DraftStepStatus): DraftStep {
  return { label: status === 'done' ? `${DONE_MARK}${label}` : label, status };
}

/** The spec-then-plan route's track: Spec, Plan, and Ticket review once the ticket is in it; the stage's step waits on User or its agent. */
function specThenPlanStepsOf(stage: BoardDraftStage, currentStatus: DraftStepStatus): DraftStep[] {
  if (stage === 'ticket-review') return [stepOf('Spec', 'done'), stepOf('Plan', 'done'), stepOf(TICKET_REVIEW_LABEL, currentStatus)];
  const document = documentOfStage(stage);
  return [
    stepOf(DOCUMENT_STEP_LABELS.spec, document === 'spec' ? currentStatus : 'done'),
    stepOf(DOCUMENT_STEP_LABELS.plan, document === 'plan' ? currentStatus : 'upcoming'),
  ];
}

/** The one-ticket route's track: the intake shapes the ticket, then User reviews it. */
function oneTicketStepsOf(inReview: boolean): DraftStep[] {
  return inReview ? [stepOf(SHAPE_LABEL, 'done'), stepOf(TICKET_REVIEW_LABEL, 'user')] : [stepOf(SHAPE_LABEL, 'user'), stepOf(TICKET_REVIEW_LABEL, 'upcoming')];
}

function openQuestionCountOf(board: Pick<BoardDocument, 'decisions'>, ticketId: string, document: BoardTicketDocumentKind): number {
  return board.decisions.filter((decision) => decision.document === document && decision.ticketIds.includes(ticketId)).length;
}

function ticketDetailRouteOf(ticketId: string): BoardRoute {
  return { tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket', ticketId }) };
}

function rowBaseOf(ticket: BoardTicketDocument, board: BoardDocument, steps: readonly DraftStep[], openRoute: BoardRoute): DraftRowBase {
  return {
    key:        `ticket:${ticket.id}`,
    idText:     `#${ticket.id}`,
    ticketId:   ticket.id,
    title:      ticket.title,
    epic:       TicketRowFactsUtil.primaryEpicOf(ticket, board.page.facts.epics),
    originText: ticket.filedByJob === null ? null : `from ${ticket.filedByJob}`,
    steps,
    openRoute,
  };
}

/** What of a written document waits on User, and the action that answers it, both opening the document. */
function documentWaitOf(ticket: BoardTicketDocument, board: BoardDocument, document: BoardTicketDocumentKind, waitsOnUser: 'answer' | 'proposal' | 'approval'): {
  readonly waitsText:   string;
  readonly actionLabel: string;
} {
  const documentWord = DOCUMENT_WORDS[document];
  if (waitsOnUser === 'answer') {
    const questionCount = Math.max(1, openQuestionCountOf(board, ticket.id, document));
    return { waitsText: `${CountTextUtil.countedPhrase(questionCount, 'question', 'questions')} from the ${documentWord} agent`, actionLabel: 'Answer' };
  }
  const openLabel = `Open ${documentWord}`;
  if (waitsOnUser === 'proposal') return { waitsText: `The ${documentWord} agent's edit to review`, actionLabel: openLabel };
  const headNumber = ticket.documents?.[document].headNumber ?? null;
  return { waitsText: headNumber === null ? `Approve ${documentWord}` : `Approve ${documentWord} v${headNumber}`, actionLabel: openLabel };
}

type DraftRow = { readonly form: 'waiting'; readonly row: WaitingDraftRowModel } | { readonly form: 'writing'; readonly row: WritingDraftRowModel };

/** A ticket in review on either route; a spec-then-plan draft by where the forge says it stands; any other draft waits to be readied. */
function ticketRowOf(ticket: BoardTicketDocument, board: BoardDocument, moment: RowMoment): DraftRow {
  const { draft } = ticket;
  const isSpecThenPlan = ticket.documents !== undefined;
  if (ticket.status === 'ready-for-review' || draft?.stage === 'ticket-review') {
    const steps = isSpecThenPlan ? specThenPlanStepsOf('ticket-review', 'user') : oneTicketStepsOf(true);
    const waitingSince = draft?.waitingSince ?? ticket.updated;
    return {
      form: 'waiting',
      row:  {
        ...rowBaseOf(ticket, board, steps, ticketDetailRouteOf(ticket.id)),
        waitsText:   'Ticket to review',
        actionLabel: 'Review ticket',
        actionRoute: ticketDetailRouteOf(ticket.id),
        sinceText:   TicketRowFactsUtil.waitedTextOf(waitingSince, moment),
        waitingSince,
      },
    };
  }
  if (draft === undefined) {
    return {
      form: 'waiting',
      row:  {
        ...rowBaseOf(ticket, board, oneTicketStepsOf(false), ticketDetailRouteOf(ticket.id)),
        waitsText:    'Draft to make ready',
        actionLabel:  'Open ticket',
        actionRoute:  ticketDetailRouteOf(ticket.id),
        sinceText:    TicketRowFactsUtil.waitedTextOf(ticket.filed, moment),
        waitingSince: ticket.filed,
      },
    };
  }
  const document = documentOfStage(draft.stage);
  const documentRoute = BoardRouter.documentsRouteOf(ticket.id, document);
  if (draft.waitsOnUser !== null) {
    return {
      form: 'waiting',
      row:  {
        ...rowBaseOf(ticket, board, specThenPlanStepsOf(draft.stage, 'user'), documentRoute),
        ...documentWaitOf(ticket, board, document, draft.waitsOnUser),
        actionRoute:  documentRoute,
        sinceText:    TicketRowFactsUtil.waitedTextOf(draft.waitingSince, moment),
        waitingSince: draft.waitingSince,
      },
    };
  }
  const { agent } = draft;
  return {
    form: 'writing',
    row:  {
      ...rowBaseOf(ticket, board, specThenPlanStepsOf(draft.stage, 'agent'), documentRoute),
      agent: agent === null
        ? null
        : {
          jobId:      agent.jobId,
          roleText:   TicketRowFactsUtil.roleWordOf(agent.role, agent.role),
          tokensText: TicketRowFactsUtil.tokensTextOf(agent.tokens),
          dotState:   TicketRowFactsUtil.workingDotStateOf(agent.role),
        },
      idleText:   NO_AGENT_YET_TEXT,
      watchRoute: agent === null ? null : documentRoute,
      sinceText:  agent === null ? null : TicketRowFactsUtil.runningTextOf(agent.since, moment),
    },
  };
}

/**
 * A filing draft waits on User while it holds open questions for User; otherwise its claim owner, if any, works on it, and one whose
 * session ended stands ready to resume.
 */
function filingDraftRowOf(draft: BoardFilingDraftDocument, moment: RowMoment): DraftRow {
  const draftRoute: BoardRoute = { tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'draft', draftId: draft.id }) };
  const waits = draft.state === FILING_DRAFT_WAITING_STATE;
  const base: DraftRowBase = {
    key:        `draft:${draft.id}`,
    idText:     draft.id,
    ticketId:   null,
    title:      draft.title,
    epic:       null,
    originText: null,
    steps:      [stepOf(FILING_LABEL, waits ? 'user' : 'agent')],
    openRoute:  draftRoute,
  };
  if (waits) {
    const questionCount = Math.max(1, draft.openQuestionCount);
    return {
      form: 'waiting',
      row:  {
        ...base,
        waitsText:    `${CountTextUtil.countedPhrase(questionCount, 'question', 'questions')} to answer`,
        actionLabel:  'Answer',
        actionRoute:  draftRoute,
        sinceText:    TicketRowFactsUtil.waitedTextOf(draft.openedAt, moment),
        waitingSince: draft.openedAt,
      },
    };
  }
  return {
    form: 'writing',
    row:  {
      ...base,
      agent: draft.claimOwner === null
        ? null
        : {
          jobId: draft.claimOwner, roleText: 'product owner', tokensText: null, dotState: 'in-progress'
        },
      idleText:   draft.state === 'resumable' ? DraftWordsUtil.stateWordOf(draft.state).toLowerCase() : NO_AGENT_YET_TEXT,
      watchRoute: null,
      sinceText:  null,
    },
  };
}

/** A wait with no readable stamp sorts last; a tie keeps the board's order. */
function oldestWaitFirst(a: WaitingDraftRowModel, b: WaitingDraftRowModel): number {
  const first = a.waitingSince === null ? Number.POSITIVE_INFINITY : Date.parse(a.waitingSince);
  const second = b.waitingSince === null ? Number.POSITIVE_INFINITY : Date.parse(b.waitingSince);
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

/** The in-draft tickets, newest first, then the filing drafts, split into those that wait on User and those an agent writes. */
function draftRowsOf(board: BoardDocument, moment: RowMoment): DraftRows {
  const draftRows = [
    ...TicketSegmentUtil.ticketsInSegment(board, 'in-draft').toSorted((a, b) => Number(b.id) - Number(a.id)).map((ticket) => ticketRowOf(ticket, board, moment)),
    ...board.page.facts.drafts.map((draft) => filingDraftRowOf(draft, moment)),
  ];
  return {
    waiting: draftRows.flatMap((draftRow) => (draftRow.form === 'waiting' ? [draftRow.row] : [])).toSorted(oldestWaitFirst),
    writing: draftRows.flatMap((draftRow) => (draftRow.form === 'writing' ? [draftRow.row] : [])),
  };
}

/** The drafts that wait on User, oldest wait first, as the documents page's "Next waiting on you" walks them; the texts it never shows. */
function waitingRowsOf(board: BoardDocument): readonly WaitingDraftRowModel[] {
  return draftRowsOf(board, { nowEpochMilliseconds: 0, slices: board.limits }).waiting;
}

export const DraftRowsModel = Object.freeze({ draftRowsOf, waitingRowsOf });
