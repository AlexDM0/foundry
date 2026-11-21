/**
 * Reads a forge's board through Gaia's relay (`GET /api/v1/forges/<trackerId>/board`) with the page's session. The board stream's events
 * carry no part of the board, so the page reads it here once at the start and again after each `board-changed`.
 */
import { PAGE_CONTRACT_VERSIONS } from '../../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }    from '../../../src/shared/utils/ContractVersionUtil.ts';
import type { BoardDocument }     from '../../@types/board/BoardDocument.ts';
import type { BoardRelayRefusal } from '../../@types/board/BoardRelayDocuments.ts';
import { BoardApiPaths }          from './BoardApiPaths.ts';
import {
  BROWSER_RELAY_REQUEST_SENDER,
  jsonBodyOf,
  relayResponseOf,
  type RelayRequestSender
} from './RelayRequest.ts';
import { HTTP_STATUS } from './constants/HttpStatus.ts';

/**
 * `refused`: Gaia's refusal, such as a forge that does not answer; `unreadable`: an answer of another version or none this page reads, as
 * after Gaia was updated under an open page; `no-session`: Gaia's server no longer knows this window's session.
 */
export type BoardRead =
  | { readonly verdict: 'read'; readonly board: BoardDocument }
  | { readonly verdict: 'refused'; readonly refusal: BoardRelayRefusal }
  | { readonly verdict: 'unreadable' }
  | { readonly verdict: 'unreachable' }
  | { readonly verdict: 'no-session' };

export interface BoardReadClient {
  readonly read: () => Promise<BoardRead>;
}

const BOARD_VERSION_KEYS = { majorKey: 'boardVersion' } as const;

function relayRefusalOf(body: unknown): BoardRelayRefusal | null {
  if (typeof body !== 'object' || body === null) return null;
  const { refusedBy, refusal } = body as Readonly<Record<string, unknown>>;
  return refusedBy === 'gaia' && typeof refusal === 'string' ? refusal as BoardRelayRefusal : null;
}

function create(trackerId: string, sendRequest: RelayRequestSender = BROWSER_RELAY_REQUEST_SENDER): BoardReadClient {
  const read = async (): Promise<BoardRead> => {
    const answered = await relayResponseOf(sendRequest, BoardApiPaths.boardPathOf(trackerId), { method: 'GET' });
    if (answered.verdict === 'unreachable') return { verdict: 'unreachable' };
    const { response } = answered;
    if (response.status === HTTP_STATUS.UNAUTHORIZED) return { verdict: 'no-session' };
    const body = await jsonBodyOf(response);
    if (response.status !== HTTP_STATUS.OK) {
      const refusal = relayRefusalOf(body);
      return refusal === null ? { verdict: 'unreadable' } : { verdict: 'refused', refusal };
    }
    return ContractVersionUtil.readMajorOf(body, BOARD_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaBoard) === null
      ? { verdict: 'unreadable' }
      : { verdict: 'read', board: body as BoardDocument };
  };

  return { read };
}

export const BoardReadClient = Object.freeze({ create });
