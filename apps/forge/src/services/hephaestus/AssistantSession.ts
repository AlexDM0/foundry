/**
 * The Assistant's turns, design section 8.3: every chat to it is numbered, the first message being chat 1, and the n-th `result` of its
 * session closes chat n's turn. Incidents and User's messages go out only when it is idle; a turn's open incidents default when it closes
 * or spends its call budget; past a context-token count its input closes after the turn; and one that went down is ended, never resumed.
 * One asked to wind down, by the board's switch going off, has its input closed once idle and ends `closed`, also when it went down first.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';

import { AssistantChatsIngestion, type AssistantChat, type AssistantChatsReading } from '../../adapters/assistant-chats/AssistantChatsIngestion.ts';
import { createAssistantChatsWriter }                                              from '../../adapters/assistant-chats/AssistantChatsWriter.ts';
import type { AgentAdapter }                                                       from '../../lib/agent-launch/AgentAdapter.ts';
import type { Incident, IncidentDeliveryTurn }                                     from '../../lib/tracker-model/@types/Incident.ts';
import type { Job }                                                                from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                                                              from '../../lib/tracker-model/Board.ts';
import { Playbook }                                                                from '../../lib/tracker-model/Playbook.ts';
import { ASSISTANT_CONTEXT_TOKENS_BEFORE_FRESH, ASSISTANT_TURN_CALL_BUDGET }       from '../../shared/constants/HephaestusLimits.ts';
import { AssistantBoot, FIRST_CHAT_SEQUENCE }                                      from './AssistantBoot.ts';
import type { BoardChildren }                                                      from './BoardChildren.ts';
import { jobFileInDataFolderOf, jobFolderIn }                                      from './HephaestusFiles.ts';
import { UnreadableJobFileIncident }                                               from './UnreadableJobFileIncident.ts';

/** What the Assistant's current session printed so far, read from its event log. */
export interface AssistantReading {
  jobId:                string;
  instance:             number;
  results:              number;
  /** Top-level tool-calling turns since the newest `result`: the open turn's calls. */
  callsSinceLastResult: number;
  /** Of the newest `result`; `null` before one, or when the vendor reports none. */
  lastContextTokens:    number | null;
}

/** The incidents of one numbered chat, which the command line words. */
export interface AssistantChatFacts {
  sequence:  number;
  incidents: readonly Readonly<Incident>[];
}

export interface AssistantTurnObservations {
  closedDeliveryTurns:      IncidentDeliveryTurn[];
  budgetSpentDeliveryTurns: IncidentDeliveryTurn[];
  assistantHasAnswered:     boolean;
}

export interface AssistantChatDelivery {
  boardChildren:    BoardChildren;
  trackerDirectory: string;
  board:            Board;
  adapter:          Pick<AgentAdapter, 'chatLineOf' | 'interruptLineOf'>;
  readings:         readonly AssistantReading[];
  chatTextOf:       (facts: AssistantChatFacts) => string;
}

export interface AssistantQuietWatch {
  /** One sweep: the running Assistants whose cursor stood still mid-turn for `quietSweeps` sweeps, which are down. */
  sweep: (jobs: readonly Readonly<Job>[], midTurnJobIds: readonly string[]) => string[];
}

const CHATS_FILE = 'assistant-chats.json';
const MARKERS_FOLDER = 'assistant-frames';
const DOWN_CAUSE = 'assistant-down';
const WIND_DOWN_REQUEST = 'wind-down';

function liveAssistantsOf(board: Pick<Board, 'jobs'>): readonly Readonly<Job>[] {
  return board.jobs().filter((job) => AssistantBoot.isAssistantJob(job));
}

function readingOf(children: BoardChildren, adapter: Pick<AgentAdapter, 'eventsOf'>, job: Readonly<Job>): AssistantReading {
  const entries = children.eventsAfter(children.jobFolderOf(job.id), job.childInstance, 0);
  let results = 0;
  let lastContextTokens: number | null = null;
  let callsSinceLastResult = new Set<string>();
  for (const entry of entries === 'malformed' ? [] : entries.filter((logged) => logged.origin === 'agent')) {
    for (const event of adapter.eventsOf(entry.line)) {
      if (event.kind === 'assistant-turn' && event.parentToolUseId === null) callsSinceLastResult.add(event.messageId);
      if (event.kind !== 'result') continue;
      results += 1;
      lastContextTokens = event.contextTokens;
      callsSinceLastResult = new Set();
    }
  }
  return {
    jobId: job.id, instance: job.childInstance, results, callsSinceLastResult: callsSinceLastResult.size, lastContextTokens
  };
}

function readingsOf(children: BoardChildren, adapter: Pick<AgentAdapter, 'eventsOf'>, board: Pick<Board, 'jobs'>): AssistantReading[] {
  return liveAssistantsOf(board).map((job) => readingOf(children, adapter, job));
}

/** The chats written down in the job folder; every caller answers a file that cannot be read itself, and none overwrites it. */
function chatsOf(trackerDirectory: string, jobId: string): AssistantChatsReading {
  return new AssistantChatsIngestion(join(jobFolderIn(trackerDirectory, jobId), CHATS_FILE)).read();
}

/** No file yet is no chat past the first message. */
function chatsWrittenOf(reading: Exclude<AssistantChatsReading, { verdict: 'unreadable' }>): readonly AssistantChat[] {
  return reading.verdict === 'readable' ? reading.chats : [];
}

/** In the hold: the chats, or `null` once a file that cannot be read opened its incident on the Assistant, which then takes no step on them. */
function chatsInTheHoldOf(board: Board, trackerDirectory: string, job: Readonly<Job>, at: string): readonly AssistantChat[] | null {
  const reading = chatsOf(trackerDirectory, job.id);
  if (reading.verdict !== 'unreadable') return chatsWrittenOf(reading);
  UnreadableJobFileIncident.openOnce(board, { jobId: job.id, file: jobFileInDataFolderOf(job.id, CHATS_FILE), reason: reading.reason }, at);
  return null;
}

function deliveryTurnsOf(board: Pick<Board, 'incidents'>, jobId: string): IncidentDeliveryTurn[] {
  const sequences = new Set(board.incidents().flatMap((incident) => (incident.deliveredInTurn?.jobId === jobId ? [incident.deliveredInTurn.chatSequence] : [])));
  return [...sequences].sort((a, b) => a - b).map((chatSequence) => ({ jobId, chatSequence }));
}

/** The newest chat numbered so far: on the board while it is only decided, in the job folder once its line was written down. */
function newestChatOf(board: Pick<Board, 'incidents'>, chats: readonly AssistantChat[], jobId: string): number {
  return Math.max(FIRST_CHAT_SEQUENCE, ...chats.map((chat) => chat.sequence), ...deliveryTurnsOf(board, jobId).map((turn) => turn.chatSequence));
}

function isIdle(job: Readonly<Job>, reading: AssistantReading | undefined, newestChat: number): boolean {
  return job.state === 'running' && reading !== undefined && reading.instance === job.childInstance && reading.results >= newestChat;
}

/**
 * The rule every delivery to the Assistant waits on, so a reader that shows whether a chat goes out now never contradicts the queue: one
 * whose chats file cannot be read is never idle, since nothing goes out to it.
 */
function assistantIsIdle(trackerDirectory: string, board: Pick<Board, 'incidents'>, job: Readonly<Job>, reading: AssistantReading | undefined): boolean {
  const chats = chatsOf(trackerDirectory, job.id);
  return chats.verdict !== 'unreadable' && isIdle(job, reading, newestChatOf(board, chatsWrittenOf(chats), job.id));
}

function isWindingDown(job: Readonly<Job>): boolean {
  return job.stopRequest === WIND_DOWN_REQUEST;
}

/**
 * Run in the hold before `endDownAssistants`. While the board's switch is off, every Assistant not yet asked is asked to wind down, also
 * when the `assistant` key left the pipeline by another way than its command; a wind-down once asked stands when the switch goes on
 * again, so that Assistant ends and the board boots a fresh one.
 */
function windDownWhileOff(board: Board, at: string): void {
  if (!board.assistantIsOn()) board.windDownAssistants(at);
}

/**
 * Run in the hold before the lifecycle: an Assistant interrupted (its child lost, its session crashed, a reboot, a clean quit, a usage
 * limit) or quiet mid-turn is ended, `failed` before its first `result` and `replaced` after, and what it was delivered goes out again to
 * the fresh one. One whose own outage or lease end waits for User's resume is left until it came. One asked to wind down has no turn left
 * to finish once it is down, whatever interrupted it: it ends `closed`, no failed boot. Returns whether a boot failed, so no retry boots
 * in the same pass.
 */
function endDownAssistants(board: Board, readings: readonly AssistantReading[], quietJobIds: readonly string[], at: string): { bootFailed: boolean; endedJobs: Readonly<Job>[] } {
  let bootFailed = false;
  const endedJobs: Readonly<Job>[] = [];
  const logRecords = board.logRecordsSoFar();
  for (const job of liveAssistantsOf(board)) {
    const waitsForInstruction = !isWindingDown(job) && Playbook.assistantWaitsForInstruction(job, logRecords);
    const down = (job.state === 'interrupted' && !waitsForInstruction) || (job.state === 'running' && quietJobIds.includes(job.id));
    if (!down) continue;
    for (const incident of board.incidents().filter((delivered) => delivered.deliveredInTurn?.jobId === job.id)) board.withdrawIncidentDelivery(incident.id);
    const answered = (readings.find((reading) => reading.jobId === job.id)?.results ?? 0) > 0;
    if (isWindingDown(job)) board.endJob(job.id, { outcome: 'closed' }, at);
    else board.endJob(job.id, { outcome: answered ? 'replaced' : 'failed', cause: DOWN_CAUSE }, at);
    bootFailed ||= !answered && !isWindingDown(job);
    endedJobs.push(job);
  }
  return { bootFailed, endedJobs };
}

/** What the lifecycle decides the turns' defaults by: turns closed by their `result`, and the open turn once it spent its call budget. */
function turnObservationsOf(board: Pick<Board, 'jobs' | 'incidents'>, readings: readonly AssistantReading[]): AssistantTurnObservations {
  const observations: AssistantTurnObservations = { closedDeliveryTurns: [], budgetSpentDeliveryTurns: [], assistantHasAnswered: false };
  for (const job of liveAssistantsOf(board)) {
    const reading = readings.find((candidate) => candidate.jobId === job.id && candidate.instance === job.childInstance);
    if (reading === undefined) continue;
    observations.assistantHasAnswered ||= reading.results > 0;
    for (const turn of deliveryTurnsOf(board, job.id)) {
      if (reading.results >= turn.chatSequence) observations.closedDeliveryTurns.push(turn);
      else if (turn.chatSequence === reading.results + 1 && reading.callsSinceLastResult >= ASSISTANT_TURN_CALL_BUDGET) observations.budgetSpentDeliveryTurns.push(turn);
    }
  }
  return observations;
}

/**
 * Run in the hold after the lifecycle, in every pass, a usage limit holding or not: an idle Assistant that was asked to wind down, or is
 * past the context-token count, has its input closed, and the next delivery goes to a fresh one if the board boots one. An Assistant whose
 * chats file cannot be read has its incident opened here.
 */
function closeInputWhenIdle(board: Board, readings: readonly AssistantReading[], trackerDirectory: string, at: string): void {
  for (const job of liveAssistantsOf(board)) {
    const reading = readings.find((candidate) => candidate.jobId === job.id);
    const chats   = chatsInTheHoldOf(board, trackerDirectory, job, at);
    if (chats === null || !isIdle(job, reading, newestChatOf(board, chats, job.id))) continue;
    if (isWindingDown(job) || (reading?.lastContextTokens ?? 0) >= ASSISTANT_CONTEXT_TOKENS_BEFORE_FRESH) board.moveJob(job.id, 'stopping', at);
  }
}

/**
 * Run in the hold after `closeInputWhenIdle`, which opened the incident of a chats file that cannot be read: every undelivered incident goes
 * out to an idle Assistant as its next numbered chat, never to one whose chats are unknown.
 */
function deliverIncidentsWhenIdle(board: Board, readings: readonly AssistantReading[], trackerDirectory: string): void {
  for (const job of liveAssistantsOf(board)) {
    const reading = readings.find((candidate) => candidate.jobId === job.id);
    const chats   = chatsOf(trackerDirectory, job.id);
    if (chats.verdict === 'unreadable') continue;
    const newestChat = newestChatOf(board, chatsWrittenOf(chats), job.id);
    if (!isIdle(job, reading, newestChat)) continue;
    for (const incident of board.incidents().filter((open) => open.deliveredInTurn === null)) {
      board.markIncidentDelivered(incident.id, { jobId: job.id, chatSequence: newestChat + 1 });
    }
  }
}

function userMessagesOf(board: Pick<Board, 'logRecordsSoFar'>, jobId: string): { number: number; text: string }[] {
  return board.logRecordsSoFar()
    .filter((record) => record.kind === 'job-messaged' && record.jobId === jobId)
    .map((record, index) => ({ number: index + 1, text: record.kind === 'job-messaged' ? record.fields.text : '' }));
}

/** The chats decided on the board, then one of User's messages if the Assistant is idle, written down before any line is sent. */
function chatsToWriteOf(board: Board, job: Readonly<Job>, reading: AssistantReading | undefined, chats: readonly AssistantChat[]): AssistantChat[] {
  const written = new Set(chats.map((chat) => chat.sequence));
  const deliveredIn = (turn: IncidentDeliveryTurn): string[] => board.incidents()
    .filter((incident) => incident.deliveredInTurn?.chatSequence === turn.chatSequence && incident.deliveredInTurn.jobId === turn.jobId)
    .map((incident) => incident.id);
  const decided = deliveryTurnsOf(board, job.id)
    .filter((turn) => turn.chatSequence > FIRST_CHAT_SEQUENCE && !written.has(turn.chatSequence))
    .map((turn) => ({ sequence: turn.chatSequence, incidentIds: deliveredIn(turn), messageNumber: null }));
  const all = [...chats, ...decided];
  const carried = new Set(all.flatMap((chat) => (chat.messageNumber === null ? [] : [chat.messageNumber])));
  const nextMessage = userMessagesOf(board, job.id).find((message) => !carried.has(message.number));
  const newestChat = newestChatOf(board, all, job.id);
  if (nextMessage === undefined || !isIdle(job, reading, newestChat)) return all;
  return [...all, { sequence: newestChat + 1, incidentIds: [], messageNumber: nextMessage.number }];
}

/**
 * User's messages to the Assistant not yet sent: no chat carries one yet, or its chat's line was not taken, by the markers `deliverChats`
 * writes. While the chats file cannot be read no message is known to be carried, and none goes out, so each counts.
 */
function unsentMessageCountOf(board: Pick<Board, 'logRecordsSoFar'>, trackerDirectory: string, job: Readonly<Job>): number {
  const reading = chatsOf(trackerDirectory, job.id);
  const chats   = reading.verdict === 'unreadable' ? [] : chatsWrittenOf(reading);
  const sequenceByMessageNumber = new Map(chats.flatMap((chat) => (chat.messageNumber === null ? [] : [[chat.messageNumber, chat.sequence] as const])));
  const markersFolder = join(jobFolderIn(trackerDirectory, job.id), MARKERS_FOLDER);
  return userMessagesOf(board, job.id).filter((message) => {
    const sequence = sequenceByMessageNumber.get(message.number);
    return sequence === undefined || !existsSync(join(markersFolder, `chat-${sequence}`));
  }).length;
}

/**
 * After the hold: each numbered chat as one line, in order, a marker keeping a restart from sending one again (at least once: not when
 * Hephaestus died before the marker), and the interrupt line once the open turn spent its call budget. An Assistant whose chats file cannot
 * be read gets nothing, and the file is kept as it is for the move its incident asks.
 */
async function deliverChats(request: AssistantChatDelivery): Promise<void> {
  const { board, adapter } = request;
  for (const job of liveAssistantsOf(board).filter((live) => live.state === 'running')) {
    const jobFolder = request.boardChildren.jobFolderOf(job.id);
    const reading   = request.readings.find((candidate) => candidate.jobId === job.id);
    const earlier   = chatsOf(request.trackerDirectory, job.id);
    if (earlier.verdict === 'unreadable') continue;
    const chats     = chatsToWriteOf(board, job, reading, chatsWrittenOf(earlier));
    if (chats.length !== chatsWrittenOf(earlier).length) createAssistantChatsWriter(join(jobFolder, CHATS_FILE)).write(chats);
    const messages = userMessagesOf(board, job.id);
    for (const chat of chats) {
      const text = chat.messageNumber === null
        ? request.chatTextOf({ sequence: chat.sequence, incidents: board.incidents().filter((incident) => chat.incidentIds.includes(incident.id)) })
        : messages.find((message) => message.number === chat.messageNumber)?.text ?? '';
      const marker = join(jobFolder, MARKERS_FOLDER, `chat-${chat.sequence}`);
      await request.boardChildren.sendInputOnce(marker, jobFolder, job.childInstance, [{ act: 'write-line', line: adapter.chatLineOf(text) }]);
    }
    if (reading !== undefined && reading.results < newestChatOf(board, chats, job.id) && reading.callsSinceLastResult >= ASSISTANT_TURN_CALL_BUDGET) {
      const marker = join(jobFolder, MARKERS_FOLDER, `interrupt-${reading.results + 1}`);
      await request.boardChildren.sendInputOnce(marker, jobFolder, job.childInstance, [{ act: 'write-line', line: adapter.interruptLineOf() }]);
    }
  }
}

/**
 * The running Assistants with a chat their session has not answered yet. One whose chats file cannot be read is not counted, so the quiet
 * watch never ends it as down while its incident waits for a move.
 */
function midTurnJobIdsOf(trackerDirectory: string, board: Board, readings: readonly AssistantReading[]): string[] {
  return liveAssistantsOf(board).filter((job) => {
    const reading = readings.find((candidate) => candidate.jobId === job.id);
    const chats   = chatsOf(trackerDirectory, job.id);
    if (chats.verdict === 'unreadable') return false;
    return job.state === 'running' && reading !== undefined && reading.results < newestChatOf(board, chatsWrittenOf(chats), job.id);
  }).map((job) => job.id);
}

/** In memory, like the build jobs' watch in `src/services/hephaestus/IncidentRouter.ts`, and for the same reason a clock exception. */
function createAssistantQuietWatch(quietSweeps: number): AssistantQuietWatch {
  const standingByJobId = new Map<string, { cursor: string; sweeps: number }>();
  return {
    sweep: (jobs, midTurnJobIds) => {
      const due: string[] = [];
      const watched = jobs.filter((job) => AssistantBoot.isAssistantJob(job) && job.state === 'running' && midTurnJobIds.includes(job.id));
      for (const jobId of [...standingByJobId.keys()]) {
        if (!watched.some((job) => job.id === jobId)) standingByJobId.delete(jobId);
      }
      for (const job of watched) {
        const cursor   = `${job.childInstance}.${job.eventCursor.instance}.${job.eventCursor.sequence}`;
        const standing = standingByJobId.get(job.id);
        const sweeps   = standing?.cursor === cursor ? standing.sweeps + 1 : 0;
        standingByJobId.set(job.id, { cursor, sweeps });
        if (sweeps >= quietSweeps) due.push(job.id);
      }
      return due;
    },
  };
}

export const AssistantSession = Object.freeze({
  chatsOf,
  readingOf,
  readingsOf,
  assistantIsIdle,
  unsentMessageCountOf,
  windDownWhileOff,
  endDownAssistants,
  turnObservationsOf,
  closeInputWhenIdle,
  deliverIncidentsWhenIdle,
  chatsToWriteOf,
  deliverChats,
  midTurnJobIdsOf,
  createAssistantQuietWatch,
});
