/**
 * The question panel as data: which open decision it shows, whether it shows against the decisions open when User last folded it, and the
 * shown decision with its asker, its questions and options exactly as asked with the consequences the agent noted, the answer line, the
 * queue after it, and its background: why it was asked, its first ticket with the Wanted and Brief excerpts and the Acceptance items as
 * text, the asking job's last tool calls and the earlier answers on that ticket. Stamps are sliced, never parsed; nothing reads the clock.
 */
import type { BoardQuestionHistoryEntryDocument }        from '../../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                            from '../../../../@types/board/BoardDocument.ts';
import type { BoardAcceptanceItemDocument }              from '../../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState }                        from '../../../../@types/board/BoardVocabulary.ts';
import type { BoardTranscriptEntryDocument }             from '../../../../@types/board/ConversationDocument.ts';
import type { EpicMark }                                 from '../../../chips/EpicChipUtil.ts';
import type { ChatTurn }                                 from '../../../conversation/ChatThread.tsx';
import type { ChatThreadItem }                           from '../../../conversation/ChatThreadModel.ts';
import { ChatTurnWordingUtil }                           from '../../../conversation/ChatTurnWordingUtil.ts';
import { DecisionAnswerUtil, type DecisionQuestionView } from '../../../conversation/DecisionAnswerUtil.ts';
import { DependencyGraphUtil }                           from '../../../utils/DependencyGraphUtil.ts';
import { HeldCountUtil }                                 from '../../../utils/HeldCountUtil.ts';
import { JobLiveFactsUtil }                              from '../../../utils/JobLiveFactsUtil.ts';
import { TimeUtil, type TimestampSlices }                from '../../../utils/TimeUtil.ts';
import type { OpenDecision }                             from '../QuestionsModel.ts';

/** An open decision of the question queue, in the answering order the forge serves, escalated where it says. */
export type QueuedDecision = OpenDecision;

/** How many of the asking job's last tool calls the background lists. */
export const QUESTION_PANEL_STEPS_SHOWN = 6;

/** Who asks a decision code opened, which has no job. */
const HEPHAESTUS_ASKER_TEXT = 'Hephaestus';

const WANTED_HEADING = 'Wanted';

const BRIEF_HEADING = 'Brief';

/** A line that starts its own Markdown block (a list item, a heading, a quote, a table row or a fence), never a wrapped paragraph's tail. */
const BLOCK_START_PATTERN = /^\s*(?:[-*+]\s|\d+[.)]\s|#|>|\||```|~~~)/u;

const FENCE_PATTERN = /^\s*(?:```|~~~)/u;

/** Markdown's hard break: a line ending in two spaces or a backslash keeps its line break. */
const HARD_BREAK_PATTERN = /(?: {2}|\\)$/u;

const TOOL_CALL_ROLE = 'tool-call';

const DECISION_OPENED_KIND = 'decision-opened';

const DECISION_ANSWERED_KIND = 'decision-answered';

/** The held count reads no wave, and the launch limit shapes only the waves, so any limit gives the same count. */
const HELD_COUNT_LAUNCH_LIMIT = 1;

/** An asking agent's turns read as its own: a job's palette row while it waits on an answer. */
const ASKING_TURN_STATE: BoardDisplayState = 'paused';

/** The fields of the board the panel reads: the asking job's calls, the decisions, the log, the incidents for Flint, and the page's tickets. */
export type QuestionPanelBoard = Pick<BoardDocument, 'jobs' | 'decisions' | 'questionHistory' | 'incidents' | 'page'>;

type QuestionPanelJob = QuestionPanelBoard['jobs'][number];

type QuestionPanelTicket = QuestionPanelBoard['page']['tickets'][number];

type DecisionDocument = QuestionPanelBoard['decisions'][number];

export interface QuestionPanelHead {
  /** `J4`, or `Hephaestus` for a decision code opened. */
  readonly askerText:     string;
  /** The asking agent's role, `builder`; `null` for a decision code opened. */
  readonly askerRoleText: string | null;
  readonly headerMark:    string | null;
  readonly ticketIds:     readonly string[];
  readonly openSinceText: string | null;
  readonly escalated:     boolean;
}

export interface QuestionModel extends DecisionQuestionView {
  readonly text:   string;
  readonly header: string;
}


export interface TicketBlock {
  readonly ticketId:        string;
  readonly title:           string;
  readonly epics:           readonly EpicMark[];
  readonly heldCount:       number;
  readonly heldTitle:       string;
  /** `J4, call 38 / 150`: the asking job's calls against its budget; `null` without a job or its live facts. */
  readonly callsText:       string | null;
  /** The source text of the ticket's `## Wanted` and `## Brief`; `null` when the board serves no such section. */
  readonly wantedText:      string | null;
  readonly briefText:       string | null;
  readonly acceptanceItems: readonly BoardAcceptanceItemDocument[];
  readonly bodyHtml:        string | null;
}

export interface EarlierAnswer {
  readonly decisionId:        string;
  readonly answeredClockText: string;
  readonly answeredAt:        string;
  readonly answerText:        string;
}

export interface QueueFoot {
  /** From 1. */
  readonly position:     number;
  readonly count:        number;
  /** The decisions after the shown one, wrapping round to the first. */
  readonly laterEntries: readonly { readonly idText: string; readonly askerText: string }[];
}

export type ReadingTab = 'background' | 'ticket' | 'conversation';

export interface QuestionPanelViewModel {
  readonly decisionId:      string;
  readonly head:            QuestionPanelHead;
  readonly questions:       readonly QuestionModel[];
  /** Free text answers a decision of one question only, as `decide` takes it. */
  readonly ownWordsAllowed: boolean;
  /** The command the answer posts, its verb literal so it greps. */
  readonly answerLineText:  string;
  /** Why the agent stopped; `null` when the decision carries no context. */
  readonly stoppedReason:   string | null;
  readonly ticket:          TicketBlock | null;
  /** The job whose transcript the steps and the conversation follow; `null` for a decision code opened. */
  readonly stepsJobId:      string | null;
  readonly callCount:       number | null;
  readonly earlierAnswers:  readonly EarlierAnswer[];
  readonly queueFoot:       QueueFoot;
  readonly readingTabs:     readonly ReadingTab[];
}

export interface StepLine {
  readonly key:       string;
  readonly toolName:  string;
  readonly text:      string;
  readonly isCurrent: boolean;
}

export interface QuestionPanelFormat {
  readonly todayCalendarDate: string;
  /** `null` before a board with a page arrives: no stamp is shown then. */
  readonly slices:            TimestampSlices | null;
}

function askerTextOf(decision: DecisionDocument): string {
  return decision.jobId ?? HEPHAESTUS_ASKER_TEXT;
}

/** The pointed decision while it is open, else the first one opened since User last folded the panel, else the first; `null` with none. */
function shownDecisionOf(queue: readonly QueuedDecision[], pointedDecisionId: string | null, foldedDecisionIds: readonly string[]): QueuedDecision | null {
  const folded = new Set(foldedDecisionIds);
  return queue.find(({ decision }) => decision.id === pointedDecisionId)
    ?? queue.find(({ decision }) => !folded.has(decision.id))
    ?? queue[0]
    ?? null;
}

/** The decisions the panel may show: none while the board is in setup, whose onboarding is then all the board shows; else every open one. */
function panelQueueOf(queue: readonly QueuedDecision[], boardIsInSetup: boolean): readonly QueuedDecision[] {
  return boardIsInSetup ? [] : queue;
}

/** It shows while User opened it or a decision opened that was not open when User last folded it; never with nothing open. */
function panelIsShownOf(queue: readonly QueuedDecision[], foldedDecisionIds: readonly string[], openedByUser: boolean): boolean {
  if (queue.length === 0) return false;
  const folded = new Set(foldedDecisionIds);
  return openedByUser || queue.some(({ decision }) => !folded.has(decision.id));
}

/** The decision after the shown one, wrapping round; the shown one itself in a queue of one. */
function nextDecisionIdOf(queue: readonly QueuedDecision[], shownDecisionId: string): string | null {
  const position = queue.findIndex(({ decision }) => decision.id === shownDecisionId);
  return queue[(position + 1) % queue.length]?.decision.id ?? null;
}

function stampTextOf(stamp: string, format: QuestionPanelFormat): string | null {
  return format.slices === null ? null : TimeUtil.shortStampText(stamp, format.todayCalendarDate, format.slices);
}

function questionModelOf(question: DecisionDocument['questions'][number]): QuestionModel {
  return {
    text:        question.question,
    header:      question.header,
    multiSelect: question.multiSelect,
    options:     DecisionAnswerUtil.optionViewsOf(question),
  };
}

/**
 * A section's Markdown with its soft line breaks read as Markdown reads them, as spaces: a ticket wrapped at 120 columns in its file would
 * otherwise break mid-sentence in the narrow panel. Paragraph breaks, list items, headings, hard breaks and fenced lines stay as written.
 */
function softBreaksJoinedOf(markdown: string): string {
  const lines: string[] = [];
  let insideFence = false;
  for (const line of markdown.split('\n')) {
    const isFence = FENCE_PATTERN.test(line);
    const previous = lines.at(-1);
    const continuesParagraph = !insideFence && !isFence && previous !== undefined && previous.trim() !== '' && line.trim() !== ''
      && !BLOCK_START_PATTERN.test(line) && !HARD_BREAK_PATTERN.test(previous) && !FENCE_PATTERN.test(previous);
    if (continuesParagraph) lines[lines.length - 1] = `${previous.trimEnd()} ${line.trimStart()}`;
    else lines.push(line);
    if (isFence) insideFence = !insideFence;
  }
  return lines.join('\n');
}

function sectionTextOf(ticket: QuestionPanelTicket, heading: string): string | null {
  const section = ticket.sections.find((candidate) => candidate.heading === heading);
  const text = softBreaksJoinedOf(section?.markdown ?? '').trim();
  return text === '' ? null : text;
}

function ticketBlockOf(board: QuestionPanelBoard, ticketId: string, askingJob: QuestionPanelJob | null): TicketBlock | null {
  const { page } = board;
  const ticket = page.tickets.find((candidate) => candidate.id === ticketId);
  if (ticket === undefined) return null;
  const epicByKey = new Map(page.facts.epics.map((epic): [string, EpicMark] => [epic.key, { key: epic.key, title: epic.title, slot: epic.slot }]));
  const graphTickets = page.tickets.map((candidate) => ({ ...candidate, memberOfEpics: candidate.epics.map((key) => ({ key })) }));
  const heldCount = HeldCountUtil.heldCountOf(ticket.id, DependencyGraphUtil.dependencyGraphOf(graphTickets, HELD_COUNT_LAUNCH_LIMIT));
  return {
    ticketId:        ticket.id,
    title:           ticket.title,
    epics:           ticket.epics.flatMap((key) => epicByKey.get(key) ?? []),
    heldCount,
    heldTitle:       HeldCountUtil.heldTitleOf(heldCount),
    callsText:       askingJob === null ? null : `${askingJob.id}, call ${JobLiveFactsUtil.callsAgainstBudgetOf(askingJob)}`,
    wantedText:      sectionTextOf(ticket, WANTED_HEADING),
    briefText:       sectionTextOf(ticket, BRIEF_HEADING),
    acceptanceItems: ticket.acceptanceItems,
    bodyHtml:        ticket.bodyHtml === '' ? null : ticket.bodyHtml,
  };
}

function answerTextOf(answer: unknown): string {
  if (typeof answer !== 'object' || answer === null) return '';
  return Object.values(answer).map(String).join(' · ');
}

/** Answered decisions whose opening named the ticket, newest first, the shown one left out. */
function earlierAnswersOf(history: readonly BoardQuestionHistoryEntryDocument[], ticketId: string, shownDecisionId: string, format: QuestionPanelFormat): EarlierAnswer[] {
  const decisionIdsOnTicket = new Set(history.flatMap((record) => {
    const { ticketIds } = record.fields;
    const namesTicket = Array.isArray(ticketIds) && ticketIds.includes(ticketId);
    return record.kind === DECISION_OPENED_KIND && namesTicket && record.decisionId !== null ? [record.decisionId] : [];
  }));
  return history
    .filter((record) => record.kind === DECISION_ANSWERED_KIND && record.decisionId !== null && record.decisionId !== shownDecisionId
      && decisionIdsOnTicket.has(record.decisionId))
    .map((record) => ({
      decisionId:        record.decisionId ?? '',
      answeredClockText: stampTextOf(record.at, format) ?? '',
      answeredAt:        record.at,
      answerText:        answerTextOf(record.fields['answer']),
    }))
    .reverse();
}

function queueFootOf(queue: readonly QueuedDecision[], shownDecisionId: string): QueueFoot {
  const position = Math.max(0, queue.findIndex(({ decision }) => decision.id === shownDecisionId));
  const later = [...queue.slice(position + 1), ...queue.slice(0, position)];
  return {
    position:     position + 1,
    count:        queue.length,
    laterEntries: later.map(({ decision }) => ({ idText: decision.id, askerText: askerTextOf(decision) })),
  };
}

function questionPanelModelOf(board: QuestionPanelBoard, queue: readonly QueuedDecision[], shown: QueuedDecision, format: QuestionPanelFormat): QuestionPanelViewModel {
  const { decision, escalated } = shown;
  const askerText = askerTextOf(decision);
  const askingJob = decision.jobId === null ? null : board.jobs.find((job) => job.id === decision.jobId) ?? null;
  const [firstTicketId] = decision.ticketIds;
  const ticket = firstTicketId === undefined ? null : ticketBlockOf(board, firstTicketId, askingJob);
  return {
    decisionId: decision.id,
    head:       {
      askerText,
      askerRoleText: decision.jobId === null ? null : decision.askedBy,
      headerMark:    decision.questions[0]?.header ?? null,
      ticketIds:     decision.ticketIds,
      openSinceText: stampTextOf(decision.openedAt, format),
      escalated,
    },
    questions:       decision.questions.map(questionModelOf),
    ownWordsAllowed: decision.questions.length === 1,
    answerLineText:  `decision-answer ${decision.id}`,
    stoppedReason:   decision.context.trim() === '' ? null : decision.context,
    ticket,
    stepsJobId:      decision.jobId,
    callCount:       askingJob?.live.calls ?? null,
    earlierAnswers:  firstTicketId === undefined ? [] : earlierAnswersOf(board.questionHistory, firstTicketId, decision.id, format),
    queueFoot:       queueFootOf(queue, decision.id),
    readingTabs:     [
      'background',
      ...(ticket === null || ticket.bodyHtml === null ? [] : ['ticket' as const]),
      ...(decision.jobId === null ? [] : ['conversation' as const]),
    ],
  };
}

/** The last top-level tool calls, oldest first; a subagent's calls stay out, and the call that asks User, when it is the last, is the current. */
function lastStepsOf(entries: readonly BoardTranscriptEntryDocument[], limit: number): StepLine[] {
  const calls = entries.filter((entry) => entry.role === TOOL_CALL_ROLE && entry.toolName !== null && entry.parentToolUseId === null);
  const shown = calls.slice(-limit);
  return shown.map((entry, position) => ({
    key: entry.entryKey, toolName: entry.toolName ?? '', text: entry.text, isCurrent: position === shown.length - 1 && entry.asksUser
  }));
}

/** The asking job's thread as the chat parts show it, every agent turn under its job id. */
function conversationTurnsOf(items: readonly ChatThreadItem[], jobId: string, todayCalendarDate: string): ChatTurn[] {
  const bootLineText = `Hephaestus started ${jobId}`;
  return items.map((item): ChatTurn => {
    const stamp = ChatTurnWordingUtil.stampOf(item.at, todayCalendarDate);
    switch (item.kind) {
      case 'system':
        return {
          kind: 'system', key: item.key, text: ChatTurnWordingUtil.systemLineTextOf(item.facts, bootLineText), stamp, revealText: item.revealText
        };
      case 'user-message':
        return {
          kind: 'user', key: item.key, speaker: 'User', stamp, stampSuffix: null, text: item.text, queued: null, pictures: null
        };
      case 'agent-turn':
        return {
          kind:        'agent',
          key:         item.key,
          speaker:     jobId,
          state:       ASKING_TURN_STATE,
          stamp,
          workingText: item.working ? 'working' : null,
          toolUse:     item.toolFold === null ? null : ChatTurnWordingUtil.toolUseOf(item.toolFold, item.working),
          prose:       item.prose,
        };
    }
  });
}

export const QuestionPanelModel = Object.freeze({
  shownDecisionOf, panelIsShownOf, panelQueueOf, nextDecisionIdOf, questionPanelModelOf, lastStepsOf, conversationTurnsOf
});
