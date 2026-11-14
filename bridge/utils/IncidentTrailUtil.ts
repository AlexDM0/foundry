/**
 * Incidents as the Bridge shows them wherever they show: the open ones from the board, the settled ones read back from the log, each
 * with its trail of steps (opened, delivered, then every move, note and escalation made under it); the pill each takes; and the words for
 * why a default applied. A step carries the job or decision it names as an id, so a view links it instead of reading it out of text.
 */
import type { DisplayState }                                                          from '../../src/lib/tracker-model/@types/Task.ts';
import { NoticeWordingUtil }                                                          from '../../src/shared/monitor/utils/NoticeWordingUtil.ts';
import type { HistoryRecordDocument, IncidentDeliveryTurnDocument, IncidentDocument } from '../@types/ConversationDocuments.ts';

export type IncidentSettlement = 'open' | 'handled' | 'escalated' | 'defaulted';

export type IncidentStepForm = 'opened' | 'delivered' | 'noted' | 'handled' | 'answered' | 'escalated' | 'defaulted';

/** One step of an incident's trail: its words, then the id it names, if any, which a view shows as a link after them. */
export interface IncidentStep {
  /** `null` for a step the log stamps nowhere, such as the delivery the board only reports. */
  readonly at:          string | null;
  readonly form:        IncidentStepForm;
  readonly text:        string;
  /** An escalation's decision. */
  readonly decisionId?: string;
  /** A delivery's Assistant job. */
  readonly jobId?:      string;
}

export interface IncidentEntry {
  readonly incidentId:      string;
  readonly kind:            string;
  readonly ticketIds:       readonly string[];
  /** The job an open incident is about, where it names one; the log's opened record names none. */
  readonly jobId:           string | null;
  readonly settlement:      IncidentSettlement;
  /** The move it takes when its delivery turn closes unhandled; known only while it is open. */
  readonly defaultMove:     string | null;
  readonly delivered:       boolean;
  /** The Assistant's chat an open incident went out in; `null` while it waits, and for a settled one. */
  readonly deliveredInChat: IncidentDeliveryTurnDocument | null;
  readonly facts:           readonly (readonly [name: string, value: string])[];
  readonly openedAt:        string | null;
  /** The stamp and the move of the record that settled it; `null` while it is open, and the move `null` for a settlement with none. */
  readonly settledAt:       string | null;
  readonly settlingMove:    string | null;
  readonly steps:           readonly IncidentStep[];
}

/** An incident's pill: its settlement, or for an open one whether it reached the Assistant, in the nearest palette row. */
export interface IncidentPill {
  readonly state: DisplayState;
  readonly label: string;
}

const DISPLAY_STATE_OF_SETTLEMENT: Readonly<Record<Exclude<IncidentSettlement, 'open'>, DisplayState>> = {
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

const STEP_FORM_OF_RECORD_KIND: Readonly<Record<string, IncidentStepForm>> = {
  'incident-handled':   'handled',
  'incident-answered':  'answered',
  'incident-escalated': 'escalated',
  'incident-defaulted': 'defaulted',
  'incident-noted':     'noted',
};

const INCIDENT_OPENED = 'incident-opened';

function textField(record: HistoryRecordDocument, name: string): string {
  const value = record.fields[name];
  return typeof value === 'string' ? value : '';
}

function recordedStepOf(record: HistoryRecordDocument): IncidentStep | null {
  if (!Object.hasOwn(STEP_FORM_OF_RECORD_KIND, record.kind)) return null;
  const form = STEP_FORM_OF_RECORD_KIND[record.kind] ?? 'noted';
  switch (form) {
    case 'handled':
      return { at: record.at, form, text: `handled with ${textField(record, 'move')}` };
    case 'answered':
      return { at: record.at, form, text: 'answered for the waiting agent' };
    case 'escalated': {
      const decisionId = textField(record, 'decisionId');
      return decisionId === '' ? { at: record.at, form, text: 'escalated to User' } : {
        at: record.at, form, text: 'escalated to User as', decisionId
      };
    }
    case 'defaulted':
      return { at: record.at, form, text: `default applied: ${textField(record, 'move')}, as ${NoticeWordingUtil.defaultCauseTextOf(textField(record, 'cause'))}` };
    default:
      return { at: record.at, form, text: `note: ${textField(record, 'text')}` };
  }
}

/** The moves, notes and escalations the log records under the incident, in log order. */
function recordedStepsOf(history: readonly HistoryRecordDocument[], incidentId: string): IncidentStep[] {
  return history.flatMap((record) => {
    const step = record.incidentId === incidentId ? recordedStepOf(record) : null;
    return step === null ? [] : [step];
  });
}

/** `opened: setup-failed on #042 (step install)`: the kind, its tickets and the facts it was opened with. */
function openedStepOf(at: string | null, kind: string, ticketIds: readonly string[], facts: IncidentEntry['facts']): IncidentStep {
  const onTickets = ticketIds.length === 0 ? '' : ` on ${ticketIds.map((ticketId) => `#${ticketId}`).join(', ')}`;
  const factsText = facts.length === 0 ? '' : ` (${facts.map(([name, value]) => `${name} ${value}`).join(', ')})`;
  return { at, form: 'opened', text: `opened: ${kind}${onTickets}${factsText}` };
}

/** The board reports the chat an incident went out in, never when: the step has no stamp. */
function deliveredStepOf(delivery: IncidentDeliveryTurnDocument): IncidentStep {
  return {
    at: null, form: 'delivered', text: `delivered in chat ${String(delivery.chatSequence)} to`, jobId: delivery.jobId
  };
}

function openIncidentEntriesOf(incidents: readonly IncidentDocument[], history: readonly HistoryRecordDocument[]): IncidentEntry[] {
  return incidents.map((incident) => {
    const facts = Object.entries(incident.facts);
    return {
      incidentId:      incident.id,
      kind:            incident.kind,
      ticketIds:       incident.ticketIds,
      jobId:           incident.jobId,
      settlement:      'open',
      defaultMove:     incident.defaultMove,
      delivered:       incident.deliveredInTurn !== null,
      deliveredInChat: incident.deliveredInTurn,
      facts,
      openedAt:        incident.openedAt,
      settledAt:       null,
      settlingMove:    null,
      steps:           [
        openedStepOf(incident.openedAt, incident.kind, incident.ticketIds, facts),
        ...(incident.deliveredInTurn === null ? [] : [deliveredStepOf(incident.deliveredInTurn)]),
        ...recordedStepsOf(history, incident.id),
      ],
    };
  });
}

/** Every incident the log opened that is no longer open, newest first, settled by its last settling record. */
function settledIncidentEntriesOf(history: readonly HistoryRecordDocument[], openIds: ReadonlySet<string>): IncidentEntry[] {
  return history
    .filter((record) => record.kind === INCIDENT_OPENED && record.incidentId !== undefined && !openIds.has(record.incidentId))
    .map((opened): IncidentEntry => {
      const incidentId = opened.incidentId ?? '';
      const settling = history.findLast((record) => record.incidentId === incidentId && Object.hasOwn(SETTLING_KINDS, record.kind));
      const { ticketIds: storedTicketIds } = opened.fields;
      const ticketIds = Array.isArray(storedTicketIds) ? storedTicketIds.map(String) : [];
      const kind = textField(opened, 'kind');
      const settlingMove = settling === undefined ? '' : textField(settling, 'move');
      return {
        incidentId,
        kind,
        ticketIds,
        jobId:           null,
        settlement:      settling === undefined ? 'handled' : SETTLING_KINDS[settling.kind] ?? 'handled',
        defaultMove:     null,
        delivered:       true,
        deliveredInChat: null,
        facts:           [],
        openedAt:        opened.at,
        settledAt:       settling?.at ?? null,
        settlingMove:    settlingMove === '' ? null : settlingMove,
        steps:           [openedStepOf(opened.at, kind, ticketIds, []), ...recordedStepsOf(history, incidentId)],
      };
    })
    .reverse();
}

function incidentPillOf(incident: Pick<IncidentEntry, 'settlement' | 'delivered'>): IncidentPill {
  if (incident.settlement === 'open') return incident.delivered ? { state: 'in-review', label: 'delivered' } : { state: 'in-progress', label: 'waiting for the Assistant' };
  return { state: DISPLAY_STATE_OF_SETTLEMENT[incident.settlement], label: incident.settlement };
}

export const IncidentTrailUtil = Object.freeze({ openIncidentEntriesOf, settledIncidentEntriesOf, incidentPillOf });
