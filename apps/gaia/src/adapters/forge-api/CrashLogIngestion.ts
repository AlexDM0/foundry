/**
 * One of a forge's crash logs (`GET /api/v1/crash-log?number=<n>`) as Gaia reads it: its error, the jobs that were active and the tail of
 * the forge's log, each `null` where the forge could not read it. A document that does not ingest reads as no log and names its keys.
 */
import type { ForgeCrashLogDocument, ForgeCrashLogJob } from 'forge-contracts/ForgeCrashLogDocument';

import { DocumentShapeUtil, type ShapeOf } from '../../lib/json-value/DocumentShapeUtil.ts';
import type * as Gaia                      from '../../shared/@types/ForgePresence.ts';
import type { DocumentReadingFailure }     from './@types/ForgeDocumentReading.ts';

export type CrashLogReading = { readonly crashLog: Gaia.ForgeCrashLog } | { readonly crashLog: null; readonly reason: DocumentReadingFailure };

const CRASHED_COMPONENTS = ['hephaestus', 'talos', 'unknown'] as const satisfies readonly ForgeCrashLogDocument['component'][];

const ACTIVE_JOB_SHAPE = {
  jobId:        'text',
  kind:         'text',
  ticketIds:    'text-list',
  state:        'text',
  interruption: { nullable: 'text' },
  airlockPhase: { nullable: 'text' },
} as const satisfies ShapeOf<ForgeCrashLogJob>;

const ERROR_SHAPE = {
  origin:  'text',
  name:    'text',
  message: 'text',
  stack:   { nullable: 'text' },
} as const satisfies ShapeOf<NonNullable<ForgeCrashLogDocument['error']>>;

const CRASH_LOG_SHAPE = {
  number:     'whole-number',
  generation: { nullable: 'whole-number' },
  component:  { oneOf: CRASHED_COMPONENTS },
  suspected:  'boolean',
  recordedAt: 'text',
  startKind:  'passed-over',
  error:      { nullable: { object: ERROR_SHAPE } },
  activeJobs: { nullable: { listOf: ACTIVE_JOB_SHAPE } },
  logTail:    { nullable: 'text-list' },
} as const satisfies ShapeOf<ForgeCrashLogDocument>;

function activeJobOf(job: ForgeCrashLogJob): Gaia.ForgeCrashLogJob {
  return {
    jobId:        job.jobId,
    kind:         job.kind,
    ticketIds:    [...job.ticketIds],
    state:        job.state,
    interruption: job.interruption,
    airlockPhase: job.airlockPhase,
  };
}

export class CrashLogIngestion {
  public crashLogOf(body: unknown): CrashLogReading {
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, CRASH_LOG_SHAPE);
    if (invalidKeys.length > 0) return { crashLog: null, reason: { invalidKeys } };
    const document = body as ForgeCrashLogDocument;
    const { error, activeJobs, logTail } = document;
    return {
      crashLog: {
        number:     document.number,
        generation: document.generation,
        component:  document.component,
        suspected:  document.suspected,
        recordedAt: document.recordedAt,
        error:      error === null ? null : {
          origin: error.origin, name: error.name, message: error.message, stack: error.stack,
        },
        activeJobs: activeJobs === null ? null : activeJobs.map(activeJobOf),
        logTail:    logTail === null ? null : [...logTail],
      },
    };
  }
}
