/** Operational trouble a forge cannot settle alone, addressed to its Assistant. */
export interface BoardIncidentDeliveryTurnDocument {
  readonly jobId:        string;
  readonly chatSequence: number;
}

export interface BoardIncidentDocument {
  readonly id:              string;
  readonly kind:            string;
  readonly ticketIds:       readonly string[];
  readonly jobId:           string | null;
  readonly facts:           Readonly<Record<string, string>>;
  /** The move the incident takes when nobody settles it. */
  readonly defaultMove:     string;
  /** `null` while the incident waits for an Assistant's chat. */
  readonly deliveredInTurn: BoardIncidentDeliveryTurnDocument | null;
  readonly openedAt:        string;
}
