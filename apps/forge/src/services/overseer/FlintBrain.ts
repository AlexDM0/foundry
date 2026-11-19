/**
 * Flint's brain on the Overseer side: one confined session per run, started by a client and ended by its time, a stop, the usage limit
 * or a failure. It answers the Bridge's asks with a move off the digest's own lists, at most once an interval and only when what it reads
 * changed, and it is no job: it takes no slot and never enters the board's jobs. Its reading is the monitor snapshot's `flintBrain`.
 */
import type {
  MonitorFlintBrainDocument,
  MonitorFlintBrainEndedReason,
  MonitorFlintBrainMoveDocument,
  MonitorFlintBrainStartedBy
} from 'forge-contracts/MonitorSnapshotDocument';

import type { AgentAdapter }                       from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentSessionEvent }                  from '../../lib/agent-launch/AgentSessionEvent.ts';
import {
  FLINT_BRAIN_ANSWER_TIMEOUT_MILLISECONDS,
  FLINT_BRAIN_ASK_INTERVAL_MILLISECONDS,
  FLINT_BRAIN_EFFORT,
  FLINT_BRAIN_ENDED_STATE_KEPT_MILLISECONDS,
  FLINT_BRAIN_MODEL,
  FLINT_BRAIN_RECENT_MOVES_LIMIT,
  FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS
} from '../../shared/constants/OverseerLimits.ts';
import { type CreditedTurn, TokenCrediting }                   from '../lifecycle/TokenCrediting.ts';
import type { FlintBrainEndedRun, FlintBrainRefusal }          from './@types/FlintBrainRun.ts';
import { type FlintBrainLaunchFacts, FlintBrainProfile }       from './FlintBrainProfile.ts';
import type { FlintBrainLaunchOutcome, FlintBrainSessionHost } from './FlintBrainSessionHost.ts';
import { SessionConfinement }                                  from './SessionConfinement.ts';
import { type FlintBrainDigest, FlintBrainDigestUtil }         from './utils/FlintBrainDigestUtil.ts';
import { FlintBrainWordingUtil }                               from './utils/FlintBrainWordingUtil.ts';

export interface FlintBrainTimers {
  readonly setTimeout:   (callback: () => void, delayMilliseconds: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export const REAL_FLINT_BRAIN_TIMERS: FlintBrainTimers = Object.freeze({
  setTimeout:   (callback: () => void, delayMilliseconds: number): unknown => setTimeout(callback, delayMilliseconds),
  clearTimeout: (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

export interface FlintBrainOptions {
  readonly adapter:          AgentAdapter;
  readonly launchFacts:      FlintBrainLaunchFacts;
  readonly sessionHost:      FlintBrainSessionHost;
  readonly timers:           FlintBrainTimers;
  readonly now:              () => Date;
  readonly overseerIsPaused: () => boolean;
  /** The usage marker's reset while it holds launches; `null` while it holds none. */
  readonly usageLimitHolds:  () => string | null;
  /** Each change of the reading: a state, a move, the tokens so far. */
  readonly onChange:         (reading: MonitorFlintBrainDocument | null) => void;
  /** Once per run that ran, before the `onChange` of its end. */
  readonly onEnded:          (run: FlintBrainEndedRun) => void;
}

export type FlintBrainVerdict =
  | { readonly verdict: 'done' }
  | { readonly verdict: 'refused'; readonly refusal: FlintBrainRefusal; readonly sentence: string };

/** Why the rule director answers this time; the session was not asked, or its answer was not taken. */
export type FlintBrainNotAskedReason =
  | 'not-running'
  | 'asleep'
  | 'busy'
  | 'too-soon'
  | 'unchanged'
  | 'not-taken'
  | 'off-list-answer'
  | 'no-answer'
  | 'ended';

export type FlintBrainAsk =
  | { readonly kind: 'answered'; readonly intent: string; readonly emote: string | null }
  | { readonly kind: 'not-asked'; readonly reason: FlintBrainNotAskedReason };

export interface FlintBrain {
  readonly start:   (startedBy: MonitorFlintBrainStartedBy) => Promise<FlintBrainVerdict>;
  readonly stop:    () => Promise<FlintBrainVerdict>;
  readonly ask:     (digest: FlintBrainDigest) => Promise<FlintBrainAsk>;
  /** `null` where this forge cannot run the brain confined. */
  readonly reading: () => MonitorFlintBrainDocument | null;
  /** The Overseer's stop: a running brain ends `stopped`. */
  readonly close:   () => Promise<void>;
}

interface PendingAsk {
  readonly digest:        FlintBrainDigest;
  readonly resolve:       (answer: FlintBrainAsk) => void;
  readonly timeoutHandle: unknown;
}

interface ActiveRun {
  readonly startedBy:     MonitorFlintBrainStartedBy;
  readonly startedAt:     string;
  readonly endsAt:        string;
  sessionRun:             number | null;
  cursor:                 number;
  turns:                  CreditedTurn[];
  recentMoves:            MonitorFlintBrainMoveDocument[];
  turnsSent:              number;
  resultsRead:            number;
  pendingAsk:             PendingAsk | null;
  lastCallAtMilliseconds: number | null;
  lastContentHash:        string | null;
  maximumHandle:          unknown;
  readHandle:             unknown;
}

type Phase =
  | { readonly kind: 'off' }
  | { readonly kind: 'refused'; readonly refusal: FlintBrainRefusal }
  | { readonly kind: 'starting' | 'running'; readonly run: ActiveRun }
  | { readonly kind: 'ended'; readonly run: ActiveRun; readonly endedAt: string; readonly endedReason: MonitorFlintBrainEndedReason };

/** How many times an ended run's child is looked at for its end before it is left to the next run's launch. */
const ACKNOWLEDGE_TRIES = 40;

const OFF_READING: MonitorFlintBrainDocument = Object.freeze({
  state:       'off',
  startedAt:   null,
  endsAt:      null,
  startedBy:   null,
  model:       null,
  effort:      null,
  tokens:      null,
  calls:       null,
  recentMoves: [],
  endedAt:     null,
  endedReason: null,
  sentence:    null,
  refusal:     null,
});

function sumsOf(run: ActiveRun): { tokens: number; calls: number } {
  const { topLevel, total } = TokenCrediting.sessionTokensOf(run.turns);
  return { tokens: total.inputTokens + total.cacheCreationInputTokens + total.cacheReadInputTokens + total.outputTokens, calls: topLevel.calls };
}

function notAsked(reason: FlintBrainNotAskedReason): FlintBrainAsk {
  return { kind: 'not-asked', reason };
}

function refusedVerdictOf(refusal: FlintBrainRefusal): FlintBrainVerdict {
  return { verdict: 'refused', refusal, sentence: FlintBrainWordingUtil.refusalSentenceOf(refusal) };
}

export function createFlintBrain(options: FlintBrainOptions): FlintBrain {
  const {
    adapter, launchFacts, sessionHost, timers, now
  } = options;
  let phase: Phase = { kind: 'off' };
  let retentionHandle: unknown = null;
  let isClosed = false;

  const nowIso = (): string => now().toISOString();
  const brainCanRun = (): boolean => FlintBrainProfile.brainCanRun(launchFacts, adapter.capabilities);

  function runReadingOf(run: ActiveRun): Omit<MonitorFlintBrainDocument, 'state' | 'endedAt' | 'endedReason' | 'sentence'> {
    const { tokens, calls } = sumsOf(run);
    return {
      startedAt:   run.startedAt,
      endsAt:      run.endsAt,
      startedBy:   run.startedBy,
      model:       FLINT_BRAIN_MODEL,
      effort:      FLINT_BRAIN_EFFORT,
      tokens,
      calls,
      recentMoves: [...run.recentMoves],
      refusal:     null,
    };
  }

  function reading(): MonitorFlintBrainDocument | null {
    if (!brainCanRun()) return null;
    switch (phase.kind) {
      case 'off':
        return OFF_READING;
      case 'refused': {
        const sentence = FlintBrainWordingUtil.refusalSentenceOf(phase.refusal);
        return {
          ...OFF_READING, state: 'refused', sentence, refusal: { code: phase.refusal.code, sentence }
        };
      }
      case 'starting':
      case 'running':
        return {
          ...runReadingOf(phase.run),
          state:       phase.kind,
          endedAt:     null,
          endedReason: null,
          sentence:    phase.kind === 'starting' ? FlintBrainWordingUtil.startingSentence() : FlintBrainWordingUtil.runningSentence(),
        };
      case 'ended':
        return {
          ...runReadingOf(phase.run),
          state:       'ended',
          endedAt:     phase.endedAt,
          endedReason: phase.endedReason,
          sentence:    FlintBrainWordingUtil.endedSentenceOf(phase.endedReason, phase.run.startedAt, phase.endedAt),
        };
    }
  }

  const announce = (): void => options.onChange(reading());

  function activeRun(): ActiveRun | null {
    return phase.kind === 'starting' || phase.kind === 'running' ? phase.run : null;
  }

  function clearRetention(): void {
    if (retentionHandle !== null) timers.clearTimeout(retentionHandle);
    retentionHandle = null;
  }

  /** A clock exception: an ended or refused brain reads `off` after a while, so a monitor shows it long enough and then no more. */
  function keepForAWhile(): void {
    clearRetention();
    retentionHandle = timers.setTimeout(() => {
      retentionHandle = null;
      phase = { kind: 'off' };
      announce();
    }, FLINT_BRAIN_ENDED_STATE_KEPT_MILLISECONDS);
  }

  function refuse(refusal: FlintBrainRefusal): FlintBrainVerdict {
    phase = { kind: 'refused', refusal };
    keepForAWhile();
    announce();
    return refusedVerdictOf(refusal);
  }

  function settleAsk(run: ActiveRun, answer: FlintBrainAsk): void {
    const pending = run.pendingAsk;
    if (pending === null) return;
    timers.clearTimeout(pending.timeoutHandle);
    run.pendingAsk = null;
    pending.resolve(answer);
  }

  function acknowledgeEnd(sessionRun: number, triesLeft: number): void {
    void sessionHost.acknowledgeEnd(sessionRun).then((acknowledged) => {
      if (!acknowledged && triesLeft > 1) timers.setTimeout(() => acknowledgeEnd(sessionRun, triesLeft - 1), FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
    });
  }

  async function end(run: ActiveRun, endedReason: MonitorFlintBrainEndedReason): Promise<void> {
    if (activeRun() !== run) return;
    timers.clearTimeout(run.maximumHandle);
    timers.clearTimeout(run.readHandle);
    settleAsk(run, notAsked('ended'));
    const endedAt = nowIso();
    phase = {
      kind: 'ended', run, endedAt, endedReason
    };
    options.onEnded({
      startedBy: run.startedBy, startedAt: run.startedAt, endedAt, endedReason, ...sumsOf(run)
    });
    keepForAWhile();
    announce();
    if (run.sessionRun === null) return;
    if (endedReason !== 'failed') await sessionHost.stop(run.sessionRun);
    acknowledgeEnd(run.sessionRun, ACKNOWLEDGE_TRIES);
  }

  function takeAnswer(run: ActiveRun, structuredReport: unknown): boolean {
    const pending = run.pendingAsk;
    if (pending === null || run.resultsRead !== run.turnsSent) return false;
    const answer = FlintBrainDigestUtil.answerOf(structuredReport, pending.digest);
    if (answer === null) {
      settleAsk(run, notAsked('off-list-answer'));
      return false;
    }
    run.recentMoves = [{ at: nowIso(), intent: answer.intent, emote: answer.emote }, ...run.recentMoves].slice(0, FLINT_BRAIN_RECENT_MOVES_LIMIT);
    settleAsk(run, { kind: 'answered', ...answer });
    return true;
  }

  /** The end an event calls for, or whether it changed the reading. */
  function takeEvent(run: ActiveRun, event: AgentSessionEvent): MonitorFlintBrainEndedReason | boolean {
    if (event.kind === 'assistant-turn') {
      run.turns.push({ messageId: event.messageId, parentToolUseId: event.parentToolUseId, usage: event.usage });
      return true;
    }
    if (event.kind === 'usage-window') return event.requestsRefused ? 'usage-limit' : false;
    if (event.kind !== 'result') return false;
    run.resultsRead += 1;
    if (event.failure?.kind === 'rate-limited') return 'usage-limit';
    if (event.isError) return 'failed';
    return takeAnswer(run, event.structuredReport);
  }

  function readSession(run: ActiveRun): void {
    if (activeRun() !== run || run.sessionRun === null) return;
    const { lines, lastSequence } = sessionHost.linesAfter(run.sessionRun, run.cursor);
    run.cursor = lastSequence;
    let readingChanged = false;
    for (const event of lines.flatMap((line) => adapter.eventsOf(line))) {
      const outcome = takeEvent(run, event);
      if (typeof outcome === 'string') {
        void end(run, outcome);
        return;
      }
      readingChanged ||= outcome;
    }
    const standing = sessionHost.standingOf(run.sessionRun);
    if (standing === 'ended') {
      if (phase.kind === 'starting') {
        timers.clearTimeout(run.maximumHandle);
        settleAsk(run, notAsked('ended'));
        refuse({ code: 'brain-failed-to-start' });
        acknowledgeEnd(run.sessionRun, ACKNOWLEDGE_TRIES);
      } else {
        void end(run, 'failed');
      }
      return;
    }
    if (options.usageLimitHolds() !== null) {
      void end(run, 'usage-limit');
      return;
    }
    if (phase.kind === 'starting' && standing === 'running') {
      phase = { kind: 'running', run };
      readingChanged = true;
    }
    if (readingChanged) announce();
    run.readHandle = timers.setTimeout(() => readSession(run), FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
  }

  async function launchedOutcomeOf(programPath: string, startedAt: string): Promise<FlintBrainLaunchOutcome> {
    try {
      return await sessionHost.launch((place) => SessionConfinement.confinedPlanOf(
        adapter,
        launchFacts.platformPorts.gateConfinement,
        FlintBrainProfile.launchRequestOf(adapter, launchFacts, place, programPath, startedAt),
      ));
    } catch (error) {
      return { verdict: 'refused', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async function start(startedBy: MonitorFlintBrainStartedBy): Promise<FlintBrainVerdict> {
    if (!brainCanRun()) return refusedVerdictOf({ code: 'no-flint' });
    if (activeRun() !== null) return refusedVerdictOf({ code: 'brain-already-running' });
    if (isClosed) return refusedVerdictOf({ code: 'brain-failed-to-start' });
    if (options.overseerIsPaused()) return refuse({ code: 'overseer-paused' });
    const resetsAt = options.usageLimitHolds();
    if (resetsAt !== null) return refuse({ code: 'usage-limit-holds', resetsAt });
    const program = adapter.programPathOf(launchFacts.platformPorts.executableResolver, [launchFacts.repositoryRoot]);
    if (program.verdict === 'refused') return refuse({ code: 'brain-failed-to-start' });
    clearRetention();
    const startedAtDate = now();
    const run: ActiveRun = {
      startedBy,
      startedAt:              startedAtDate.toISOString(),
      endsAt:                 new Date(startedAtDate.getTime() + launchFacts.maximumRunMilliseconds).toISOString(),
      sessionRun:             null,
      cursor:                 0,
      turns:                  [],
      recentMoves:            [],
      turnsSent:              0,
      resultsRead:            0,
      pendingAsk:             null,
      lastCallAtMilliseconds: null,
      lastContentHash:        null,
      maximumHandle:          null,
      readHandle:             null,
    };
    phase = { kind: 'starting', run };
    announce();
    const outcome = await launchedOutcomeOf(program.path, run.startedAt);
    if (outcome.verdict === 'refused') {
      if (activeRun() === run) return refuse({ code: 'brain-failed-to-start' });
      return refusedVerdictOf({ code: 'brain-failed-to-start' });
    }
    run.sessionRun = outcome.run;
    if (activeRun() !== run) {
      // Stopped or closed while it launched: the run already ended, so only its session is left to stop.
      await sessionHost.stop(outcome.run);
      acknowledgeEnd(outcome.run, ACKNOWLEDGE_TRIES);
      return { verdict: 'done' };
    }
    // A clock exception: the run's maximum is a time, which the design gives the brain so the rule director comes back.
    run.maximumHandle = timers.setTimeout(() => void end(run, 'time'), launchFacts.maximumRunMilliseconds);
    run.readHandle = timers.setTimeout(() => readSession(run), FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
    return { verdict: 'done' };
  }

  async function stop(): Promise<FlintBrainVerdict> {
    const run = activeRun();
    if (run === null) return refusedVerdictOf({ code: 'brain-not-running' });
    await end(run, 'stopped');
    return { verdict: 'done' };
  }

  async function ask(digest: FlintBrainDigest): Promise<FlintBrainAsk> {
    const run = activeRun();
    if (run === null || phase.kind !== 'running' || run.sessionRun === null) return notAsked('not-running');
    if (digest.isAsleep) return notAsked('asleep');
    if (run.pendingAsk !== null || run.resultsRead < run.turnsSent) return notAsked('busy');
    const askedAtMilliseconds = now().getTime();
    // A clock exception: the design bounds the brain's model calls by an interval, which only a clock can keep.
    if (run.lastCallAtMilliseconds !== null && askedAtMilliseconds - run.lastCallAtMilliseconds < FLINT_BRAIN_ASK_INTERVAL_MILLISECONDS) return notAsked('too-soon');
    const contentHash = FlintBrainDigestUtil.contentHashOf(digest);
    if (contentHash === run.lastContentHash && digest.newCues.length === 0) return notAsked('unchanged');
    const earlierCall = { lastCallAtMilliseconds: run.lastCallAtMilliseconds, lastContentHash: run.lastContentHash };
    run.turnsSent += 1;
    run.lastCallAtMilliseconds = askedAtMilliseconds;
    run.lastContentHash = contentHash;
    // Pending before the line goes out, so an answer read while the write is still under way finds its ask.
    const answered = new Promise<FlintBrainAsk>((resolve) => {
      run.pendingAsk = {
        digest,
        resolve,
        timeoutHandle: timers.setTimeout(() => settleAsk(run, notAsked('no-answer')), FLINT_BRAIN_ANSWER_TIMEOUT_MILLISECONDS),
      };
    });
    const taken = await sessionHost.write(run.sessionRun, adapter.chatLineOf(FlintBrainDigestUtil.promptOf(digest)));
    if (!taken && run.resultsRead < run.turnsSent) {
      run.turnsSent -= 1;
      Object.assign(run, earlierCall);
      settleAsk(run, notAsked('not-taken'));
    }
    return await answered;
  }

  async function close(): Promise<void> {
    isClosed = true;
    clearRetention();
    const run = activeRun();
    if (run !== null) await end(run, 'stopped');
    clearRetention();
  }

  return Object.freeze<FlintBrain>({
    start, stop, ask, reading, close
  });
}
