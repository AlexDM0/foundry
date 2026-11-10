/**
 * The Assistant view as data: the live Assistant session, or none while a fresh one boots; its chat thread worded as turns, with the
 * messages it has not taken yet as queued bubbles; the composer's status; its open incidents; and the handled ones read back from the log
 * through `IncidentTrailUtil`, each with the moves, notes and escalations made under it.
 */
import type { DisplayState } from '../../../src/lib/tracker-model/@types/Task.ts';
import type {
  ConversationBoardDocument,
  HistoryRecordDocument,
  SessionJobDocument,
  SessionTurnDocument
} from '../../@types/ConversationDocuments.ts';
import type { ChatTurn } from '../../conversation/ChatThread.tsx';
import type {
  ChatThreadItem,
  QueuedMessage,
  SystemLineFacts,
  ToolCall,
  ToolFold
} from '../../conversation/ChatThreadModel.ts';
import type { ToolCallLine, ToolUse }            from '../../conversation/ToolUseFold.tsx';
import type { StampProps }                       from '../../design-system/Stamp.tsx';
import type { TagProps }                         from '../../design-system/Tag.tsx';
import { IncidentTrailUtil, type IncidentEntry } from '../../utils/IncidentTrailUtil.ts';
import { JobStateUtil }                          from '../../utils/JobStateUtil.ts';
import { TimeUtil }                              from '../../utils/TimeUtil.ts';

/** The live Assistant job: its state, its API turns so far, its turn, and how many of User's messages it has not taken yet. */
export interface AssistantJob {
  readonly id:              string;
  readonly state:           string;
  /** `null` while the board sends no live facts for it. */
  readonly calls:           number | null;
  readonly turn:            SessionTurnDocument | null;
  readonly messagesWaiting: number;
}

export interface AssistantModel {
  /** `null` while no Assistant session is up: a fresh one is booting. */
  readonly assistantJob:     AssistantJob | null;
  readonly openIncidents:    readonly IncidentEntry[];
  readonly settledIncidents: readonly IncidentEntry[];
}

/** What a thread is worded against: the session's job, which a boot line names, and the viewer's day, which its stamps are shown against. */
export interface ChatWordingFacts {
  readonly jobId:             string;
  readonly todayCalendarDate: string;
}

/** The Assistant's job kind as the board stores it. */
const ASSISTANT_JOB_KIND = 'assistant';

const ASSISTANT_SPEAKER = 'Assistant';

const USER_SPEAKER = 'User';

/** The palette row an Assistant turn's dot takes. */
const ASSISTANT_TURN_STATE: DisplayState = 'reviewed';

const QUEUED_TAG: TagProps = {
  text: 'Queued until the Assistant is idle', tone: 'state', state: 'pending', dot: true
};

const BOOTING_TAG: TagProps = {
  text: 'No session: a fresh one is booting', tone: 'state', state: 'pending', dot: true
};

const TAG_OF_TURN: Readonly<Record<SessionTurnDocument, TagProps>> = {
  'mid-turn': {
    text: 'Busy: the next message queues', tone: 'state', state: 'in-progress', dot: true
  },
  'between-turns': {
    text: 'Idle: a message sends now', tone: 'state', state: 'reviewed', dot: true
  },
};

const CLIENT_ACT_TEXT: Readonly<Record<Extract<SystemLineFacts, { form: 'client-act' }>['act'], string>> = {
  'answer':      'answered a question',
  'interrupt':   'interrupted the turn',
  'close-input': 'closed the session\'s input',
  'stop':        'stopped the session',
};

const CALL_RESULT_TEXT: Readonly<Record<Exclude<ToolCall['state'], 'running'>, string>> = {
  ok:         'ok',
  error:      'error',
  unanswered: 'no result',
};

function assistantJobOf(job: SessionJobDocument): AssistantJob {
  return {
    id: job.id, state: job.state, calls: job.live?.calls ?? null, turn: job.live?.turn ?? null, messagesWaiting: job.live?.messagesWaiting ?? 0
  };
}

function liveAssistantOf(jobs: readonly SessionJobDocument[]): SessionJobDocument | null {
  return jobs.find((job) => job.kind === ASSISTANT_JOB_KIND && JobStateUtil.isUp(job.state)) ?? null;
}

function assistantModelOf(board: ConversationBoardDocument): AssistantModel {
  const history = board.questionHistory ?? [];
  const openIds = new Set(board.incidents.map((incident) => incident.id));
  const liveAssistant = liveAssistantOf(board.jobs);
  return {
    assistantJob:     liveAssistant === null ? null : assistantJobOf(liveAssistant),
    openIncidents:    IncidentTrailUtil.openIncidentEntriesOf(board.incidents, history),
    settledIncidents: IncidentTrailUtil.settledIncidentEntriesOf(history, openIds),
  };
}

/**
 * The messages the session has not taken yet: the newest `messagesWaiting` of the job's `job-messaged` records, since the session takes
 * them in the order they were sent. Counted, never matched by text, so two equal messages both show.
 */
function queuedMessagesOf(history: readonly HistoryRecordDocument[], jobId: string, messagesWaiting: number): QueuedMessage[] {
  if (messagesWaiting <= 0) return [];
  return history
    .filter((record) => record.kind === 'job-messaged' && record.jobId === jobId)
    .slice(-messagesWaiting)
    .map((record) => ({ at: record.at, text: typeof record.fields['text'] === 'string' ? record.fields['text'] : '' }));
}

/** Whether a message sends now or queues; with no session, that a fresh one is booting; nothing while the session has no reading yet. */
function composerTagOf(job: AssistantJob | null): TagProps | null {
  if (job === null) return BOOTING_TAG;
  return job.turn === null ? null : TAG_OF_TURN[job.turn];
}

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "running · 3 turns · 13 calls": the Assistant has no call budget, so none is shown. */
function headMetaOf(job: AssistantJob, turnCount: number): string {
  return [job.state, countText(turnCount, 'turn', 'turns'), ...job.calls === null ? [] : [countText(job.calls, 'call', 'calls')]].join(' · ');
}

/** A chat stamp in the viewer's local time with seconds, the full date on hover; none for an entry with no stamp. */
function stampOf(at: string | null, todayCalendarDate: string): StampProps | null {
  const epochMilliseconds = TimeUtil.epochMillisecondsOf(at);
  if (epochMilliseconds === null) return null;
  return { shortText: TimeUtil.secondsClockText(epochMilliseconds, todayCalendarDate), fullText: TimeUtil.fullInstantText(epochMilliseconds), element: 'time' };
}

function systemLineTextOf(facts: SystemLineFacts, jobId: string): string {
  const chatText = (chatSequence: number | null): string[] => (chatSequence === null ? [] : [`chat ${chatSequence}`]);
  switch (facts.form) {
    case 'boot':
      return [`Overseer booted ${jobId} with its prompt`, ...chatText(facts.chatSequence)].join(' · ');
    case 'incident-delivery':
      return [`Overseer delivered ${facts.incidentIds.join(', ')}`, ...chatText(facts.chatSequence)].join(' · ');
    case 'overseer-chat':
      return 'Overseer sent a message';
    case 'standing-reply':
      return 'Watcher sent a standing reply';
    case 'client-act':
      return `${facts.sender === 'assistant' ? 'The Assistant' : 'Overseer'} ${CLIENT_ACT_TEXT[facts.act]}`;
  }
}

function toolCallLineOf(call: ToolCall): ToolCallLine {
  return {
    key:        call.key,
    toolName:   call.toolName,
    inputText:  call.inputText,
    outcome:    call.state === 'unanswered' ? 'error' : call.state,
    resultText: call.state === 'running' ? null : CALL_RESULT_TEXT[call.state],
    startedAt:  call.startedAt,
  };
}

/** "Used 6 tools · Bash ×4 · Read · Grep · 1 error"; the working turn's fold says how many so far and starts open. */
function toolUseOf(fold: ToolFold, working: boolean): ToolUse {
  const callCount = fold.calls.length;
  return {
    summaryText: working ? `Using tools · ${callCount} so far` : `Used ${countText(callCount, 'tool', 'tools')}`,
    namesText:   fold.toolCounts.map(({ toolName, count }) => (count === 1 ? toolName : `${toolName} ×${count}`)).join(' · '),
    errorText:   fold.errorCount === 0 ? null : countText(fold.errorCount, 'error', 'errors'),
    calls:       fold.calls.map(toolCallLineOf),
    openAtFirst: working,
  };
}

/** The thread's items as the chat parts show them. */
function chatTurnsOf(items: readonly ChatThreadItem[], facts: ChatWordingFacts): ChatTurn[] {
  return items.map((item): ChatTurn => {
    const stamp = stampOf(item.at, facts.todayCalendarDate);
    switch (item.kind) {
      case 'system':
        return {
          kind: 'system', key: item.key, text: systemLineTextOf(item.facts, facts.jobId), stamp, revealText: item.revealText
        };
      case 'user-message':
        return {
          kind: 'user', key: item.key, speaker: USER_SPEAKER, stamp, stampSuffix: null, text: item.text, queued: item.queued ? QUEUED_TAG : null, pictures: null
        };
      case 'agent-turn':
        return {
          kind:        'agent',
          key:         item.key,
          speaker:     ASSISTANT_SPEAKER,
          state:       ASSISTANT_TURN_STATE,
          stamp,
          workingText: item.working ? 'working' : null,
          toolUse:     item.toolFold === null ? null : toolUseOf(item.toolFold, item.working),
          prose:       item.prose,
        };
    }
  });
}

export const AssistantModelUtil = Object.freeze({
  assistantModelOf, queuedMessagesOf, composerTagOf, headMetaOf, chatTurnsOf
});
