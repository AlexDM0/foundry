/**
 * The Intake view as data: every product-owner session, live ones from the board and closed ones read back from the log, each with its
 * title, the tickets it filed, its open decisions and its last line; which one the route selects, or the new chat; and the selected one's
 * chat worded as turns, User's request after the line that started it and each open decision placed where it was asked. A closed session
 * keeps its transcript and chat: a message resumes it by id.
 */
import type { TagProps } from 'design-system/Tag';

import type { DisplayState } from '../../../src/lib/tracker-model/@types/Task.ts';
import type {
  ConversationBoardDocument,
  DecisionDocument,
  HistoryRecordDocument,
  SessionIntakeDocument,
  SessionTurnDocument,
  TicketDocument
} from '../../@types/ConversationDocuments.ts';
import type { TranscriptEntryDocument, TranscriptPictureDocument } from '../../api/TranscriptStreamClient.ts';
import type { ChatTurn, UserChatTurn }                             from '../../conversation/ChatThread.tsx';
import { ChatThreadModelUtil, type ChatThreadItem }                from '../../conversation/ChatThreadModel.ts';
import { ChatTurnWordingUtil }                                     from '../../conversation/ChatTurnWordingUtil.ts';
import { DisplayStateWordingUtil }                                 from '../../utils/DisplayStateWordingUtil.ts';
import { JobStateUtil }                                            from '../../utils/JobStateUtil.ts';
import { StateToneUtil }                                           from '../../utils/StateToneUtil.ts';
import { TimeUtil }                                                from '../../utils/TimeUtil.ts';

export interface IntakeSession {
  readonly jobId:       string;
  /** The job's state while it is on the board; `closed` once intake closed and the job left it. */
  readonly state:       string;
  readonly closed:      boolean;
  readonly title:       string;
  readonly requestText: string | null;
  readonly drafts:      readonly TicketDocument[];
  readonly questions:   readonly DecisionDocument[];
  /** The newest line the session or User said; a closed session shows none. */
  readonly lastLine:    string | null;
  /** The session's API calls; `null` for a closed session and while the board sends no live facts. */
  readonly calls:       number | null;
  readonly turn:        SessionTurnDocument | null;
}

/** A pill: the word it shows and the [data-state] palette row it takes. */
export interface IntakePill {
  readonly state: DisplayState;
  readonly label: string;
}

/** What a session's row says under its title. */
export interface IntakeSessionFacts {
  readonly pill:        IntakePill;
  /** "E5 waits on User", one per open decision of the job. */
  readonly askTexts:    readonly string[];
  /** "2 drafts" on a live session, "2 tickets filed" on a closed one; `null` with none. */
  readonly ticketsText: string | null;
  readonly resumeText:  string | null;
}

/** The product owner's live turn at the chat's end, where Flint works: the session's pill and its calls so far. */
export interface ProductOwnerAtWorkFacts {
  readonly pill:      IntakePill;
  /** `null` while the board sends no live facts. */
  readonly callsText: string | null;
}

export type IntakeSelection =
  | { readonly form: 'new-chat' }
  | { readonly form: 'starting'; readonly jobId: string }
  | { readonly form: 'session'; readonly session: IntakeSession };

/** User's turn as the Intake chat words it: the pictures it carried, which the view shows as links to their served route. */
export type IntakeUserTurn = Omit<UserChatTurn, 'pictures'> & { readonly sentPictures: readonly TranscriptPictureDocument[] };

export type IntakeChatTurn = Exclude<ChatTurn, UserChatTurn> | IntakeUserTurn;

/** What a session's chat is worded against: its job and request, and the viewer's day, which its stamps are shown against. */
export interface IntakeChatFacts {
  readonly jobId:             string;
  readonly requestText:       string | null;
  readonly todayCalendarDate: string;
}

/** The route item that opens the new chat. */
export const INTAKE_NEW_CHAT_ITEM = 'new';

const PRODUCT_OWNER_KIND = 'product-owner';
const CLOSED_OUTCOME = 'closed';
const DRAFT_STATUS = 'draft';

const PRODUCT_OWNER_SPEAKER = 'Product owner';
const USER_SPEAKER = 'User';

/** The palette row a product-owner turn's dot takes. */
const PRODUCT_OWNER_TURN_STATE: DisplayState = 'reviewed';

const NEW_CHAT_TAG: TagProps = { text: 'No message yet: sending starts the session', ...StateToneUtil.tagLookOf('pending'), dot: true };

const CLOSED_TAG: TagProps = { text: 'Closed: a message resumes it', ...StateToneUtil.tagLookOf('abandoned'), dot: true };

const TAG_OF_TURN: Readonly<Record<SessionTurnDocument, TagProps>> = {
  'mid-turn':      { text: 'Busy: the next message queues', ...StateToneUtil.tagLookOf('in-progress'), dot: true },
  'between-turns': { text: 'Idle: a message sends now', ...StateToneUtil.tagLookOf('reviewed'), dot: true },
};

/** While the session waits on User's answer; its turn says whether a message sends now or waits for the answer. */
const WAITING_TAG_OF_TURN: Readonly<Record<SessionTurnDocument, TagProps>> = {
  'mid-turn':      { text: 'Waiting on User: the next message queues', ...StateToneUtil.tagLookOf('paused'), dot: true },
  'between-turns': { text: 'Waiting on User: a message sends now', ...StateToneUtil.tagLookOf('paused'), dot: true },
};

const WAITING_FOR_ANSWER_STATE = 'waiting-for-answer';

/** "Search suggestions": the product owner's title, else the request's first line, else the job id. */
function sessionTitleOf(intake: SessionIntakeDocument | null, jobId: string): string {
  if (intake?.title !== undefined && intake.title.trim() !== '') return intake.title.trim();
  const firstLine = intake?.text.trim().split('\n')[0]?.trim() ?? '';
  return firstLine === '' ? jobId : firstLine;
}

function textField(record: HistoryRecordDocument, field: string): string | null {
  const value = record.fields[field];
  return typeof value === 'string' ? value : null;
}

/** The newest position of each job's `job-launched` record, so a later launch sorts first; the log's order, never a clock. */
function launchPositionsOf(history: readonly HistoryRecordDocument[]): ReadonlyMap<string, number> {
  const positions = new Map<string, number>();
  history.forEach((record, position) => {
    if (record.kind === 'job-launched' && record.jobId !== undefined) positions.set(record.jobId, position);
  });
  return positions;
}

/**
 * A session's request and title: the request its launch record kept, since a reopening message replaces the job's stored text, and the
 * title the job holds or, once it left the board, the newest `intake-titled` record gave; the job's own text where no record kept one.
 */
function intakeOf(history: readonly HistoryRecordDocument[], jobId: string, jobIntake: SessionIntakeDocument | null): SessionIntakeDocument | null {
  const launched = history.find((record) => record.kind === 'job-launched' && record.jobId === jobId && textField(record, 'intakeText') !== null);
  const titled = history.findLast((record) => record.kind === 'intake-titled' && record.jobId === jobId);
  const text = (launched === undefined ? null : textField(launched, 'intakeText')) ?? jobIntake?.text ?? null;
  const title = jobIntake?.title ?? (titled === undefined ? null : textField(titled, 'title'));
  if (text === null && title === null) return null;
  return { text: text ?? '', ...(title === null ? {} : { title }) };
}

/** The product-owner jobs whose intake closed and that left the board, the newest close first. */
function closedSessionIdsOf(history: readonly HistoryRecordDocument[], liveJobIds: ReadonlySet<string>): string[] {
  const productOwnerIds = new Set(history.flatMap((record) => (
    record.kind === 'job-launched' && record.fields['kind'] === PRODUCT_OWNER_KIND && record.jobId !== undefined ? [record.jobId] : []
  )));
  const closedIds: string[] = [];
  for (const record of history.toReversed()) {
    if (record.kind !== 'job-ended' || record.jobId === undefined || !productOwnerIds.has(record.jobId) || closedIds.includes(record.jobId)) continue;
    if (liveJobIds.has(record.jobId)) continue;
    const newestEnd = history.findLast((candidate) => candidate.kind === 'job-ended' && candidate.jobId === record.jobId);
    if (newestEnd?.fields['outcome'] === CLOSED_OUTCOME) closedIds.push(record.jobId);
  }
  return closedIds;
}

/** Sessions that wait on User first, then the live ones newest first, then the closed ones newest first. */
function intakeSessionsOf(board: ConversationBoardDocument): IntakeSession[] {
  const history = board.questionHistory ?? [];
  const tickets = board.page?.tickets ?? [];
  const sessionOf = (jobId: string, state: string, intake: SessionIntakeDocument | null): Omit<IntakeSession, 'lastLine' | 'calls' | 'turn'> => ({
    jobId,
    state,
    closed:      state === CLOSED_OUTCOME,
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
    ...sessionOf(job.id, job.state, intakeOf(history, job.id, job.intake ?? null)),
    lastLine: job.live?.lastLine?.text ?? null,
    calls:    job.live?.calls ?? null,
    turn:     job.live?.turn ?? null,
  }));
  const closedSessions = closedSessionIdsOf(history, new Set(liveJobs.map((job) => job.id))).map((jobId): IntakeSession => ({
    ...sessionOf(jobId, CLOSED_OUTCOME, intakeOf(history, jobId, null)), lastLine: null, calls: null, turn: null
  }));
  const waitsOnUser = (session: IntakeSession): boolean => session.questions.length > 0;
  return [...liveSessions.filter(waitsOnUser), ...liveSessions.filter((session) => !waitsOnUser(session)), ...closedSessions];
}

/** A closed session reads as ended; a live one by its job's state. */
function sessionPillOf(session: Pick<IntakeSession, 'state' | 'closed'>): IntakePill {
  return session.closed ? { state: 'abandoned', label: CLOSED_OUTCOME } : { state: JobStateUtil.displayStateOf(session.state), label: session.state };
}

/** A filed ticket's badge by its status; a status that is no display state shows as its word on the waiting row. */
function draftPillOf(ticket: Pick<TicketDocument, 'status'>): IntakePill {
  return DisplayStateWordingUtil.isDisplayState(ticket.status)
    ? { state: ticket.status, label: DisplayStateWordingUtil.labelOf(ticket.status) }
    : { state: 'pending', label: ticket.status };
}

function draftsOf(tickets: readonly TicketDocument[]): TicketDocument[] {
  return tickets.filter((ticket) => ticket.status === DRAFT_STATUS);
}

function sessionFactsOf(session: IntakeSession): IntakeSessionFacts {
  const { countTextOf } = ChatTurnWordingUtil;
  const draftCount = draftsOf(session.drafts).length;
  const filedText = session.drafts.length === 0 ? null : countTextOf(session.drafts.length, 'ticket filed', 'tickets filed');
  return {
    pill:        sessionPillOf(session),
    askTexts:    session.questions.map((decision) => `${decision.id} waits on User`),
    ticketsText: session.closed ? filedText : (draftCount === 0 ? null : countTextOf(draftCount, 'draft', 'drafts')),
    resumeText:  session.closed ? 'a message resumes it' : null,
  };
}

/**
 * `new` opens the new chat, a known job selects its session, the job a Start session just started is starting until a board names it, and
 * any other item the first session; with no session the new chat opens.
 */
function selectedOf(sessions: readonly IntakeSession[], routeItem: string | null, startedJobId: string | null = null): IntakeSelection {
  if (routeItem === INTAKE_NEW_CHAT_ITEM) return { form: 'new-chat' };
  const named = sessions.find((candidate) => candidate.jobId === routeItem);
  if (named === undefined && routeItem !== null && routeItem === startedJobId) return { form: 'starting', jobId: routeItem };
  const session = named ?? sessions[0];
  return session === undefined ? { form: 'new-chat' } : { form: 'session', session };
}

/** Whether a message sends now or queues, while the session waits on User too; a closed session resumes; nothing before a reading. */
function composerTagOf(session: Pick<IntakeSession, 'state' | 'closed' | 'turn'> | null): TagProps | null {
  if (session === null) return NEW_CHAT_TAG;
  if (session.closed) return CLOSED_TAG;
  if (session.turn === null) return null;
  return session.state === WAITING_FOR_ANSWER_STATE ? WAITING_TAG_OF_TURN[session.turn] : TAG_OF_TURN[session.turn];
}

/** "Close intake offers #015 and #017 to ready."; `null` while the session filed no draft. */
function closeIntakeCaptionOf(tickets: readonly TicketDocument[]): string | null {
  const ids = draftsOf(tickets).map((ticket) => `#${ticket.id}`);
  const last = ids.at(-1);
  if (last === undefined) return null;
  const named = ids.length === 1 ? last : `${ids.slice(0, -1).join(', ')} and ${last}`;
  return `Close intake offers ${named} to ready.`;
}

/** "2 turns · 7 calls" after the job's link; a closed session has no calls to show. */
function paneMetaOf(turnCount: number, calls: number | null): string {
  const { countTextOf } = ChatTurnWordingUtil;
  return [countTextOf(turnCount, 'turn', 'turns'), ...calls === null ? [] : [countTextOf(calls, 'call', 'calls')]].join(' · ');
}

/** The product owner at work while the session is open; a closed session has no live turn. */
function productOwnerAtWorkOf(session: Pick<IntakeSession, 'state' | 'closed' | 'calls'>): ProductOwnerAtWorkFacts | null {
  if (session.closed) return null;
  return {
    pill:      sessionPillOf(session),
    callsText: session.calls === null ? null : `${ChatTurnWordingUtil.countTextOf(session.calls, 'call', 'calls')} so far`,
  };
}

/** The job id of an applied `intake-start`, read from its result; `null` from any other shape. */
function newJobIdOf(result: unknown): string | null {
  if (typeof result !== 'object' || result === null || !('job' in result)) return null;
  const { job } = result as { job: unknown };
  if (typeof job !== 'object' || job === null || !('id' in job)) return null;
  const { id } = job as { id: unknown };
  return typeof id === 'string' ? id : null;
}

/**
 * Where an open decision goes among the thread's items: after the last item stamped at or before it was asked, and after every unstamped
 * item before the first one stamped later; at the end while no item has a stamp.
 */
function decisionPositionOf(items: readonly ChatThreadItem[], openedAt: string): number {
  const openedEpochMilliseconds = TimeUtil.epochMillisecondsOf(openedAt) ?? Number.POSITIVE_INFINITY;
  const stamps = items.map((item) => TimeUtil.epochMillisecondsOf(item.at));
  if (stamps.every((stamp) => stamp === null)) return items.length;
  let position = 0;
  for (const [index, stamp] of stamps.entries()) {
    if (stamp !== null && stamp > openedEpochMilliseconds) break;
    position = index + 1;
  }
  return position;
}

function picturesSuffixOf(pictures: readonly TranscriptPictureDocument[]): string | null {
  return pictures.length === 0 ? null : ChatTurnWordingUtil.countTextOf(pictures.length, 'picture', 'pictures');
}

function userTurnOf(key: string, at: string | null, text: string, pictures: readonly TranscriptPictureDocument[], todayCalendarDate: string): IntakeUserTurn {
  return {
    kind:         'user',
    key,
    speaker:      USER_SPEAKER,
    stamp:        ChatTurnWordingUtil.stampOf(at, todayCalendarDate),
    stampSuffix:  picturesSuffixOf(pictures),
    text,
    queued:       null,
    sentPictures: pictures,
  };
}

type ThreadPlace = { readonly kind: 'item'; readonly item: ChatThreadItem } | { readonly kind: 'decision'; readonly decisionId: string };

/**
 * The session's chat: the transcript's items worded for a product owner, User's request as a bubble after the Overseer's line that started
 * the session (or first, before that line came), with the pictures that line carried, and each open decision as a turn of its own.
 */
function chatTurnsOf(entries: readonly TranscriptEntryDocument[], decisions: readonly DecisionDocument[], facts: IntakeChatFacts): IntakeChatTurn[] {
  const items = ChatThreadModelUtil.threadItemsOf(entries, []);
  const picturesByEntryKey = new Map(entries.map((entry) => [entry.entryKey, entry.pictures ?? []]));
  const places: ThreadPlace[] = items.map((item) => ({ kind: 'item', item }));
  const positions = decisions.map((decision) => ({ decisionId: decision.id, position: decisionPositionOf(items, decision.openedAt) }));
  // From the last, so each insert leaves the earlier positions where they were; equal positions keep the decisions' order.
  for (const { decisionId, position } of positions.toReversed()) places.splice(position, 0, { kind: 'decision', decisionId });

  const { todayCalendarDate } = facts;
  const bootLineText = `Overseer started ${facts.jobId} from User's first message · ${PRODUCT_OWNER_KIND}`;
  const requestTurnOf = (key: string, at: string | null, pictures: readonly TranscriptPictureDocument[]): IntakeUserTurn[] => (
    facts.requestText === null && pictures.length === 0 ? [] : [userTurnOf(key, at, facts.requestText ?? '', pictures, todayCalendarDate)]
  );
  const hasBootLine = items.some((item) => item.kind === 'system' && item.facts.form === 'boot');

  const turns = places.flatMap((place): IntakeChatTurn[] => {
    if (place.kind === 'decision') return [{ kind: 'decision', key: `decision.${place.decisionId}`, decisionId: place.decisionId }];
    const { item } = place;
    const stamp = ChatTurnWordingUtil.stampOf(item.at, todayCalendarDate);
    switch (item.kind) {
      case 'system': {
        const line: IntakeChatTurn = {
          kind: 'system', key: item.key, text: ChatTurnWordingUtil.systemLineTextOf(item.facts, bootLineText), stamp, revealText: item.revealText
        };
        return item.facts.form === 'boot' ? [line, ...requestTurnOf(`${item.key}.request`, item.at, picturesByEntryKey.get(item.key) ?? [])] : [line];
      }
      case 'user-message':
        return [userTurnOf(item.key, item.at, item.text, picturesByEntryKey.get(item.key) ?? [], todayCalendarDate)];
      case 'agent-turn':
        return [{
          kind:        'agent',
          key:         item.key,
          speaker:     PRODUCT_OWNER_SPEAKER,
          state:       PRODUCT_OWNER_TURN_STATE,
          stamp,
          workingText: item.working ? 'working' : null,
          toolUse:     item.toolFold === null ? null : ChatTurnWordingUtil.toolUseOf(item.toolFold, item.working),
          prose:       item.prose,
        }];
    }
  });
  return hasBootLine ? turns : [...requestTurnOf('request', null, []), ...turns];
}

/** Every picture the chat carried, each once, in the order it was first sent. */
function picturesInChatOf(entries: readonly TranscriptEntryDocument[]): TranscriptPictureDocument[] {
  const seen = new Set<string>();
  return entries.flatMap((entry) => (entry.parentToolUseId === undefined ? entry.pictures ?? [] : [])).filter((picture) => {
    if (seen.has(picture.pictureId)) return false;
    seen.add(picture.pictureId);
    return true;
  });
}

export const IntakeModelUtil = Object.freeze({
  intakeSessionsOf,
  sessionTitleOf,
  sessionPillOf,
  draftPillOf,
  sessionFactsOf,
  selectedOf,
  composerTagOf,
  closeIntakeCaptionOf,
  paneMetaOf,
  productOwnerAtWorkOf,
  newJobIdOf,
  chatTurnsOf,
  picturesInChatOf,
});
