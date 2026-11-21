/** Operational trouble a forge cannot settle alone, addressed to its Assistant. */
export interface BoardIncidentDeliveryTurn {
  readonly jobId:        string;
  readonly chatSequence: number;
}

export interface BoardIncident {
  readonly id:              string;
  readonly kind:            string;
  readonly ticketIds:       readonly string[];
  readonly jobId:           string | null;
  readonly facts:           Readonly<Record<string, string>>;
  /** The move the incident takes when nobody settles it. */
  readonly defaultMove:     string;
  /** `null` while the incident waits for an Assistant's chat. */
  readonly deliveredInTurn: BoardIncidentDeliveryTurn | null;
  readonly openedAt:        string;
}
