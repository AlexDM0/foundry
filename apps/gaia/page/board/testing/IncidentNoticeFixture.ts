/**
 * Synthetic incident defaults and open incidents, each with the log records the forge writes for it and the notice it serves for a
 * default, worded as the forge words it, for the incident line's specs. Test-only.
 */
import type { BoardQuestionHistoryEntryDocument } from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardNoticeDocument }               from '../../@types/board/BoardFactDocuments.ts';
import type { BoardIncidentDocument }             from '../../@types/board/BoardIncidentDocument.ts';
import type { BoardJobDocument }                  from '../../@types/board/BoardJobDocuments.ts';
import type { IncidentNoticeBoard }               from '../shell/IncidentNoticeModel.ts';
import type { TimestampSlices }                   from '../utils/TimeUtil.ts';
import { exampleAgentJob }                        from './BoardStateFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }               from './TimestampSlicesFixture.ts';

export const EXAMPLE_INCIDENT_DAY = '2026-10-29';

export const EXAMPLE_INCIDENT_SLICES: TimestampSlices = EXAMPLE_TIMESTAMP_SLICES;

/** The forge's words for why an incident took its default, as its notices serve them. */
const CAUSE_TEXTS: Readonly<Record<string, string>> = {
  'turn-closed':  'its delivery turn closed',
  'no-assistant': 'no Assistant was up',
};

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

/** A log record of an incident, with the fields it carries. */
export function incidentRecordOf(kind: string, at: string, incidentId: string, fields: Readonly<Record<string, unknown>>): BoardQuestionHistoryEntryDocument {
  return {
    kind, at, jobId: null, ticketId: null, decisionId: null, incidentId, fields,
  };
}

/** The default's `incident-defaulted` notice as the forge serves it, and its opened and defaulted log records. */
export function exampleIncidentDefault(fields: ExampleIncidentDefault): { readonly notice: BoardNoticeDocument; readonly history: readonly BoardQuestionHistoryEntryDocument[] } {
  const causeText = CAUSE_TEXTS[fields.cause] ?? fields.cause;
  return {
    notice: {
      kind:  'incident-defaulted',
      facts: { incidentId: fields.incidentId, move: fields.move, cause: fields.cause },
      text:  `incident ${fields.incidentId} took its default, ${fields.move}: ${causeText}`,
      causeText,
    },
    history: [
      incidentRecordOf('incident-opened', exampleIncidentStampAt(fields.openedAt), fields.incidentId, { kind: fields.kind, ticketIds: fields.ticketIds }),
      incidentRecordOf('incident-defaulted', exampleIncidentStampAt(fields.defaultAt), fields.incidentId, { move: fields.move, cause: fields.cause }),
    ],
  };
}

/** An open incident on the board, undelivered unless the fields say otherwise, with its opened log record. */
export interface ExampleOpenIncident {
  readonly incident: BoardIncidentDocument;
  readonly history:  readonly BoardQuestionHistoryEntryDocument[];
}

export function exampleOpenIncident(id: string, fields: Partial<BoardIncidentDocument> & { readonly openedClock: string }): ExampleOpenIncident {
  const { openedClock, ...incidentFields } = fields;
  const incident: BoardIncidentDocument = {
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
    history: [incidentRecordOf('incident-opened', incident.openedAt, id, { kind: incident.kind, ticketIds: incident.ticketIds })],
  };
}

export const EXAMPLE_LIVE_ASSISTANT: BoardJobDocument = exampleAgentJob({
  id: 'J1', kind: 'assistant', role: 'assistant', ticketIds: []
});

/** Four defaults (I1 to I4, I4 the newest) and two open incidents (I5 delivered in J1's chat 14, I6 waiting), with a live Assistant J1. */
export function exampleIncidentBoard(): IncidentNoticeBoard {
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
    incidents:       [delivered.incident, waiting.incident],
    notices:         defaults.map((incidentDefault) => incidentDefault.notice),
    questionHistory: [...defaults.flatMap((incidentDefault) => incidentDefault.history), ...delivered.history, ...waiting.history],
  };
}
