/**
 * Asks Gaia's server for one crash log of a forge that serves again (`GET /api/v1/forges/<trackerId>/crash-logs/<number>`) and reads its
 * answer at the known `crashLogVersion`. A forge that does not answer, the one off after a crash included, is refused by the server.
 */
import { ApiPathUtil }            from '../../../src/lib/api-paths/ApiPathUtil.ts';
import { GAIA_ENDPOINT_VERSIONS } from '../../../src/shared/constants/GaiaSystemVersions.ts';
import { PAGE_CONTRACT_VERSIONS } from '../../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }    from '../../../src/shared/utils/ContractVersionUtil.ts';
import type { CrashLogDocument }  from '../../@types/CrashLogDocument.ts';

export type CrashLogResult =
  | { readonly verdict: 'read'; readonly crashLog: CrashLogDocument }
  | { readonly verdict: 'not-read'; readonly status: number | null };

export type CrashLogRequestSender = (path: string, requestOptions: RequestInit) => Promise<Response>;

const CRASH_LOG_VERSION_KEYS = { majorKey: 'crashLogVersion' } as const;

const SUCCESS_STATUS = 200;

function crashLogPathOf(trackerId: string, crashLogNumber: number): string {
  return ApiPathUtil.versionedPathOf(`forges/${encodeURIComponent(trackerId)}/crash-logs/${crashLogNumber}`, GAIA_ENDPOINT_VERSIONS.forgeCrashLog);
}

/** The server and the page ship together, so the known version vouches for the shape. */
function crashLogDocumentOf(body: unknown): CrashLogDocument | null {
  if (typeof body !== 'object' || body === null) return null;
  return ContractVersionUtil.readMajorOf(body, CRASH_LOG_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaCrashLog) === null ? null : body as CrashLogDocument;
}

async function requestCrashLog(sendRequest: CrashLogRequestSender, trackerId: string, crashLogNumber: number): Promise<CrashLogResult> {
  let response: Response;
  try {
    response = await sendRequest(crashLogPathOf(trackerId, crashLogNumber), { method: 'GET', credentials: 'same-origin' });
  } catch {
    return { verdict: 'not-read', status: null };
  }
  if (response.status !== SUCCESS_STATUS) return { verdict: 'not-read', status: response.status };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { verdict: 'not-read', status: response.status };
  }
  const crashLog = crashLogDocumentOf(body);
  return crashLog === null ? { verdict: 'not-read', status: response.status } : { verdict: 'read', crashLog };
}

export const CrashLogRequest = {
  crashLogPathOf,
  requestCrashLog,
} as const;
