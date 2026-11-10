/** Synthetic incident defaults and open incidents, each with the log records the Overseer writes for it, for the incident line's specs. */
import type {
  ConversationBoardDocument,
  HistoryRecordDocument,
  IncidentDocument,
  NoticeDocument,
  SessionJobDocument
} from '../@types/ConversationDocuments.ts';
import type { TimestampSlices } from '../utils/TimeUtil.ts';
import { EXAMPLE_PAGE_LIMITS }  from './PageLimitsFixture.ts';

export const EXAMPLE_INCIDENT_DAY = '2026-10-29';

export const EXAMPLE_INCIDENT_SLICES: TimestampSlices = EXAMPLE_PAGE_LIMITS;

/** A stamp of the example day at a wall clock, `22:40`. */
export function exampleIncidentStampAt(clock: string): string {
  return `${EXAMPLE_INCIDENT_DAY}T${clock}:00+01:00`;
}

export interface ExampleIncidentDefault {
  readonly incidentId: string;
  readonly kind:       string;
  readonly ticketIds:  readonly string[];
  readonly move:       string;
  readonly cause:      string;
  /** Wall clocks of the example day. */
  readonly openedAt:   string;
  readonly defaultAt:  string;
}

/** The default's `incident-defaulted` notice, and its opened and defaulted log records. */
export function exampleIncidentDefault(fields: ExampleIncidentDefault): { readonly notice: NoticeDocument; readonly history: readonly HistoryRecordDocument[] } {
  return {
    notice: {
      kind: 'incident-defaulted', incidentId: fields.incidentId, move: fields.move, cause: fields.cause
    },
    history: [
      {
        kind: 'incident-opened', at: exampleIncidentStampAt(fields.openedAt), incidentId: fields.incidentId, fields: { kind: fields.kind, ticketIds: fields.ticketIds }
      },
      {
        kind: 'incident-defaulted', at: exampleIncidentStampAt(fields.defaultAt), incidentId: fields.incidentId, fields: { move: fields.move, cause: fields.cause }
      },
    ],
  };
}

/** An open incident on the board, undelivered unless the fields say otherwise, with its opened log record. */
export interface ExampleOpenIncident {
  readonly incident: IncidentDocument;
  readonly history:  readonly HistoryRecordDocument[];
}

export function exampleOpenIncident(id: string, fields: Partial<IncidentDocument> & { readonly openedClock: string }): ExampleOpenIncident {
  const { openedClock, ...incidentFields } = fields;
  const incident: IncidentDocument = {
    id,
    kind:            'sandbox-unavailable',
    ticketIds:       ['004'],
    jobId:           'J4',
    facts:           {},
    defaultMove:     'gate-retry',
    deliveredInTurn: null,
    openedAt:        exampleIncidentStampAt(openedClock),
    ...incidentFields,
  };
  return {
    incident,
    history: [{
      kind: 'incident-opened', at: incident.openedAt, incidentId: id, fields: { kind: incident.kind, ticketIds: incident.ticketIds }
    }],
  };
}

export const EXAMPLE_LIVE_ASSISTANT: SessionJobDocument = {
  id: 'J1', kind: 'assistant', ticketIds: [], state: 'running'
};

/** Four defaults (I1 to I4, I4 the newest) and two open incidents (I5 delivered in J1's chat 14, I6 waiting), with a live Assistant J1. */
export function exampleIncidentBoard(): ConversationBoardDocument {
  const defaults = [
    exampleIncidentDefault({
      incidentId: 'I1', kind: 'gate-cannot-run', ticketIds: ['010'], move: 'gate-retry', cause: 'turn-closed', openedAt: '22:10', defaultAt: '22:16'
    }),
    exampleIncidentDefault({
      incidentId: 'I2', kind: 'setup-failed', ticketIds: ['002'], move: 'worktree-repair', cause: 'turn-closed', openedAt: '22:15', defaultAt: '22:21'
    }),
    exampleIncidentDefault({
      incidentId: 'I3', kind: 'gate-cannot-run', ticketIds: ['016'], move: 'gate-retry', cause: 'no-assistant', openedAt: '22:25', defaultAt: '22:30'
    }),
    exampleIncidentDefault({
      incidentId: 'I4', kind: 'resume-failed', ticketIds: ['001'], move: 'job-fresh', cause: 'turn-closed', openedAt: '22:33', defaultAt: '22:40'
    }),
  ];
  const delivered = exampleOpenIncident('I5', {
    kind: 'system-question', ticketIds: ['007'], jobId: null, defaultMove: 'incident-escalate', deliveredInTurn: { jobId: 'J1', chatSequence: 14 }, openedClock: '22:38'
  });
  const waiting = exampleOpenIncident('I6', { openedClock: '22:42' });
  return {
    jobs:            [EXAMPLE_LIVE_ASSISTANT],
    decisions:       [],
    incidents:       [delivered.incident, waiting.incident],
    notices:         defaults.map((incidentDefault) => incidentDefault.notice),
    questionHistory: [...defaults.flatMap((incidentDefault) => incidentDefault.history), ...delivered.history, ...waiting.history],
  };
}
