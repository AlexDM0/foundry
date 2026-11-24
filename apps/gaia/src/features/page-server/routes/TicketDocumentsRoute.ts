/**
 * `GET /api/v1/forges/<trackerId>/tickets/<ticketId>/documents`: a ticket's spec and plan, read afresh from the forge on every ask, ingested
 * and mapped to the page's `GaiaTicketDocumentsDocument` with the Markdown left as source text. A forge's refusal, such as a ticket with no
 * documents, reaches the page as the forge's own sentence; a refusal of Gaia's in Gaia's words.
 */
import { TicketDocumentsIngestion }                       from '../../../adapters/forge-api/TicketDocumentsIngestion.ts';
import { TicketDocumentsDocumentMapUtil }                 from '../../../adapters/page-api/TicketDocumentsDocumentMapUtil.ts';
import type { BoardRefusal }                              from '../../../shared/@types/board/BoardRefusal.ts';
import type { BoardRelayRefusal }                         from '../../../shared/@types/board/BoardRelayVerdict.ts';
import type { BoardTicketDocuments }                      from '../../../shared/@types/board/TicketDocuments.ts';
import type { BoardRelayLog }                             from '../@types/BoardRelayLogEntry.ts';
import { BoardRelayAnswers }                              from '../BoardRelayAnswers.ts';
import { forgeAccessVerdictFor, type ForgeAccessSources } from '../ForgeAccess.ts';

export type TicketDocumentsRead =
  | { readonly verdict: 'read'; readonly ticketDocuments: BoardTicketDocuments }
  | { readonly verdict: 'refused-by-forge'; readonly refusal: BoardRefusal }
  | { readonly verdict: 'refused-by-gaia'; readonly refusal: BoardRelayRefusal };

export type TicketDocumentsReader = (trackerId: string, ticketId: string) => Promise<TicketDocumentsRead>;

const ANSWER_HEADERS = { 'content-type': 'application/json;charset=utf-8', ...BoardRelayAnswers.NO_STORE } as const;

/** Reads a ticket's documents through the forge client; a document that does not ingest is logged with its keys and refused. */
export function ticketDocumentsReaderOf(sources: ForgeAccessSources, log: BoardRelayLog): TicketDocumentsReader {
  const ingestion = new TicketDocumentsIngestion();
  return async (trackerId, ticketId) => {
    const accessVerdict = await forgeAccessVerdictFor(trackerId, sources);
    if (accessVerdict.verdict === 'refused') return { verdict: 'refused-by-gaia', refusal: BoardRelayAnswers.relayRefusalOfAccess(accessVerdict.refusal) };
    const answer = await sources.forgeClient.ticketDocumentsOf(accessVerdict.access, ticketId);
    switch (answer.verdict) {
      case 'unreachable':
        return { verdict: 'refused-by-gaia', refusal: 'forge-unreachable' };
      case 'unauthorized':
        return { verdict: 'refused-by-gaia', refusal: 'token-rejected' };
      case 'refused':
      case 'malformed':
        return { verdict: 'refused-by-gaia', refusal: 'forge-document-unreadable' };
      case 'answered':
        break;
    }
    const reading = ingestion.ticketDocumentsOf(answer.status, answer.body);
    switch (reading.verdict) {
      case 'read':
        return { verdict: 'read', ticketDocuments: reading.ticketDocuments };
      case 'refused':
        return { verdict: 'refused-by-forge', refusal: reading.refusal };
      case 'unreadable':
        log({
          kind: 'ticket-documents-unreadable', trackerId, ticketId, invalidKeys: reading.invalidKeys
        });
        return { verdict: 'refused-by-gaia', refusal: 'forge-document-unreadable' };
    }
  };
}

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
