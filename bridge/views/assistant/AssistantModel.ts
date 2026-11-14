/**
 * The Assistant view as data: the live Assistant session, or none while a fresh one boots; its chat thread worded as turns, with the
 * messages it has not taken yet as queued bubbles; the composer's status; its open incidents; and the handled ones read back from the log
 * through `IncidentTrailUtil`, each with the moves, notes and escalations made under it.
 */
import type { FlintPose }  from 'design-system/FlintSlot';
import type { StampProps } from 'design-system/Stamp';
import type { TagProps }   from 'design-system/Tag';

import type { DisplayState } from '../../../src/lib/tracker-model/@types/Task.ts';
import { OpenDecisionsUtil } from '../../../src/shared/monitor/utils/OpenDecisionsUtil.ts';
import type {
  ConversationBoardDocument,
  HistoryRecordDocument,
  SessionJobDocument,
  SessionTurnDocument
} from '../../@types/ConversationDocuments.ts';
import type { ChatTurn }                         from '../../conversation/ChatThread.tsx';
import type { ChatThreadItem, QueuedMessage }    from '../../conversation/ChatThreadModel.ts';
import { ChatTurnWordingUtil }                   from '../../conversation/ChatTurnWordingUtil.ts';
import { IncidentTrailUtil, type IncidentEntry } from '../../utils/IncidentTrailUtil.ts';
import { JobStateUtil }                          from '../../utils/JobStateUtil.ts';
import { StateToneUtil }                         from '../../utils/StateToneUtil.ts';
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
  readonly assistantJob:        AssistantJob | null;
  readonly openIncidents:       readonly IncidentEntry[];
  readonly settledIncidents:    readonly IncidentEntry[];
  /** The open decisions the Assistant put to User: the ones its job asks, and the ones it escalated from an incident. */
  readonly askingDecisionCount: number;
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

const QUEUED_TAG: TagProps = { text: 'Queued until the Assistant is idle', ...StateToneUtil.tagLookOf('pending'), dot: true };

const BOOTING_TAG: TagProps = { text: 'No session: a fresh one is booting', ...StateToneUtil.tagLookOf('pending'), dot: true };

const TAG_OF_TURN: Readonly<Record<SessionTurnDocument, TagProps>> = {
  'mid-turn':      { text: 'Busy: the next message queues', ...StateToneUtil.tagLookOf('in-progress'), dot: true },
  'between-turns': { text: 'Idle: a message sends now', ...StateToneUtil.tagLookOf('reviewed'), dot: true },
};

function assistantJobOf(job: SessionJobDocument): AssistantJob {
  return {
    id: job.id, state: job.state, calls: job.live?.calls ?? null, turn: job.live?.turn ?? null, messagesWaiting: job.live?.messagesWaiting ?? 0
  };
}

function liveAssistantOf(jobs: readonly SessionJobDocument[]): SessionJobDocument | null {
  return jobs.find((job) => job.kind === ASSISTANT_JOB_KIND && JobStateUtil.isUp(job.state)) ?? null;
}

function askingDecisionCountOf(board: ConversationBoardDocument, assistantJobId: string | null): number {
  const escalatedIds = OpenDecisionsUtil.escalatedDecisionIdsOf(board.questionHistory ?? []);
  return board.decisions.filter((decision) => escalatedIds.has(decision.id) || (assistantJobId !== null && decision.jobId === assistantJobId)).length;
}

function assistantModelOf(board: ConversationBoardDocument): AssistantModel {
  const history = board.questionHistory ?? [];
  const openIds = new Set(board.incidents.map((incident) => incident.id));
  const liveAssistant = liveAssistantOf(board.jobs);
  return {
    assistantJob:        liveAssistant === null ? null : assistantJobOf(liveAssistant),
    openIncidents:       IncidentTrailUtil.openIncidentEntriesOf(board.incidents, history),
    settledIncidents:    IncidentTrailUtil.settledIncidentEntriesOf(history, openIds),
    askingDecisionCount: askingDecisionCountOf(board, liveAssistant?.id ?? null),
  };
}

/** Flint waits while one of the Assistant's asks waits on User, and idles otherwise. */
function flintPoseOf(model: Pick<AssistantModel, 'askingDecisionCount'>): FlintPose {
  return model.askingDecisionCount > 0 ? 'waiting' : 'idle';
}

/** "1 decision waits on User", "2 decisions wait on User"; nothing while none waits. */
function askingDecisionsTextOf(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? '1 decision waits on User' : `${count} decisions wait on User`;
}

/** An incident step's stamp: the clock time on the viewer's day, the date before it on another, the full stamp on hover. */
function stepStampOf(at: string | null, todayCalendarDate: string): StampProps | null {
  const epochMilliseconds = TimeUtil.epochMillisecondsOf(at);
  if (epochMilliseconds === null) return null;
  return { shortText: TimeUtil.shortInstantText(epochMilliseconds, todayCalendarDate), fullText: TimeUtil.fullInstantText(epochMilliseconds), element: 'time' };
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

/** "running · 3 turns · 13 calls": the Assistant has no call budget, so none is shown. */
function headMetaOf(job: AssistantJob, turnCount: number): string {
  const { countTextOf } = ChatTurnWordingUtil;
  return [job.state, countTextOf(turnCount, 'turn', 'turns'), ...job.calls === null ? [] : [countTextOf(job.calls, 'call', 'calls')]].join(' · ');
}

/** The thread's items as the chat parts show them. */
function chatTurnsOf(items: readonly ChatThreadItem[], facts: ChatWordingFacts): ChatTurn[] {
  const bootLineText = `Overseer booted ${facts.jobId} with its prompt`;
  return items.map((item): ChatTurn => {
    const stamp = ChatTurnWordingUtil.stampOf(item.at, facts.todayCalendarDate);
    switch (item.kind) {
      case 'system':
        return {
          kind: 'system', key: item.key, text: ChatTurnWordingUtil.systemLineTextOf(item.facts, bootLineText), stamp, revealText: item.revealText
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
          toolUse:     item.toolFold === null ? null : ChatTurnWordingUtil.toolUseOf(item.toolFold, item.working),
          prose:       item.prose,
        };
    }
  });
}

export const AssistantModelUtil = Object.freeze({
  assistantModelOf, flintPoseOf, askingDecisionsTextOf, stepStampOf, queuedMessagesOf, composerTagOf, headMetaOf, chatTurnsOf
});
