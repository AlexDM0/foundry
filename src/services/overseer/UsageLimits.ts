/**
 * Usage limits, design section 7.5: a top-level refusal in a job's stream interrupts the job (cause `usage-limit`, resumed by id after the
 * reset) and is written to the machine-wide marker, which every Overseer reads back as the `usageResetsAt` its Playbook holds by. Every
 * window a stream reports is written to the machine-wide usage windows, which every Overseer reads back as its `usage.windows`.
 */
import { type UsageMarkerReading, UsageMarkerFile }                                from '../../adapters/usage-marker/UsageMarkerFile.ts';
import { type UsageWindowObservation, type UsageWindowsReading, UsageWindowsFile } from '../../adapters/usage-marker/UsageWindowsFile.ts';
import type { AgentSessionEvent }                                                  from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { Board }                                                              from '../../lib/tracker-model/Board.ts';
import { API_RATE_LIMIT_BACKOFF_SECONDS }                                          from '../../shared/constants/OverseerLimits.ts';
import type { UsageFacts }                                                         from './BoardState.ts';
import { MILLISECONDS_PER_SECOND }                                                 from './constants/TimeUnits.ts';

export interface UsageLimitHit {
  jobId:    string;
  window:   string;
  resetsAt: string;
}

/** The window a 429 under API billing is marked with: the API names neither a window nor a reset. */
const API_RATE_LIMIT_WINDOW = 'api-rate-limit';

/** A clock exception (design section 7.6): the backoff is a time, since the API names no reset for the pass that resumes the job. */
function apiRateLimitResetsAtOf(at: string): string {
  return new Date(Date.parse(at) + (API_RATE_LIMIT_BACKOFF_SECONDS * MILLISECONDS_PER_SECOND)).toISOString();
}

/**
 * Only a top-level refusal stops requests; a per-window warning, or a window rejected under allowed overage, is shown and writes nothing.
 * Under API billing a 429 result is the limit too. A reset not after `at` holds nothing, so it fails closed to the backoff.
 */
function refusalOf(event: AgentSessionEvent, at: string, apiBilling = false): { window: string; resetsAt: string } | null {
  if (event.kind === 'result' && event.failure?.kind === 'rate-limited' && apiBilling) {
    return { window: API_RATE_LIMIT_WINDOW, resetsAt: apiRateLimitResetsAtOf(at) };
  }
  if (event.kind !== 'usage-window' || !event.requestsRefused) return null;
  const reset = event.resetsAt;
  const resetIsAhead = reset !== null && Date.parse(reset) > Date.parse(at);
  return { window: event.window, resetsAt: resetIsAhead ? reset : apiRateLimitResetsAtOf(at) };
}

/** The Overseer's own stop: never a crash, so never counted toward `JOB_RESUMES_BEFORE_FRESH` and never a failed pass. */
function interruptLimitedJob(board: Board, hit: UsageLimitHit, at: string): void {
  board.interruptJob(hit.jobId, 'usage-limit', at);
  board.recordUsageLimitHit(hit.jobId, { window: hit.window, resetsAt: hit.resetsAt }, at);
}

function latestResetOf(hits: readonly UsageLimitHit[]): UsageLimitHit | null {
  return hits.reduce<UsageLimitHit | null>((latest, hit) => (latest === null || Date.parse(hit.resetsAt) > Date.parse(latest.resetsAt) ? hit : latest), null);
}

/** The marker's reset and this pass's own hits alike, so a limit met in this hold already holds the launches it decides. */
function usageResetsAtOf(reading: UsageMarkerReading, hits: readonly UsageLimitHit[]): string | null {
  const markedReset = reading.verdict === 'read' ? [reading.marker.resetsAt] : [];
  const resets = [...markedReset, ...hits.map((hit) => hit.resetsAt)];
  return resets.reduce<string | null>((latest, reset) => (latest === null || Date.parse(reset) > Date.parse(latest) ? reset : latest), null);
}

/** Written only when it moves the reset later, so an Overseer never shortens a limit another board met. */
function markHits(monitorFolder: string, vendor: string, trackerId: string, hits: readonly UsageLimitHit[]): void {
  const latest = latestResetOf(hits);
  if (latest === null) return;
  const reading = UsageMarkerFile.read(monitorFolder);
  if (reading.verdict === 'read' && Date.parse(reading.marker.resetsAt) >= Date.parse(latest.resetsAt)) return;
  UsageMarkerFile.write(monitorFolder, {
    vendor, window: latest.window, resetsAt: latest.resetsAt, seenBy: { trackerId, jobId: latest.jobId }
  });
}

/** A longer timer delay overflows and fires at once; a pass woken early schedules the rest. */
const LONGEST_TIMER_DELAY_MILLISECONDS = 2_147_483_647;

/** Schedule only: how long until the reset, or `null` once it passed, for the DrivePass the Overseer wakes at it. */
function millisecondsUntilReset(usageResetsAt: string | null, now: Date): number | null {
  if (usageResetsAt === null) return null;
  const remaining = Date.parse(usageResetsAt) - now.getTime();
  return remaining > 0 ? Math.min(remaining, LONGEST_TIMER_DELAY_MILLISECONDS) : null;
}

/** Every reported window with a reset is an observation, refused or not; under API billing (`apiBilling`) the stream reports none that counts. */
function windowObservationOf(event: AgentSessionEvent, apiBilling: boolean): UsageWindowObservation | null {
  if (apiBilling || event.kind !== 'usage-window' || event.resetsAt === null) return null;
  return { window: event.window, utilization: event.utilization, resetsAt: event.resetsAt };
}

function recordWindowObservations(monitorFolder: string, observations: readonly UsageWindowObservation[]): void {
  UsageWindowsFile.record(monitorFolder, observations);
}

const PERCENT_OF_THE_WHOLE = 100;

/** Only windows seen are shown, as a whole percent; none before the first observation, from a malformed file, or under API billing. */
function usageFactsOf(marker: UsageMarkerReading, windows: UsageWindowsReading, apiBilling: boolean): UsageFacts {
  const limit = marker.verdict === 'read' ? { resetsAt: marker.marker.resetsAt, window: marker.marker.window } : { resetsAt: null, window: null };
  const observed = windows.verdict === 'read' && !apiBilling ? windows.windows : [];
  return {
    ...limit,
    windows: observed.map(({ window, utilization, resetsAt }) => ({ window, utilization: Math.round(utilization * PERCENT_OF_THE_WHOLE), resetsAt })),
  };
}

export const UsageLimits = Object.freeze({
  refusalOf,
  interruptLimitedJob,
  usageResetsAtOf,
  markHits,
  millisecondsUntilReset,
  windowObservationOf,
  recordWindowObservations,
  usageFactsOf,
});
