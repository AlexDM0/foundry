/**
 * The gate profile runs' moves: User's press queues one gate in one phase, Hephaestus marks it running and records how it ended, and
 * User's Stop ends a queued run at once or asks Hephaestus to end a running one. A second press while the gate and phase have a run
 * queued or running refuses. Only the newest run of a gate and phase is kept; on a forge over entities, of an entity's gate and phase.
 */
import type { GateProfileChanged }     from './@types/BoardChanges.ts';
import type {
  GateProfileRequest,
  GateProfileRun,
  GateProfileRunEnd,
  GateProfiles as StoredGateProfiles
} from './@types/GateProfile.ts';
import type { BoardRecords }           from './BoardRecords.ts';
import { BoardRefusal }                from './BoardRefusal.ts';
import {
  FIRST_GATE_PROFILE_RUN_NUMBER,
  GATE_PROFILE_RUN_ID_PREFIX,
  GATE_PROFILES_FORMAT_VERSION,
  UNFINISHED_GATE_PROFILE_RUN_STATES
} from './constants/GateProfileVocabulary.ts';
import { TicketBodyHashUtil } from './utils/TicketBodyHashUtil.ts';

function runIsUnfinished(run: Readonly<GateProfileRun>): boolean {
  const unfinishedStates: readonly string[] = UNFINISHED_GATE_PROFILE_RUN_STATES;
  return unfinishedStates.includes(run.state);
}

function gateHashOf(gate: GateProfileRequest['gate']): string {
  return TicketBodyHashUtil.bodyHashOf(JSON.stringify({ run: gate.run, in: gate.in ?? null, network: gate.network ?? [] }));
}

export class GateProfiles {
  constructor(private readonly records: BoardRecords) {}

  /**
   * Refuses `gate-profile-running` while the gate and phase, of the same entity, have a run queued or running; an ended run of them makes
   * way for the new one.
   */
  queueGateProfile(request: GateProfileRequest, at: string): GateProfileChanged {
    const profiles = this.writableProfiles();
    const sameGateAndPhase = (run: Readonly<GateProfileRun>): boolean => run.entity === request.entity
      && run.gate.name === request.gate.name && run.phase === request.phase;
    const unfinished = profiles.runs.find((run) => sameGateAndPhase(run) && runIsUnfinished(run));
    if (unfinished !== undefined) {
      throw new BoardRefusal({
        reason: 'gate-profile-running', gateName: request.gate.name, phase: request.phase, profileRunId: unfinished.profileRunId
      });
    }
    const run: GateProfileRun = {
      profileRunId:        `${GATE_PROFILE_RUN_ID_PREFIX}${profiles.nextRunNumber}`,
      setupId:             request.setupId,
      ...(request.entity === undefined ? {} : { entity: request.entity }),
      phase:               request.phase,
      gate:                structuredClone(request.gate),
      gateHash:            gateHashOf(request.gate),
      prepare:             request.prepare.map((step) => ({ name: step.name, run: step.run, ...(step.in === undefined ? {} : { in: step.in }) })),
      state:               'queued',
      stopRequested:       false,
      elapsedMilliseconds: null,
    };
    profiles.nextRunNumber += 1;
    profiles.runs = [...profiles.runs.filter((earlier) => !sameGateAndPhase(earlier)), run];
    this.records.gateProfilesChanged = true;
    const fields = { gateName: run.gate.name, phase: run.phase, setupId: run.setupId };
    return { logged: [this.records.logger.log({ kind: 'gate-profile-requested', profileRunId: run.profileRunId, fields }, at)], run };
  }

  /** Hephaestus took a gate run slot for a queued run; a run stopped or gone since is left as it is, and reports no change. */
  markGateProfileRunning(profileRunId: string): GateProfileChanged & { changed?: false } {
    const run = this.requireRun(profileRunId);
    if (run.state !== 'queued') return { logged: [], run, changed: false };
    run.state = 'running';
    this.records.gateProfilesChanged = true;
    return { logged: [], run };
  }

  /** A run User asked to stop ends `stopped`, with no duration and no cache report, however its process ended. */
  endGateProfile(profileRunId: string, { ending, elapsedMilliseconds, cacheReport }: GateProfileRunEnd, at: string): GateProfileChanged & { changed?: false } {
    const run = this.requireRun(profileRunId);
    if (run.state !== 'running') return { logged: [], run, changed: false };
    if (run.stopRequested) return this.stopped(run, at);
    run.state               = ending;
    run.elapsedMilliseconds = elapsedMilliseconds;
    if (cacheReport !== null) run.cacheReport = cacheReport;
    this.records.gateProfilesChanged = true;
    const fields = {
      gateName: run.gate.name, phase: run.phase, state: ending, elapsedMilliseconds
    };
    return { logged: [this.records.logger.log({ kind: 'gate-profiled', profileRunId, fields }, at)], run };
  }

  /** User's Stop: a queued run is stopped now; a running one is marked for Hephaestus to end its process tree; an ended one is left. */
  stopGateProfile(profileRunId: string, at: string): GateProfileChanged & { changed?: false } {
    const run = this.requireRun(profileRunId);
    if (run.state === 'queued') return this.stopped(run, at);
    if (run.state !== 'running' || run.stopRequested) return { logged: [], run, changed: false };
    run.stopRequested = true;
    this.records.gateProfilesChanged = true;
    return { logged: [], run };
  }

  /** Hephaestus's start: a run left `running` by an earlier Hephaestus has no process any more, so it reads `stopped` and never runs again. */
  stopRunsLeftRunning(at: string): GateProfileChanged[] {
    const reading = this.records.gateProfilesReading;
    if (reading.verdict !== 'readable') return [];
    return reading.profiles.runs.filter((run) => run.state === 'running').map((run) => this.stopped(run, at));
  }

  runs(): readonly Readonly<GateProfileRun>[] {
    const reading = this.records.gateProfilesReading;
    return reading.verdict === 'readable' ? reading.profiles.runs : [];
  }

  private stopped(run: GateProfileRun, at: string): GateProfileChanged {
    run.state               = 'stopped';
    run.stopRequested       = false;
    run.elapsedMilliseconds = null;
    this.records.gateProfilesChanged = true;
    const fields = { gateName: run.gate.name, phase: run.phase };
    return { logged: [this.records.logger.log({ kind: 'gate-profile-stopped', profileRunId: run.profileRunId, fields }, at)], run };
  }

  private requireRun(profileRunId: string): GateProfileRun {
    const reading = this.records.gateProfilesReading;
    if (reading.verdict === 'malformed') throw new BoardRefusal({ reason: 'gate-profiles-unreadable', problem: reading.reason });
    const run = reading.verdict === 'readable' ? reading.profiles.runs.find((candidate) => candidate.profileRunId === profileRunId) : undefined;
    if (run === undefined) throw new BoardRefusal({ reason: 'unknown-profile-run', profileRunId });
    return run;
  }

  /** A malformed file is never written over; an absent one starts empty. */
  private writableProfiles(): StoredGateProfiles {
    const reading = this.records.gateProfilesReading;
    if (reading.verdict === 'malformed') throw new BoardRefusal({ reason: 'gate-profiles-unreadable', problem: reading.reason });
    if (reading.verdict === 'readable') return reading.profiles;
    const profiles: StoredGateProfiles = {
      formatVersion: GATE_PROFILES_FORMAT_VERSION, nextRunNumber: FIRST_GATE_PROFILE_RUN_NUMBER, runs: [], extra: []
    };
    this.records.gateProfilesReading = { verdict: 'readable', profiles };
    return profiles;
  }
}
