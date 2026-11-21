/**
 * A forge's presence (`GET /api/v1/presence`) as Gaia reads it: whether Talos still supervises its agents, its interrupted work with what
 * each job waits for, its crash logs, and the Talos that runs; the board reads only the waits. Every other key is passed over here; a
 * document that does not ingest reads as no report and names its keys.
 */
import type {
  ForgeCrashLogEntry,
  ForgeInterruptedWork,
  ForgePresenceDocument,
  ForgeRunningTalos,
  ForgeSupervision
} from 'forge-contracts/ForgePresenceDocument';

import { DocumentShapeUtil, type ShapeOf } from '../../lib/json-value/DocumentShapeUtil.ts';
import type * as Gaia                      from '../../shared/@types/ForgePresence.ts';
import type { DocumentReadingFailure }     from './@types/ForgeDocumentReading.ts';
import { VocabularyMapUtil }               from './utils/VocabularyMapUtil.ts';

export type PresenceReportReading = { readonly report: Gaia.ForgePresenceReport } | { readonly report: null; readonly reason: DocumentReadingFailure };

const SUPERVISION = {
  'supervising':          'supervising',
  'stopped':              'stopped',
  'checking-after-a-gap': 'checking-after-a-gap',
  'not-yet-renewed':      'not-yet-renewed',
  'no-talos':             'no-talos',
} as const satisfies Record<ForgeSupervision, Gaia.ForgeSupervision>;

const CRASHED_COMPONENT = {
  hephaestus: 'hephaestus',
  talos:      'talos',
  unknown:    'unknown',
} as const satisfies Record<ForgeCrashLogEntry['component'], Gaia.ForgeCrashedComponent>;

const INTERRUPTED_WORK_SHAPE = {
  jobId:                 'text',
  kind:                  'text',
  ticketIds:             'text-list',
  cause:                 { oneOf: VocabularyMapUtil.forgeValuesOf(VocabularyMapUtil.vocabularies.interruptionCause) },
  waitsFor:              { oneOf: VocabularyMapUtil.forgeValuesOf(VocabularyMapUtil.vocabularies.resumeWait) },
  crashResumes:          'passed-over',
  automaticRestartsLeft: 'passed-over',
} as const satisfies ShapeOf<ForgeInterruptedWork>;

const CRASH_LOG_ENTRY_SHAPE = {
  number:     'whole-number',
  generation: { nullable: 'whole-number' },
  component:  { oneOf: Object.keys(CRASHED_COMPONENT) },
  recordedAt: 'text',
  suspected:  'boolean',
} as const satisfies ShapeOf<ForgeCrashLogEntry>;

const RUNNING_TALOS_SHAPE = {
  protocolVersion: 'whole-number',
  codeVersion:     'text',
  startNumber:     'passed-over',
} as const satisfies ShapeOf<ForgeRunningTalos>;

const PRESENCE_SHAPE = {
  generation:      'passed-over',
  processId:       'passed-over',
  codeVersion:     'passed-over',
  startedAt:       'passed-over',
  startOrigin:     'passed-over',
  lastStart:       'passed-over',
  heartbeat:       'passed-over',
  supervision:     { oneOf: Object.keys(SUPERVISION) },
  abandonedPasses: 'passed-over',
  interruptedWork: { listOf: INTERRUPTED_WORK_SHAPE },
  heldMerges:      'passed-over',
  crashLogs:       { listOf: CRASH_LOG_ENTRY_SHAPE },
  talos:           { nullable: { object: RUNNING_TALOS_SHAPE } },
} as const satisfies ShapeOf<ForgePresenceDocument>;

function waitingJobOf(work: ForgeInterruptedWork): Gaia.ForgeWaitingJob {
  return {
    jobId:     work.jobId,
    kind:      work.kind,
    ticketIds: [...work.ticketIds],
    cause:     VocabularyMapUtil.gaiaValueOf(VocabularyMapUtil.vocabularies.interruptionCause, work.cause),
    waitsFor:  VocabularyMapUtil.gaiaValueOf(VocabularyMapUtil.vocabularies.resumeWait, work.waitsFor),
  };
}

function crashLogEntryOf(entry: ForgeCrashLogEntry): Gaia.ForgeCrashLogEntry {
  return {
    number:     entry.number,
    generation: entry.generation,
    component:  CRASHED_COMPONENT[entry.component],
    suspected:  entry.suspected,
    recordedAt: entry.recordedAt,
  };
}

export class PresenceIngestion {
  public presenceReportOf(body: unknown): PresenceReportReading {
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, PRESENCE_SHAPE);
    if (invalidKeys.length > 0) return { report: null, reason: { invalidKeys } };
    const {
      supervision, interruptedWork, crashLogs, talos
    } = body as ForgePresenceDocument;
    return {
      report: {
        supervision:     SUPERVISION[supervision],
        interruptedWork: interruptedWork.map(waitingJobOf),
        crashLogs:       crashLogs.map(crashLogEntryOf),
        talos:           talos === null ? null : { protocolVersion: talos.protocolVersion, codeVersion: talos.codeVersion },
      },
    };
  }
}
