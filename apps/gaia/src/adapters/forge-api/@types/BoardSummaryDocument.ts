/**
 * The forge's open `GET /api/summary` at `summaryVersion: 1`: the keys Gaia reads of a forge without the monitor contract, after their
 * check. `ticketCountByStatus` is passed over.
 */
import type { UsageLimitDocument } from './MonitorSnapshotDocument.ts';

/** `down` is the forge's word for an Overseer that serves nothing. */
export type SummaryOverseerState = 'serving' | 'held-by-install-change' | 'passing-baton' | 'down';

export interface SummaryOverseerDocument {
  readonly state:  SummaryOverseerState;
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
  readonly overseer:       SummaryOverseerDocument;
  readonly readyTicketIds: readonly string[];
  readonly jobs:           readonly SummaryJobDocument[];
  readonly openDecisions:  number;
  readonly openIncidents:  number;
  readonly usage:          UsageLimitDocument;
}
