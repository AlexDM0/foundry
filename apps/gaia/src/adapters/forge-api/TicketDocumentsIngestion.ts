/**
 * The ingestion of a forge's answer for a ticket's documents (`GET /api/v1/tickets/{ticketId}/documents`) into Gaia's
 * `BoardTicketDocuments`. The document carries no version key: its version is the endpoint's, which Gaia derives from the forge's registry
 * at the forge version it supports. 200 is the documents, 404 the forge's refusal kept with its code, fields and sentence unchanged; any
 * other status, or a body that does not fit, is `unreadable` and names its keys.
 */
import type { ForgeTicketDocumentsDocument } from 'forge-contracts/TicketDocumentsDocument';

import { DocumentShapeUtil }                                                         from '../../lib/json-value/DocumentShapeUtil.ts';
import type { BoardRefusal }                                                         from '../../shared/@types/board/BoardRefusal.ts';
import type { BoardTicketDocuments }                                                 from '../../shared/@types/board/TicketDocuments.ts';
import { ROUTE_REFUSAL_SHAPE, TICKET_DOCUMENTS_SHAPE, type ForgeRouteRefusalAnswer } from './constants/TicketDocumentsShapes.ts';
import { TicketDocumentsMapUtil }                                                    from './utils/TicketDocumentsMapUtil.ts';

export type TicketDocumentsReading =
  | { readonly verdict: 'read'; readonly ticketDocuments: BoardTicketDocuments }
  | { readonly verdict: 'refused'; readonly refusal: BoardRefusal }
  | { readonly verdict: 'unreadable'; readonly invalidKeys: readonly string[] };

const DOCUMENTS_STATUS = 200;
const NO_DOCUMENTS_STATUS = 404;
const STATUS_KEY = 'status';

export class TicketDocumentsIngestion {
  public ticketDocumentsOf(status: number, body: unknown): TicketDocumentsReading {
    if (status === DOCUMENTS_STATUS) {
      const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, TICKET_DOCUMENTS_SHAPE);
      if (invalidKeys.length > 0) return { verdict: 'unreadable', invalidKeys };
      return { verdict: 'read', ticketDocuments: TicketDocumentsMapUtil.ticketDocumentsOf(body as ForgeTicketDocumentsDocument) };
    }
    if (status !== NO_DOCUMENTS_STATUS) return { verdict: 'unreadable', invalidKeys: [STATUS_KEY] };
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, ROUTE_REFUSAL_SHAPE);
    if (invalidKeys.length > 0) return { verdict: 'unreadable', invalidKeys };
    const refusal = body as ForgeRouteRefusalAnswer;
    return { verdict: 'refused', refusal: { code: refusal.refusal, fields: refusal.fields, sentence: refusal.text } };
  }
}
