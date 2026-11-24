/**
 * Hephaestus's live events for `GET /api/events`: each id is `<generation>-<n>`, kept in a bounded replay buffer, so a reconnect whose
 * `Last-Event-ID` is of this generation and still buffered gets the events after it, and any other gets a fresh `board` first. A state
 * published after a pass is diffed against the last one: `board` when anything changed, and one event per changed job, newly ended job,
 * decision or incident, and for Hephaestus and usage. A job first shown past `launching`, ended included, is published `launching` first.
 * A changed gate profile run sends `profile`, and a changed pipeline, setup record or flow sends `pipeline` just before `board`, so the
 * flow can animate its marks from the slice before the whole state replaces it. A ticket whose documents record changed sends `documents`
 * just before `board`, a `board` following also when nothing else changed; a ticket whose effect reading changed sends `documents` alone,
 * between publishes.
 */
import type { EndedJob, JobLiveFactsWithSilence } from '../../adapters/@types/BoardStateParts.ts';
import type { BoardState }                        from './BoardState.ts';

/** `documents` names a ticket whose documents record or effect reading changed, so a reader fetches its documents again. */
export type HephaestusEventKind = 'board' | 'job' | 'decision' | 'incident' | 'hephaestus' | 'usage' | 'profile' | 'pipeline' | 'documents';

export interface TicketDocumentsEventData {
  ticketId: string;
}

export interface HephaestusEvent {
  id:   string;
  kind: HephaestusEventKind;
  data: unknown;
}

export type EventReplay = { verdict: 'replayed'; events: HephaestusEvent[] } | { verdict: 'fresh' };

export interface EventBroker {
  /**
   * Diffs the state and each ticket's documents fingerprint against the last ones published and sends what changed; the first state
   * sends only `board`. A publish that changed only documents sends their events and `board`.
   */
  publishState:            (state: BoardState, ticketDocumentFingerprints?: ReadonlyMap<string, string>) => void;
  /** Sends `documents` for a ticket whose effect reading changed, which no state carries. */
  announceTicketDocuments: (ticketId: string) => void;
  /** The events a reconnect missed, or `fresh` when it must start from a whole `board`. */
  replayAfter:             (lastEventId: string | null) => EventReplay;
  /** The newest state as a `board` event carrying the newest id, for a connect that starts fresh; `null` before the first state. */
  snapshot:                () => HephaestusEvent | null;
  subscribe:               (listener: (event: HephaestusEvent) => void) => () => void;
}

const REPLAY_BUFFER_EVENTS = 256;

interface Identified { id: string }

/** The slice a `pipeline` event carries: what changes when the stored pipeline, the setup record or its draft changes. */
export type PipelineEventData = Pick<BoardState, 'pipeline' | 'pipelineSetup' | 'pipelineFlow'>;

function pipelineSliceOf(state: BoardState): PipelineEventData {
  return { pipeline: state.pipeline, pipelineSetup: state.pipelineSetup, pipelineFlow: state.pipelineFlow };
}

function changedProfileRunsOf(previous: BoardState, next: BoardState): BoardState['profileRuns'] {
  const previousById = new Map(previous.profileRuns.map((run) => [run.profileRunId, JSON.stringify(run)]));
  return next.profileRuns.filter((run) => previousById.get(run.profileRunId) !== JSON.stringify(run));
}

function changedItemsOf<Item>(previous: readonly unknown[], next: readonly Item[]): Item[] {
  const previousById = new Map(previous.map((item) => [(item as Identified).id, JSON.stringify(item)]));
  return next.filter((item) => previousById.get((item as Identified).id) !== JSON.stringify(item));
}

/** A job that ended before any state showed it had no child under Talos yet when it launched, so nothing had run. */
function launchingJobOf(endedJob: EndedJob): Omit<EndedJob, 'state' | 'outcome' | 'cause' | 'endedAt'> & { state: 'launching'; launchedAt: null; live: JobLiveFactsWithSilence } {
  const {
    id, kind, role, ticketIds, target, attempt
  } = endedJob;
  return {
    id,
    kind,
    role,
    ticketIds,
    target,
    attempt,
    state:      'launching',
    launchedAt: null,
    live:       {
      jobId:                  id,
      calls:                  0,
      callBudget:             null,
      tokens:                 0,
      toolCalls:              0,
      lastToolCall:           null,
      subagents:              [],
      toolCallsWithSubagents: 0,
      turn:                   null,
      messagesWaiting:        0,
      lastLine:               null,
      usageWindow:            null,
      silentSweeps:           0,
    },
  };
}

/** The tickets whose fingerprint differs, a record that appeared or left included, in the order of the newer map, then of the older. */
function changedTicketIdsOf(previous: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>): string[] {
  const changed = [...next].filter(([ticketId, fingerprint]) => previous.get(ticketId) !== fingerprint).map(([ticketId]) => ticketId);
  const left = [...previous.keys()].filter((ticketId) => !next.has(ticketId));
  return [...changed, ...left];
}

function createEventBroker(generation: number): EventBroker {
  const replayBuffer: HephaestusEvent[] = [];
  const listeners = new Set<(event: HephaestusEvent) => void>();
  let sequence = 0;
  let lastState: BoardState | null = null;
  let lastStateText: string | null = null;
  let lastTicketDocumentFingerprints: ReadonlyMap<string, string> = new Map();

  function send(kind: HephaestusEventKind, data: unknown): void {
    sequence += 1;
    const event = { id: `${generation}-${sequence}`, kind, data };
    replayBuffer.push(event);
    if (replayBuffer.length > REPLAY_BUFFER_EVENTS) replayBuffer.shift();
    for (const listener of listeners) listener(event);
  }

  function sendTicketDocuments(ticketId: string): void {
    const data: TicketDocumentsEventData = { ticketId };
    send('documents', data);
  }

  function publishState(state: BoardState, ticketDocumentFingerprints: ReadonlyMap<string, string> = new Map()): void {
    const changedDocumentTicketIds = changedTicketIdsOf(lastTicketDocumentFingerprints, ticketDocumentFingerprints);
    lastTicketDocumentFingerprints = ticketDocumentFingerprints;
    // The page's generation stamp moves with every reading, so it is no change of the board.
    const stateText = JSON.stringify({ ...state, page: { ...state.page, payload: { ...state.page.payload, generatedAtEpochMilliseconds: 0 } } });
    if (stateText === lastStateText && changedDocumentTicketIds.length === 0) return;
    const previous = lastState;
    lastState = state;
    lastStateText = stateText;
    if (previous !== null) {
      // Every job enters the board launching; one a state first shows past that is published launching first, so no state goes unseen.
      const jobIdsShownBefore = new Set([...previous.jobs, ...previous.endedJobs].map((job) => job.id));
      for (const job of changedItemsOf(previous.jobs, state.jobs)) {
        if (!jobIdsShownBefore.has(job.id) && job.state !== 'launching') send('job', { ...job, state: 'launching' });
        send('job', job);
      }
      for (const endedJob of changedItemsOf(previous.endedJobs, state.endedJobs)) {
        if (!jobIdsShownBefore.has(endedJob.id)) send('job', launchingJobOf(endedJob));
        send('job', endedJob);
      }
      for (const decision of changedItemsOf(previous.decisions, state.decisions)) send('decision', decision);
      for (const incident of changedItemsOf(previous.incidents, state.incidents)) send('incident', incident);
      if (JSON.stringify(previous.hephaestus) !== JSON.stringify(state.hephaestus)) send('hephaestus', state.hephaestus);
      if (JSON.stringify(previous.usage) !== JSON.stringify(state.usage)) send('usage', state.usage);
      for (const run of changedProfileRunsOf(previous, state)) send('profile', run);
      const pipelineSlice = pipelineSliceOf(state);
      if (JSON.stringify(pipelineSliceOf(previous)) !== JSON.stringify(pipelineSlice)) send('pipeline', pipelineSlice);
      changedDocumentTicketIds.forEach(sendTicketDocuments);
    }
    send('board', state);
  }

  function replayAfter(lastEventId: string | null): EventReplay {
    if (lastEventId === null || !lastEventId.startsWith(`${generation}-`)) return { verdict: 'fresh' };
    const position = replayBuffer.findIndex((event) => event.id === lastEventId);
    if (position === -1) return { verdict: 'fresh' };
    return { verdict: 'replayed', events: replayBuffer.slice(position + 1) };
  }

  return {
    publishState,
    announceTicketDocuments: sendTicketDocuments,
    replayAfter,
    snapshot:                () => (lastState === null ? null : { id: `${generation}-${sequence}`, kind: 'board', data: lastState }),
    subscribe:               (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const EventBroker = Object.freeze({ createEventBroker });
