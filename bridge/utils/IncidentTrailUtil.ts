/**
 * Incidents as the Bridge shows them wherever they show: the open ones from the board, the settled ones read back from the log, each
 * with the moves, notes and escalations made under it; the pill each takes; and the words for why a default applied.
 */
import type { DisplayState }                            from '../../src/lib/tracker-model/@types/Task.ts';
import type { HistoryRecordDocument, IncidentDocument } from '../@types/ConversationDocuments.ts';

export type IncidentSettlement = 'open' | 'handled' | 'escalated' | 'defaulted';

export interface IncidentStep {
  readonly at:   string;
  readonly text: string;
}

export interface IncidentEntry {
  readonly incidentId:  string;
  readonly kind:        string;
  readonly ticketIds:   readonly string[];
  readonly settlement:  IncidentSettlement;
  /** The move it takes when its delivery turn closes unhandled; known only while it is open. */
  readonly defaultMove: string | null;
  readonly delivered:   boolean;
  readonly facts:       readonly (readonly [name: string, value: string])[];
  readonly steps:       readonly IncidentStep[];
}

/** An incident's pill: its settlement, or for an open one whether it reached the Assistant, in the nearest palette row. */
export interface IncidentPill {
  readonly state: DisplayState;
  readonly label: string;
}

const PALETTE_STATE_OF_SETTLEMENT: Readonly<Record<Exclude<IncidentSettlement, 'open'>, DisplayState>> = {
  handled:   'reviewed',
  escalated: 're-review',
  defaulted: 'draft',
};

const SETTLING_KINDS: Readonly<Record<string, IncidentSettlement>> = {
  'incident-handled':   'handled',
  'incident-answered':  'handled',
  'incident-escalated': 'escalated',
  'incident-defaulted': 'defaulted',
};

const DEFAULT_CAUSE_TEXT: Readonly<Record<string, string>> = {
  'turn-closed':  'its delivery turn closed',
  'turn-budget':  'the turn budget ran out',
  'no-assistant': 'no Assistant was up',
};

function textField(record: HistoryRecordDocument, name: string): string {
  const value = record.fields[name];
  return typeof value === 'string' ? value : '';
}

function stepTextOf(record: HistoryRecordDocument): string | null {
  switch (record.kind) {
    case 'incident-handled':
      return `handled with ${textField(record, 'move')}`;
    case 'incident-answered':
      return 'answered for the waiting agent';
    case 'incident-escalated':
      return `escalated to User as ${textField(record, 'decisionId')}`;
    case 'incident-defaulted':
      return `default applied: ${textField(record, 'move')} (${textField(record, 'cause')})`;
    case 'incident-noted':
      return `note: ${textField(record, 'text')}`;
    default:
      return null;
  }
}

function stepsOf(history: readonly HistoryRecordDocument[], incidentId: string): IncidentStep[] {
  return history.flatMap((record) => {
    const text = record.incidentId === incidentId ? stepTextOf(record) : null;
    return text === null ? [] : [{ at: record.at, text }];
  });
}

function openIncidentEntriesOf(incidents: readonly IncidentDocument[], history: readonly HistoryRecordDocument[]): IncidentEntry[] {
  return incidents.map((incident) => ({
    incidentId:  incident.id,
    kind:        incident.kind,
    ticketIds:   incident.ticketIds,
    settlement:  'open',
    defaultMove: incident.defaultMove,
    delivered:   incident.deliveredInTurn !== null,
    facts:       Object.entries(incident.facts),
    steps:       stepsOf(history, incident.id),
  }));
}

/** Every incident the log opened that is no longer open, newest first, settled by its last settling record. */
function settledIncidentEntriesOf(history: readonly HistoryRecordDocument[], openIds: ReadonlySet<string>): IncidentEntry[] {
  return history
    .filter((record) => record.kind === 'incident-opened' && record.incidentId !== undefined && !openIds.has(record.incidentId))
    .map((opened) => {
      const incidentId = opened.incidentId ?? '';
      const settling = history.findLast((record) => record.incidentId === incidentId && Object.hasOwn(SETTLING_KINDS, record.kind));
      const { ticketIds } = opened.fields;
      return {
        incidentId,
        kind:        textField(opened, 'kind'),
        ticketIds:   Array.isArray(ticketIds) ? ticketIds.map(String) : [],
        settlement:  settling === undefined ? 'handled' : SETTLING_KINDS[settling.kind] ?? 'handled',
        defaultMove: null,
        delivered:   true,
        facts:       [],
        steps:       stepsOf(history, incidentId),
      };
    })
    .reverse();
}

function incidentPillOf(incident: Pick<IncidentEntry, 'settlement' | 'delivered'>): IncidentPill {
  if (incident.settlement === 'open') return incident.delivered ? { state: 'in-review', label: 'delivered' } : { state: 'in-progress', label: 'waiting for the Assistant' };
  return { state: PALETTE_STATE_OF_SETTLEMENT[incident.settlement], label: incident.settlement };
}

/** Why an incident took its default, `its delivery turn closed`; a cause the Bridge does not know reads as itself. */
function defaultCauseTextOf(cause: string): string {
  return Object.hasOwn(DEFAULT_CAUSE_TEXT, cause) ? DEFAULT_CAUSE_TEXT[cause] ?? cause : cause;
}

export const IncidentTrailUtil = Object.freeze({
  openIncidentEntriesOf, settledIncidentEntriesOf, incidentPillOf, defaultCauseTextOf
});
