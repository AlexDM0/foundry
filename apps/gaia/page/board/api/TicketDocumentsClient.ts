/**
 * Reads a ticket's spec and plan through Gaia's relay (`GET /api/v1/forges/<trackerId>/tickets/<ticketId>/documents`) with the page's
 * session. The board stream's `documents` part says when to read them again. A refusal reads as its sentence, shown verbatim: the forge's
 * own, such as a ticket with no documents, or Gaia's for a refusal of Gaia's, such as a forge that does not answer.
 */
import { PAGE_CONTRACT_VERSIONS }           from '../../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }              from '../../../src/shared/utils/ContractVersionUtil.ts';
import type { GaiaTicketDocumentsDocument } from '../../@types/board/TicketDocumentsDocument.ts';
import { BoardApiPaths }                    from './BoardApiPaths.ts';
import { refusalTextOf }                    from './RefusalOf.ts';
import {
  BROWSER_RELAY_REQUEST_SENDER,
  jsonBodyOf,
  relayResponseOf,
  type RelayRequestSender
} from './RelayRequest.ts';
import { HTTP_STATUS } from './constants/HttpStatus.ts';

export type TicketDocumentsRead =
  | { readonly verdict: 'read'; readonly documents: GaiaTicketDocumentsDocument }
  | { readonly verdict: 'refused'; readonly refusal: string }
  | { readonly verdict: 'unreadable' }
  | { readonly verdict: 'unreachable' }
  | { readonly verdict: 'no-session' };

export interface TicketDocumentsClient {
  readonly read: (ticketId: string) => Promise<TicketDocumentsRead>;
}

const DOCUMENTS_VERSION_KEYS = { majorKey: 'ticketDocumentsVersion' } as const;

/** The refusal's sentence, the forge's or Gaia's, of a refusal of the page's contract, bare or under `refusal`. */
function refusalOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  return refusalTextOf(body) ?? refusalTextOf((body as Readonly<Record<string, unknown>>)['refusal']);
}

function create(trackerId: string, sendRequest: RelayRequestSender = BROWSER_RELAY_REQUEST_SENDER): TicketDocumentsClient {
  const read = async (ticketId: string): Promise<TicketDocumentsRead> => {
    const answered = await relayResponseOf(sendRequest, BoardApiPaths.ticketDocumentsPathOf(trackerId, ticketId), { method: 'GET' });
    if (answered.verdict === 'unreachable') return { verdict: 'unreachable' };
    const { response } = answered;
    if (response.status === HTTP_STATUS.UNAUTHORIZED) return { verdict: 'no-session' };
    const body = await jsonBodyOf(response);
    if (response.status !== HTTP_STATUS.OK) {
      const refusal = refusalOf(body);
      return refusal === null ? { verdict: 'unreadable' } : { verdict: 'refused', refusal };
    }
    return ContractVersionUtil.readMajorOf(body, DOCUMENTS_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaTicketDocuments) === null
      ? { verdict: 'unreadable' }
      : { verdict: 'read', documents: body as GaiaTicketDocumentsDocument };
  };

  return { read };
}

export const TicketDocumentsClient = Object.freeze({ create });
