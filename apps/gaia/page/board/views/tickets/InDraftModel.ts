/**
 * The In draft segment as data: the running intakes first, then the drafts that wait on User, oldest wait first, then the drafts an agent
 * writes. The draft rows are `DraftRowsModel`'s; this model adds the intakes and the segment's search.
 */
import type { BoardDocument } from '../../../@types/board/BoardDocument.ts';
import type { BoardRoute }    from '../../../shared/BoardRouter.ts';
import { CountTextUtil }      from '../../../shared/utils/CountTextUtil.ts';
import {
  DraftRowsModel,
  type DraftRowBase,
  type WaitingDraftRowModel,
  type WritingDraftRowModel
} from '../../shared/tickets/DraftRowsModel.ts';
import { IntakeSessionsModel }                from '../../shared/tickets/IntakeSessionsModel.ts';
import { TicketRowFactsUtil, type RowMoment } from '../../shared/tickets/TicketRowFactsUtil.ts';
import { TicketsModel }                       from './TicketsModel.ts';

/** A running intake: its session's title, the drafts it filed so far, its open questions, and the link to its session. */
export interface IntakeRowModel {
  readonly jobId:         string;
  readonly title:         string;
  readonly draftsText:    string;
  readonly runningText:   string | null;
  readonly questionCount: number;
  /** "Waiting on you · 2 questions", `null` while none is open. */
  readonly waitsText:     string | null;
  readonly route:         BoardRoute;
}

export interface InDraftModel {
  readonly intakes:     readonly IntakeRowModel[];
  readonly waiting:     readonly WaitingDraftRowModel[];
  readonly writing:     readonly WritingDraftRowModel[];
  /** The drafts and filing drafts, the intakes aside: the segment's count. */
  readonly draftCount:  number;
  /** A draft, a filing draft or an intake's question waits on User. */
  readonly waitsOnUser: boolean;
}

function intakeRowsOf(board: BoardDocument, moment: RowMoment): IntakeRowModel[] {
  return IntakeSessionsModel.intakeSessionsOf(board).filter((session) => !session.ended).map((session) => {
    const draftCount = session.drafts.filter((ticket) => ticket.status === 'draft').length;
    const questionCount = session.questions.length;
    const launchedAt = board.jobs.find((job) => job.id === session.jobId)?.launchedAt ?? null;
    const runningFor = TicketRowFactsUtil.ageTextOf(launchedAt, moment);
    return {
      jobId:       session.jobId,
      title:       session.title,
      draftsText:  draftCount === 0 ? 'no drafts yet' : CountTextUtil.countedPhrase(draftCount, 'draft', 'drafts'),
      runningText: runningFor === null ? null : `running for ${runningFor}`,
      questionCount,
      waitsText:   questionCount === 0 ? null : `Waiting on you · ${CountTextUtil.countedPhrase(questionCount, 'question', 'questions')}`,
      route:       { tab: 'intake', item: session.jobId },
    };
  });
}

/** The search narrows the draft rows; the intakes always show, as what is under way. */
function inDraftModelOf(board: BoardDocument, moment: RowMoment, searchText: string): InDraftModel {
  const { waiting, writing } = DraftRowsModel.draftRowsOf(board, moment);
  const intakes = intakeRowsOf(board, moment);
  const matches = (row: DraftRowBase): boolean => TicketsModel.rowMatches({ idText: row.idText, words: [row.title, row.epic?.title ?? ''] }, searchText);
  return {
    intakes,
    waiting:     waiting.filter(matches),
    writing:     writing.filter(matches),
    draftCount:  waiting.length + writing.length,
    waitsOnUser: waiting.length > 0 || intakes.some((intake) => intake.questionCount > 0),
  };
}

export const InDraftModelUtil = Object.freeze({ inDraftModelOf });
