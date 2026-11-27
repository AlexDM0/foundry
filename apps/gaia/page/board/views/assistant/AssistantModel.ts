/**
 * The Assistant view as data: the board's Assistant switch and the command a press sends, the live session (none while one boots or the
 * switch is off), its chat thread with the messages it has not taken as queued bubbles, the composer's status, and its open and handled
 * incidents through `IncidentTrailUtil`.
 */

import { PAGE_CONTRACT_VERSIONS }                              from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                           from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardQuestionHistoryEntryDocument }              from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                                  from '../../../@types/board/BoardDocument.ts';
import type { BoardJobDocument }                               from '../../../@types/board/BoardJobDocuments.ts';
import type { BoardDisplayState, BoardJobState, BoardJobTurn } from '../../../@types/board/BoardVocabulary.ts';
import type { StampProps, TagProps }                           from '../../../lib/design-system/DesignSystemInterface.ts';
import { CountTextUtil }                                       from '../../../shared/utils/CountTextUtil.ts';
import type { ChatTurn }                                       from '../../conversation/ChatThread.tsx';
import type { ChatThreadItem, QueuedMessage }                  from '../../conversation/ChatThreadModel.ts';
import { ChatTurnWordingUtil }                                 from '../../conversation/ChatTurnWordingUtil.ts';
import { FLINT_SLOT_CUES, type FlintSlotCue }                  from '../../flint/FlintSlotCues.ts';
import { IncidentTrailUtil, type IncidentEntry }               from '../../utils/IncidentTrailUtil.ts';
import { JobStateUtil }                                        from '../../utils/JobStateUtil.ts';
import { StateToneUtil }                                       from '../../utils/StateToneUtil.ts';
import { TimeUtil }                                            from '../../utils/TimeUtil.ts';

/** The board fields the Assistant view reads. */
export type AssistantBoard = Pick<
  BoardDocument,
  'assistantIsOn' | 'jobs' | 'decisions' | 'escalatedDecisionIds' | 'incidents' | 'questionHistory' | 'notices'
>;

/** The live Assistant job: its state, its API turns so far, its turn, and how many of User's messages it has not taken yet. */
export interface AssistantJob {
  readonly id:              string;
  readonly state:           BoardJobState;
  readonly calls:           number;
  /** `null` while the session has no reading of its turn yet. */
  readonly turn:            BoardJobTurn | null;
  readonly messagesWaiting: number;
}

export interface AssistantModel {
  /** The board's switch as the forge serves it, never what a press hopes for. */
  readonly assistantIsOn:       boolean;
  /** `null` while no Assistant session is up: a fresh one is booting, or the switch is off. */
  readonly assistantJob:        AssistantJob | null;
  readonly openIncidents:       readonly IncidentEntry[];
  readonly settledIncidents:    readonly IncidentEntry[];
  /** The open decisions the Assistant put to User: the ones its job asks, and the ones the forge serves as escalated from an incident. */
  readonly askingDecisionCount: number;
}

/** What a thread is worded against: the session's job, which a boot line names, and the viewer's day, which its stamps are shown against. */
export interface ChatWordingFacts {
  readonly jobId:             string;
  readonly todayCalendarDate: string;
}

/** The Assistant's job kind as the board serves it. */
const ASSISTANT_JOB_KIND = 'assistant';

const ASSISTANT_SPEAKER = 'Assistant';

const USER_SPEAKER = 'User';

/** The palette row an Assistant turn's dot takes. */
const ASSISTANT_TURN_STATE: BoardDisplayState = 'reviewed';

const QUEUED_TAG: TagProps = { text: 'Queued until the Assistant is idle', ...StateToneUtil.tagLookOf('committed'), dot: true };

const SWITCHED_OFF_TAG: TagProps = { text: 'No session: the Assistant is off', ...StateToneUtil.tagLookOf('draft'), dot: true };

const BOOTING_TAG: TagProps = { text: 'No session: a fresh one is booting', ...StateToneUtil.tagLookOf('committed'), dot: true };

const TAG_OF_TURN: Readonly<Record<BoardJobTurn, TagProps>> = {
  'mid-turn':      { text: 'Busy: the next message queues', ...StateToneUtil.tagLookOf('in-progress'), dot: true },
  'between-turns': { text: 'Idle: a message sends now', ...StateToneUtil.tagLookOf('reviewed'), dot: true },
};

function assistantJobOf(job: BoardJobDocument): AssistantJob {
  return {
    id: job.id, state: job.state, calls: job.live.calls, turn: job.live.turn, messagesWaiting: job.live.messagesWaiting
  };
}

function liveAssistantOf(jobs: readonly BoardJobDocument[]): BoardJobDocument | null {
  return jobs.find((job) => job.kind === ASSISTANT_JOB_KIND && JobStateUtil.isUp(job.state)) ?? null;
}

function askingDecisionCountOf(board: Pick<AssistantBoard, 'decisions' | 'escalatedDecisionIds'>, assistantJobId: string | null): number {
  const escalatedIds = new Set(board.escalatedDecisionIds);
  return board.decisions.filter((decision) => escalatedIds.has(decision.id) || (assistantJobId !== null && decision.jobId === assistantJobId)).length;
}

function assistantModelOf(board: AssistantBoard): AssistantModel {
  const openIds = new Set(board.incidents.map((incident) => incident.id));
  const liveAssistant = liveAssistantOf(board.jobs);
  return {
    assistantIsOn:       board.assistantIsOn,
    assistantJob:        liveAssistant === null ? null : assistantJobOf(liveAssistant),
    openIncidents:       IncidentTrailUtil.openIncidentEntriesOf(board.incidents, board.questionHistory, board.notices),
    settledIncidents:    IncidentTrailUtil.settledIncidentEntriesOf(board.questionHistory, openIds, board.notices),
    askingDecisionCount: askingDecisionCountOf(board, liveAssistant?.id ?? null),
  };
}

/** The switch's words, which are also its name. */
function switchLabelOf(assistantIsOn: boolean): string {
  return assistantIsOn ? 'Assistant on' : 'Assistant off';
}

/** What a press of the switch sends: the other state. */
function switchCommandOf(assistantIsOn: boolean): BoardCommandDocument {
  return { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-assistant-set', on: !assistantIsOn };
}

/** The cue of Flint's slot: the Assistant waits on User while one of its asks waits, and is idle otherwise. */
function flintCueOf(model: Pick<AssistantModel, 'askingDecisionCount'>): FlintSlotCue {
  return model.askingDecisionCount > 0 ? FLINT_SLOT_CUES.AGENT_WAITS_ON_USER : FLINT_SLOT_CUES.AGENT_IS_IDLE;
}

/** "1 decision waits on User", "2 decisions wait on User"; nothing while none waits. */
function askingDecisionsTextOf(count: number): string | null {
  if (count === 0) return null;
  return CountTextUtil.countedPhrase(count, 'decision waits on User', 'decisions wait on User');
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
function queuedMessagesOf(history: readonly BoardQuestionHistoryEntryDocument[], jobId: string, messagesWaiting: number): QueuedMessage[] {
  if (messagesWaiting <= 0) return [];
  return history
    .filter((record) => record.kind === 'job-messaged' && record.jobId === jobId)
    .slice(-messagesWaiting)
    .map((record) => ({ at: record.at, text: typeof record.fields['text'] === 'string' ? record.fields['text'] : '' }));
}

/**
 * Whether a message sends now or queues; with no session, that a fresh one is booting, or that the Assistant is off; nothing while the
 * session has no reading yet.
 */
function composerTagOf(job: AssistantJob | null, assistantIsOn: boolean): TagProps | null {
  if (job === null) return assistantIsOn ? BOOTING_TAG : SWITCHED_OFF_TAG;
  return job.turn === null ? null : TAG_OF_TURN[job.turn];
}

/** "running · 3 turns · 13 calls": the Assistant has no call budget, so none is shown. */
function headMetaOf(job: AssistantJob, turnCount: number): string {
  return [job.state, CountTextUtil.countedPhrase(turnCount, 'turn', 'turns'), CountTextUtil.countedPhrase(job.calls, 'call', 'calls')].join(' · ');
}

/** The thread's items as the chat parts show them. */
function chatTurnsOf(items: readonly ChatThreadItem[], facts: ChatWordingFacts): ChatTurn[] {
  const bootLineText = `Hephaestus booted ${facts.jobId} with its prompt`;
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
  assistantModelOf, switchLabelOf, switchCommandOf, flintCueOf, askingDecisionsTextOf, stepStampOf, queuedMessagesOf, composerTagOf, headMetaOf, chatTurnsOf
});
