import type { BoardRoute } from './board/BoardRoute.ts';

/** What waits on User about a forge itself, raised by Gaia from the forge's served presence, never by the forge's own attention list. */
export type ForgeAlertKind = 'forge-crashed' | 'forge-down' | 'forge-hung';

/** What waits on User across the fleet, raised by Gaia from every forge's served presence: the agents a network outage stopped. */
export type FleetAlertKind = 'agents-ended-on-outage';

/**
 * One entry of what waits on User in one forge, as that forge orders and words it, a forge alert Gaia raises from its presence, or the
 * fleet's alert of the agents a network outage stopped.
 */
export type AttentionKind = 'escalated-question' | 'question' | 'draft-ticket' | 'filing-draft' | 'review' | 'merge-accept' | ForgeAlertKind | FleetAlertKind;

export type AttentionStampWord = 'opened' | 'filed' | 'ready since' | 'reviewed' | 'crashed' | 'last reported';

/** `Start` sends the forge's start; a forge alert without it opens the forge's route. */
export type AttentionActionLabel = 'Answer' | 'Ready' | 'Review' | 'Accept' | 'Start' | 'Open';

export interface AttentionItem {
  /** Unique within its forge, such as `decision:E3`; the notification key is built from it. */
  key:                     string;
  kind:                    AttentionKind;
  idText:                  string;
  ticketIds:               string[];
  subject:                 string;
  jobId:                   string | null;
  askedBy:                 string | null;
  decisionKind:            string | null;
  escalatedFromIncidentId: string | null;
  metaText:                string | null;
  stamp:                   string;
  stampWord:               AttentionStampWord;
  actionLabel:             AttentionActionLabel;
  /** Where on the forge's board the entry opens; `null` for a route the forge names that Gaia's board does not know. */
  boardRoute:              BoardRoute | null;
}
