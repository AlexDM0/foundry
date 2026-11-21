/**
 * The forge's open `GET /api/summary` at `summaryVersion: 3`: the keys a reader checks of a forge without the monitor contract.
 * `ticketCountByStatus` is left out.
 */
import type { UsageLimitDocument } from './MonitorSnapshotDocument.ts';

/** `down` is the forge's word for a Hephaestus that serves nothing. */
export type SummaryHephaestusState = 'serving' | 'held-by-install-change' | 'restarting' | 'down';

export interface SummaryHephaestusDocument {
  readonly state:  SummaryHephaestusState;
  readonly paused: boolean;
  readonly url:    string | null;
}

/** A summary's job holds these keys and no others. */
export interface SummaryJobDocument {
  readonly id:        string;
  readonly kind:      string;
  readonly ticketIds: readonly string[];
  readonly state:     string;
  readonly role:      string | null;
  readonly tokens:    number;
}

export interface BoardSummaryDocument {
  readonly summaryVersion: number;
  readonly project:        string;
  readonly hephaestus:     SummaryHephaestusDocument;
  readonly readyTicketIds: readonly string[];
  readonly jobs:           readonly SummaryJobDocument[];
  readonly openDecisions:  number;
  readonly openIncidents:  number;
  readonly usage:          UsageLimitDocument;
}
