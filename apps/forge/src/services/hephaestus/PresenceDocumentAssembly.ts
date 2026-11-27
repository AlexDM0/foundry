/**
 * Forge's typed mapping of its presence into the contract's documents of `GET /api/presence` and `GET /api/crash-log`: from the presence
 * record, the heartbeat, the live Talos's record, the board and the crash logs, each read by the caller. Pure: it reads no file.
 */
import type { ForgeCrashLogDocument, ForgeCrashLogJob } from 'forge-contracts/ForgeCrashLogDocument';
import type {
  ForgeCrashedComponent,
  ForgeCrashLogEntry,
  ForgeInterruptedWork,
  ForgePresenceDocument,
  ForgeRunningTalos
} from 'forge-contracts/ForgePresenceDocument';

import { MONITOR_INTERRUPTION_CAUSE_OF_CAUSE } from '../../adapters/constants/MonitorInterruptionCauseOfCause.ts';
import type { CrashLogJob, CrashLogRecord }    from '../../adapters/crash-log/@types/CrashLogRecord.ts';
import type { HeartbeatRecord }                from '../../adapters/heartbeat/@types/HeartbeatRecord.ts';
import type { PresenceRecord }                 from '../../adapters/presence/@types/PresenceRecord.ts';
import type { StartClassificationVerdict }     from '../../adapters/presence/@types/StartClassificationVerdict.ts';
import type { TalosRecord }                    from '../../domain/talos/TalosRecord.ts';
import type { InterruptionCause, Job }         from '../../domain/tracker-model/@types/Job.ts';
import type { LifecycleThresholds }            from '../../domain/tracker-model/@types/LifecycleLimits.ts';
import type { LogRecord }                      from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Board }                          from '../../domain/tracker-model/Board.ts';
import { Playbook }                            from '../../domain/tracker-model/Playbook.ts';
import { INTERRUPTED_HOLD_PREFIX }             from '../../domain/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { CRASH_INTERRUPTION_CAUSES }           from '../../domain/tracker-model/constants/JobStates.ts';
import { PresenceStatus }                      from './PresenceStatus.ts';

/** A crash log as `CrashLog.list` and `CrashLog.read` found it. */
export interface NumberedCrashLog {
  crashLogNumber: number;
  record:         CrashLogRecord;
}

/** The serving generation's presence record, once its start gate handed its classification in. */
export type ClassifiedPresenceRecord = PresenceRecord & { startClassification: StartClassificationVerdict };

export interface PresenceDocumentInputs {
  presence:        ClassifiedPresenceRecord;
  heartbeat:       HeartbeatRecord | null;
  /** The newest record of a Talos that runs and has not quit; `null` without one. */
  liveTalosRecord: TalosRecord | null;
  board:           Pick<Board, 'jobs' | 'tickets' | 'decisions' | 'incidents' | 'logRecordsSoFar'>;
  limits:          LifecycleThresholds;
  /** Oldest first, by number; a log that could not be read is left out. */
  crashLogs:       readonly NumberedCrashLog[];
}

/** The contract names the forge's own process `hephaestus`. */
const CONTRACT_COMPONENT_OF_COMPONENT: Readonly<Record<CrashLogRecord['component'], ForgeCrashedComponent>> = Object.freeze({
  hephaestus: 'hephaestus',
  talos:      'talos',
  unknown:    'unknown',
});

function isCountedCause(cause: InterruptionCause): boolean {
  return (CRASH_INTERRUPTION_CAUSES as readonly InterruptionCause[]).includes(cause);
}

/** The cause of the job's newest lost line; `null` when none of its lines was found lost. */
function lostLineCauseOf(job: Readonly<Job>, logRecords: readonly LogRecord[]): InterruptionCause | null {
  let cause: InterruptionCause | null = null;
  for (const record of logRecords) {
    if (record.kind === 'job-line-lost' && record.jobId === job.id) ({ cause } = record.fields);
  }
  return cause;
}

function interruptedWorkOf(job: Readonly<Job>, cause: InterruptionCause, inputs: PresenceDocumentInputs, logRecords: readonly LogRecord[]): ForgeInterruptedWork {
  const { board, limits } = inputs;
  const facts = { decisions: board.decisions(), incidents: board.incidents(), logRecords };
  return {
    jobId:                 job.id,
    kind:                  job.kind,
    ticketIds:             [...job.ticketIds],
    cause:                 MONITOR_INTERRUPTION_CAUSE_OF_CAUSE[cause],
    waitsFor:              Playbook.resumeWaitOf(job, facts, limits),
    crashResumes:          job.crashResumes,
    automaticRestartsLeft: isCountedCause(cause) ? Math.max(0, limits.CRASH_RESUMES_BEFORE_WAITING - job.crashResumes) : null,
  };
}

/** Every interrupted job, and every job whose lost line waits for User's resume, in the board's order. */
function interruptedWorkListOf(inputs: PresenceDocumentInputs): ForgeInterruptedWork[] {
  const logRecords = inputs.board.logRecordsSoFar();
  return inputs.board.jobs().flatMap((job) => {
    if (job.state === 'interrupted') return [interruptedWorkOf(job, Playbook.interruptionCauseOf(job), inputs, logRecords)];
    const lostLineCause = Playbook.lostLineAwaitsResume(job, logRecords) ? lostLineCauseOf(job, logRecords) : null;
    return lostLineCause === null ? [] : [interruptedWorkOf(job, lostLineCause, inputs, logRecords)];
  });
}

function heldMergesOf(board: PresenceDocumentInputs['board']): ForgePresenceDocument['heldMerges'] {
  return board.tickets().flatMap((ticket) => {
    const { hold } = ticket.frontmatter;
    return hold?.startsWith(INTERRUPTED_HOLD_PREFIX) === true ? [{ ticketId: ticket.frontmatter.id, hold }] : [];
  });
}

function crashLogEntryOf({ crashLogNumber, record }: NumberedCrashLog): ForgeCrashLogEntry {
  return {
    number:     crashLogNumber,
    generation: record.crashedGeneration,
    component:  CONTRACT_COMPONENT_OF_COMPONENT[record.component],
    recordedAt: record.recordedAt,
    suspected:  record.suspected,
  };
}

function runningTalosOf(liveTalosRecord: TalosRecord | null): ForgeRunningTalos | null {
  if (liveTalosRecord === null) return null;
  return { protocolVersion: liveTalosRecord.protocolVersion, codeVersion: liveTalosRecord.codeVersion, startNumber: liveTalosRecord.startNumber };
}

function presenceDocumentOf(inputs: PresenceDocumentInputs): ForgePresenceDocument {
  const { presence, heartbeat, crashLogs } = inputs;
  const lastStart = presence.startClassification;
  const { inARow, last } = presence.abandonedPasses;
  return {
    generation:  presence.generation,
    processId:   presence.process.processId,
    codeVersion: presence.codeVersion,
    startedAt:   presence.startedAt,
    startOrigin: presence.startOrigin,
    lastStart:   {
      kind:               lastStart.kind,
      previousGeneration: lastStart.previousGeneration,
      crashSuspected:     lastStart.crashSuspected,
      crashLogNumber:     PresenceStatus.crashLogNumberOfTheLastStart(lastStart, crashLogs.map((crashLog) => crashLog.crashLogNumber)),
    },
    heartbeat:       heartbeat?.generation === presence.generation ? { sequence: heartbeat.sequence, at: heartbeat.at } : null,
    supervision:     PresenceStatus.supervisionOfTalosRecord(inputs.liveTalosRecord),
    abandonedPasses: { inARow, lastReason: last?.reason ?? null, lastAt: last?.at ?? null },
    interruptedWork: interruptedWorkListOf(inputs),
    heldMerges:      heldMergesOf(inputs.board),
    crashLogs:       crashLogs.map(crashLogEntryOf),
    talos:           runningTalosOf(inputs.liveTalosRecord),
  };
}

function crashLogJobOf(job: CrashLogJob): ForgeCrashLogJob {
  return {
    jobId:        job.jobId,
    kind:         job.kind,
    ticketIds:    [...job.ticketIds],
    state:        job.state,
    interruption: job.interruption,
    airlockPhase: job.airlockPhase,
  };
}

function crashLogDocumentOf(crashLogNumber: number, record: CrashLogRecord): ForgeCrashLogDocument {
  const { error } = record;
  return {
    number:     crashLogNumber,
    generation: record.crashedGeneration,
    component:  CONTRACT_COMPONENT_OF_COMPONENT[record.component],
    suspected:  record.suspected,
    recordedAt: record.recordedAt,
    startKind:  record.classification?.kind ?? null,
    error:      error === null ? null : {
      origin: error.origin, name: error.name, message: error.message, stack: error.stack
    },
    activeJobs: record.activeJobs?.map(crashLogJobOf) ?? null,
    logTail:    record.logTail === null ? null : [...record.logTail],
  };
}

export const PresenceDocumentAssembly = Object.freeze({ presenceDocumentOf, crashLogDocumentOf });
