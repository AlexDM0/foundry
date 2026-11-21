/**
 * The part of a forge's presence (`GET /api/v1/presence`) the board reads: what each job of its interrupted work waits for. Every other key
 * is passed over here; a document that does not ingest reads as no waiting work and names its keys.
 */
import type { ForgeInterruptedWork, ForgePresenceDocument } from 'forge-contracts/ForgePresenceDocument';

import { DocumentShapeUtil, type ShapeOf } from '../../lib/json-value/DocumentShapeUtil.ts';
import type { DocumentReadingFailure }     from './@types/ForgeDocumentReading.ts';
import type { ResumeWaitsOfJobs }          from './@types/ResumeWaitsOfJobs.ts';
import { VocabularyMapUtil }               from './utils/VocabularyMapUtil.ts';

export type ResumeWaitsReading = { readonly resumeWaits: ResumeWaitsOfJobs } | { readonly resumeWaits: null; readonly reason: DocumentReadingFailure };

const INTERRUPTED_WORK_SHAPE = {
  jobId:                 'text',
  kind:                  'passed-over',
  ticketIds:             'passed-over',
  cause:                 'passed-over',
  waitsFor:              { oneOf: VocabularyMapUtil.forgeValuesOf(VocabularyMapUtil.vocabularies.resumeWait) },
  crashResumes:          'passed-over',
  automaticRestartsLeft: 'passed-over',
} as const satisfies ShapeOf<ForgeInterruptedWork>;

const PRESENCE_SHAPE = {
  generation:      'passed-over',
  processId:       'passed-over',
  codeVersion:     'passed-over',
  startedAt:       'passed-over',
  startOrigin:     'passed-over',
  lastStart:       'passed-over',
  heartbeat:       'passed-over',
  supervision:     'passed-over',
  abandonedPasses: 'passed-over',
  interruptedWork: { listOf: INTERRUPTED_WORK_SHAPE },
  heldMerges:      'passed-over',
  crashLogs:       'passed-over',
} as const satisfies ShapeOf<ForgePresenceDocument>;

export class PresenceIngestion {
  public resumeWaitsOf(body: unknown): ResumeWaitsReading {
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, PRESENCE_SHAPE);
    if (invalidKeys.length > 0) return { resumeWaits: null, reason: { invalidKeys } };
    const { interruptedWork } = body as ForgePresenceDocument;
    return { resumeWaits: new Map(interruptedWork.map((work) => [work.jobId, VocabularyMapUtil.gaiaValueOf(VocabularyMapUtil.vocabularies.resumeWait, work.waitsFor)])) };
  }
}
