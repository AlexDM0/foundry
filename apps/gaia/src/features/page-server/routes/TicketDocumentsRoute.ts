/**
 * `GET /api/v1/forges/<trackerId>/tickets/<ticketId>/documents`: a ticket's spec and plan, read afresh from the forge through the reader the
 * server hands in, and mapped to the page's `GaiaTicketDocumentsDocument` with the Markdown left as source text. A forge's refusal, such as
 * a ticket with no documents, reaches the page as the forge's own sentence; a refusal of Gaia's in Gaia's words.
 */
import { TicketDocumentsDocumentMapUtil } from '../../../adapters/page-api/TicketDocumentsDocumentMapUtil.ts';
import type { BoardRefusal }              from '../../../shared/@types/board/BoardRefusal.ts';
import type { BoardRelayRefusal }         from '../../../shared/@types/board/BoardRelayVerdict.ts';
import type { BoardTicketDocuments }      from '../../../shared/@types/board/TicketDocuments.ts';
import { BoardRelayAnswers }              from '../BoardRelayAnswers.ts';

export type TicketDocumentsRead =
  | { readonly verdict: 'read'; readonly ticketDocuments: BoardTicketDocuments }
  | { readonly verdict: 'refused-by-forge'; readonly refusal: BoardRefusal }
  | { readonly verdict: 'refused-by-gaia'; readonly refusal: BoardRelayRefusal };

export type TicketDocumentsReader = (trackerId: string, ticketId: string) => Promise<TicketDocumentsRead>;

const ANSWER_HEADERS = { 'content-type': 'application/json;charset=utf-8', ...BoardRelayAnswers.NO_STORE } as const;

export async function ticketDocumentsAnswerFor(trackerId: string, ticketId: string, readTicketDocuments: TicketDocumentsReader): Promise<Response> {
  const read = await readTicketDocuments(trackerId, ticketId);
  switch (read.verdict) {
    case 'refused-by-gaia':
      return BoardRelayAnswers.relayRefusalAnswerOf(read.refusal);
    case 'refused-by-forge':
      return BoardRelayAnswers.forgeRefusalAnswerOf(read.refusal);
    case 'read':
      return new Response(JSON.stringify(TicketDocumentsDocumentMapUtil.ticketDocumentsDocumentOf(read.ticketDocuments)), { headers: ANSWER_HEADERS });
  }
}
