/**
 * Every product-owner session: live ones from the board and ended ones read back from the log, each with its title, request, the tickets
 * it filed and its open decisions. Sessions that wait on User sort first, then the live ones and the ended ones, each newest first.
 */
import type { BoardDecisionDocument, BoardQuestionHistoryEntryDocument } from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                                            from '../../../@types/board/BoardDocument.ts';
import type { BoardJobIntakeDocument }                                   from '../../../@types/board/BoardJobDocuments.ts';
import type { BoardTicketDocument }                                      from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardJobState, BoardJobTurn }                              from '../../../@types/board/BoardVocabulary.ts';

export interface IntakeSession {
  readonly jobId:       string;
  /** The job's state while it is on the board; once the job left it, the outcome its newest `job-ended` record names. */
  readonly state:       string;
  /** The job's state while it is on the board; `null` once it left it. */
  readonly jobState:    BoardJobState | null;
  /** The job left the board, with any outcome. */
  readonly ended:       boolean;
  /** The job left the board with outcome `closed`: a message resumes it. */
  readonly closed:      boolean;
  readonly title:       string;
  readonly requestText: string | null;
  readonly drafts:      readonly BoardTicketDocument[];
  readonly questions:   readonly BoardDecisionDocument[];
  /** The newest line the session or User said; an ended session shows none. */
  readonly lastLine:    string | null;
  /** The session's API calls; `null` for an ended session. */
  readonly calls:       number | null;
  readonly turn:        BoardJobTurn | null;
}

/** What the sessions are read from: the board's jobs, open decisions, the log's session records and the tickets. */
export type IntakeBoard = Pick<BoardDocument, 'jobs' | 'decisions' | 'questionHistory'> & { readonly page: Pick<BoardDocument['page'], 'tickets'> };

const PRODUCT_OWNER_KIND = 'product-owner';
const CLOSED_OUTCOME = 'closed';
/** A `job-ended` record with no outcome text; the store always writes one. */
const UNKNOWN_OUTCOME = 'ended';

/** "Search suggestions": the product owner's title, else the request's first line, else the job id. */
function sessionTitleOf(intake: BoardJobIntakeDocument | null, jobId: string): string {
  const title = intake?.title?.trim() ?? '';
  if (title !== '') return title;
  const firstLine = intake?.text.trim().split('\n')[0]?.trim() ?? '';
  return firstLine === '' ? jobId : firstLine;
}

function textField(record: BoardQuestionHistoryEntryDocument, field: string): string | null {
  const value = record.fields[field];
  return typeof value === 'string' ? value : null;
}

/** The newest position of each job's `job-launched` record, so a later launch sorts first; the log's order, never a clock. */
function launchPositionsOf(history: readonly BoardQuestionHistoryEntryDocument[]): ReadonlyMap<string, number> {
  const positions = new Map<string, number>();
  history.forEach((record, position) => {
    if (record.kind === 'job-launched' && record.jobId !== null) positions.set(record.jobId, position);
  });
  return positions;
}

/**
 * A session's request and title: the request its launch record kept, since a reopening message replaces the job's stored text, and the
 * title the job holds or, once it left the board, the newest `intake-titled` record gave; the job's own text where no record kept one.
 */
function intakeOf(history: readonly BoardQuestionHistoryEntryDocument[], jobId: string, jobIntake: BoardJobIntakeDocument | null): BoardJobIntakeDocument | null {
  const launched = history.find((record) => record.kind === 'job-launched' && record.jobId === jobId && textField(record, 'intakeText') !== null);
  const titled = history.findLast((record) => record.kind === 'intake-titled' && record.jobId === jobId);
  const text = (launched === undefined ? null : textField(launched, 'intakeText')) ?? jobIntake?.text ?? null;
  const title = jobIntake?.title ?? (titled === undefined ? null : textField(titled, 'title'));
  if (text === null && title === null) return null;
  return { text: text ?? '', title };
}

/** The product-owner jobs that left the board, each with the outcome of its newest `job-ended` record, the newest end first. */
function endedSessionsOf(history: readonly BoardQuestionHistoryEntryDocument[], liveJobIds: ReadonlySet<string>): { jobId: string; outcome: string }[] {
  const productOwnerIds = new Set(history.flatMap((record) => (
    record.kind === 'job-launched' && record.fields['kind'] === PRODUCT_OWNER_KIND && record.jobId !== null ? [record.jobId] : []
  )));
  const endedSessions: { jobId: string; outcome: string }[] = [];
  for (const record of history.toReversed()) {
    const { jobId } = record;
    if (record.kind !== 'job-ended' || jobId === null || !productOwnerIds.has(jobId) || liveJobIds.has(jobId)) continue;
    if (endedSessions.some((ended) => ended.jobId === jobId)) continue;
    endedSessions.push({ jobId, outcome: textField(record, 'outcome') ?? UNKNOWN_OUTCOME });
  }
  return endedSessions;
}

/** Sessions that wait on User first, then the live ones newest first, then the ended ones newest first. */
function intakeSessionsOf(board: IntakeBoard): IntakeSession[] {
  const history = board.questionHistory;
  const { tickets } = board.page;
  const sessionOf = (jobId: string, state: string, ended: boolean, intake: BoardJobIntakeDocument | null): Omit<IntakeSession, 'jobState' | 'lastLine' | 'calls' | 'turn'> => ({
    jobId,
    state,
    ended,
    closed:      ended && state === CLOSED_OUTCOME,
    title:       sessionTitleOf(intake, jobId),
    requestText: intake === null ? null : intake.text,
    drafts:      tickets.filter((ticket) => ticket.filedByJob === jobId),
    questions:   board.decisions.filter((decision) => decision.jobId === jobId),
  });
  const launchPositions = launchPositionsOf(history);
  const liveJobs = board.jobs
    .filter((job) => job.kind === PRODUCT_OWNER_KIND)
    .toSorted((a, b) => (launchPositions.get(b.id) ?? -1) - (launchPositions.get(a.id) ?? -1));
  const liveSessions = liveJobs.map((job): IntakeSession => ({
    ...sessionOf(job.id, job.state, false, intakeOf(history, job.id, job.intake)),
    jobState: job.state,
    lastLine: job.live.lastLine?.text ?? null,
    calls:    job.live.calls,
    turn:     job.live.turn,
  }));
  const endedSessions = endedSessionsOf(history, new Set(liveJobs.map((job) => job.id))).map(({ jobId, outcome }): IntakeSession => ({
    ...sessionOf(jobId, outcome, true, intakeOf(history, jobId, null)), jobState: null, lastLine: null, calls: null, turn: null
  }));
  const waitsOnUser = (session: IntakeSession): boolean => session.questions.length > 0;
  return [...liveSessions.filter(waitsOnUser), ...liveSessions.filter((session) => !waitsOnUser(session)), ...endedSessions];
}

export const IntakeSessionsModel = Object.freeze({ intakeSessionsOf });
