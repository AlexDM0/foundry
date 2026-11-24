/** A validated log.jsonl line rebuilt as the model's record: only its kind's known keys, in the order the logger writes them. */
import type { GateRunCacheReports, PictureReference } from '../../../lib/tracker-model/@types/Job.ts';
import type { LogRecord, LogRecordKind }              from '../../../lib/tracker-model/@types/LogRecord.ts';
import type { AgentPair }                             from '../../../lib/tracker-model/@types/Ticket.ts';
import type { ViewRange }                             from '../../../lib/tracker-model/@types/TrackerProgress.ts';
import type { LogFieldShape }                         from '../../../lib/tracker-model/constants/LogRecordSchema.ts';
import { LOG_RECORD_SCHEMA, LOG_RECORD_SUBJECT_IDS }  from '../../../lib/tracker-model/constants/LogRecordSchema.ts';
import type { LogFileReading, StoredLogReading }      from '../@types/StoredLog.ts';
import { ReviewRecordFieldsUtil }                     from './ReviewRecordFieldsUtil.ts';

type UnknownObject = Record<string, unknown>;

function viewRangeOf(view: ViewRange): ViewRange {
  if (view.kind === 'auto') return { kind: view.kind };
  return {
    kind:        view.kind,
    from:        view.from,
    to:          view.to,
    tickMinutes: view.tickMinutes,
  };
}

function agentPairOf(agentPair: AgentPair): AgentPair {
  return { model: agentPair.model, effort: agentPair.effort };
}

function picturesCopyOf(value: unknown): PictureReference[] {
  return (value as readonly PictureReference[]).map((picture) => ({ pictureId: picture.pictureId, name: picture.name }));
}

function gateCacheReportsCopyOf(value: unknown): GateRunCacheReports {
  const reports = value as GateRunCacheReports;
  return { phase: reports.phase, gates: reports.gates.map((gate) => ({ gateName: gate.gateName, cacheReport: gate.cacheReport })) };
}

function listCopyOf(value: unknown): unknown {
  return [...(value as readonly string[])];
}

function sameValue(value: unknown): unknown {
  return value;
}

/** Install version 28 renamed the job kind and role `onboarder`; the append-only log keeps the older name, so a read gives the current one. */
const RETIRED_PIPELINE_AGENT_NAME = 'onboarder';

/** A stored job kind or role as the current vocabulary names it; only the retired pipeline agent name changes. */
function currentJobNameOf(value: unknown): unknown {
  return value === RETIRED_PIPELINE_AGENT_NAME ? 'pipeline-agent' : value;
}

/** Every value is one `logRecordProblemOf` passed for its shape. */
const COPY_FOR_FIELD_SHAPE: Readonly<Record<LogFieldShape, (value: unknown) => unknown>> = {
  'text':                     sameValue,
  'task-id':                  sameValue,
  'optional-text':            sameValue,
  'priority':                 sameValue,
  'ticket-size':              sameValue,
  'optional-size':            sameValue,
  'agent-pair':               (value) => agentPairOf(value as AgentPair),
  'ticket-ids':               listCopyOf,
  'epic-keys':                listCopyOf,
  'network-domains':          listCopyOf,
  'review-round':             sameValue,
  'chart-range':              (value) => viewRangeOf(value as ViewRange),
  'concurrency-limit':        sameValue,
  'hephaestus-state':         sameValue,
  'dispatcher-state':         sameValue,
  'dispatcher-run-id':        sameValue,
  'check-command':            sameValue,
  'count':                    sameValue,
  'optional-count':           sameValue,
  'review-bar-round':         sameValue,
  'review-verdict':           sameValue,
  'review-claims':            ReviewRecordFieldsUtil.claimsCopyOf,
  'review-findings':          ReviewRecordFieldsUtil.findingsCopyOf,
  'nullable-text':            sameValue,
  'job-kind':                 currentJobNameOf,
  'job-role':                 currentJobNameOf,
  'job-outcome':              sameValue,
  'interruption-cause':       sameValue,
  'child-instance':           sameValue,
  'permission-names':         listCopyOf,
  'hephaestus-stop-reason':   sameValue,
  'start-kind':               sameValue,
  'start-origin':             sameValue,
  'job-stop-mode':            sameValue,
  'decision-kind':            sameValue,
  'decision-answer':          (value) => ({ ...(value as Readonly<Record<string, string>>) }),
  'incident-kind':            sameValue,
  'incident-move':            sameValue,
  'incident-default-cause':   sameValue,
  'gate-outcome':             sameValue,
  'file-paths':               listCopyOf,
  'gate-phase':               sameValue,
  'gate-names':               listCopyOf,
  'landing-kind':             sameValue,
  'flag':                     sameValue,
  'optional-flag':            sameValue,
  'optional-cost-usd':        sameValue,
  'optional-pictures':        picturesCopyOf,
  'optional-ticket-ids':      listCopyOf,
  'optional-refusal-status':  sameValue,
  'optional-refusal-detail':  (value) => structuredClone(value),
  'optional-cache-reports':   gateCacheReportsCopyOf,
  'pipeline-step-kind':       sameValue,
  'lost-line-kind':           sameValue,
  'optional-gate-phase':      sameValue,
  'pipeline-step-ending':     sameValue,
  'setup-mode':               sameValue,
  'billing-mode':             sameValue,
  'setup-step':               sameValue,
  'setup-step-state':         sameValue,
  'setup-steps':              listCopyOf,
  'setup-item-ids':           listCopyOf,
  'draft-fields':             listCopyOf,
  'gate-profile-ending':      sameValue,
  'flint-brain-starter':      sameValue,
  'flint-brain-ended-reason': sameValue,
  'entity-assigner':          sameValue,
  'customs-checks':           listCopyOf,
};

const OPTIONAL_FIELD_SHAPES: readonly LogFieldShape[] = [
  'optional-text',
  'optional-size',
  'optional-count',
  'optional-flag',
  'optional-cost-usd',
  'optional-pictures',
  'optional-ticket-ids',
  'optional-refusal-status',
  'optional-refusal-detail',
  'optional-cache-reports',
  'optional-gate-phase',
];

/** Copies into `target` each value `shapes` names, in the schema's order, leaving out an optional one that is absent. */
function copyShapedValues(stored: UnknownObject, shapes: Readonly<Record<string, LogFieldShape>>, target: UnknownObject): UnknownObject {
  for (const [name, shape] of Object.entries(shapes)) {
    const value = stored[name];
    if (OPTIONAL_FIELD_SHAPES.includes(shape) && value === undefined) continue;
    target[name] = COPY_FOR_FIELD_SHAPE[shape](value);
  }
  return target;
}

/** `validated` is a value `logRecordProblemOf` found no problem in; anything else is a broken invariant, not a bad file. */
function recordOf(validated: unknown): LogRecord {
  const stored                      = validated as UnknownObject & { at: string; kind: LogRecordKind; fields: UnknownObject };
  const { at, kind }                = stored;
  const { subject, fields: shapes } = LOG_RECORD_SCHEMA[kind];
  const record                      = copyShapedValues(stored, LOG_RECORD_SUBJECT_IDS[subject], { at, kind });
  record['fields']                  = copyShapedValues(stored.fields, shapes, {});
  return record as LogRecord;
}

/** Which log a tracker has, from its log.jsonl reading: the file's records, an empty log when it is absent, or its own unreadable verdict. */
function storedLogOf(logFileReading: LogFileReading): StoredLogReading {
  if (logFileReading.verdict === 'unreadable') return logFileReading;
  const records = logFileReading.verdict === 'readable' ? logFileReading.records : [];
  return { verdict: 'readable', records };
}

export const LogRecordMappingUtil = { recordOf, storedLogOf, currentJobNameOf } as const;
