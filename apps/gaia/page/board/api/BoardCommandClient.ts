/**
 * Posts one board command to Gaia's relay of a forge (`POST /api/v1/forges/<trackerId>/commands`) with the page's session, and reads Gaia's
 * answer into how the command ended. A refusal is the forge's sentence, which the board shows verbatim and never words itself; `install-held`
 * means launches are held for an install change. The client holds no token: Gaia's server alone speaks to the forge.
 */
import { PAGE_CONTRACT_VERSIONS }                                     from '../../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }                                        from '../../../src/shared/utils/ContractVersionUtil.ts';
import type { BoardCommandDocument }                                  from '../../@types/board/BoardCommandDocument.ts';
import type { BoardCommandAnswerDocument }                            from '../../@types/board/BoardRelayDocuments.ts';
import { BoardApiPaths }                                              from './BoardApiPaths.ts';
import { forgeRefusalFactsOf, refusalTextOf, type ForgeRefusalFacts } from './RefusalOf.ts';
import {
  BROWSER_RELAY_REQUEST_SENDER,
  jsonBodyOf,
  relayResponseOf,
  type RelayRequestSender
} from './RelayRequest.ts';
import { HTTP_STATUS } from './constants/HttpStatus.ts';

/** What an applied command made: the product owner an intake started, or the version a ticket document's save left at the head. */
export interface BoardCommandResult {
  readonly startedJobId:         string | null;
  readonly writtenVersionNumber: number | null;
}

export type CommandOutcome =
  | { readonly verdict: 'applied'; readonly outcome: 'done' | 'nothing-to-do'; readonly result: BoardCommandResult }
  /** `forgeRefusal` is the forge's code and facts when the forge refused, for a view that offers a way past it. */
  | { readonly verdict: 'refused'; readonly refusal: string; readonly forgeRefusal?: ForgeRefusalFacts }
  | { readonly verdict: 'install-held'; readonly refusal: string }
  | { readonly verdict: 'unreachable' }
  /** The command was sent, so the forge may have applied it, but no answer came back: a resend could apply it twice. */
  | { readonly verdict: 'outcome-unknown' }
  /** Gaia's server answered 401: it no longer knows this window's session. */
  | { readonly verdict: 'no-session' };

export interface BoardCommandClient {
  readonly send: (command: BoardCommandDocument) => Promise<CommandOutcome>;
}

const ANSWER_VERSION_KEYS = { majorKey: 'boardCommandAnswerVersion' } as const;

/** Gaia's answer at the known version, or `null` for anything else. */
function answerDocumentOf(body: unknown): BoardCommandAnswerDocument | null {
  if (ContractVersionUtil.readMajorOf(body, ANSWER_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaBoardCommandAnswer) === null) return null;
  return typeof (body as { readonly outcome?: unknown }).outcome === 'string' ? body as BoardCommandAnswerDocument : null;
}

function appliedOutcomeOf(applied: BoardCommandAnswerDocument['applied']): CommandOutcome | null {
  if (applied === null || typeof applied !== 'object') return null;
  if (applied.outcome !== 'done' && applied.outcome !== 'nothing-to-do') return null;
  const startedJobId = typeof applied.startedJobId === 'string' ? applied.startedJobId : null;
  const writtenVersionNumber = Number.isSafeInteger(applied.writtenVersionNumber) ? applied.writtenVersionNumber : null;
  return { verdict: 'applied', outcome: applied.outcome, result: { startedJobId, writtenVersionNumber } };
}

function outcomeOfAnswer(answer: BoardCommandAnswerDocument): CommandOutcome | null {
  switch (answer.outcome) {
    case 'applied':
      return appliedOutcomeOf(answer.applied);
    case 'refused': {
      const refusal = refusalTextOf(answer.refusal);
      const forgeRefusal = forgeRefusalFactsOf(answer.refusal);
      if (refusal === null) return null;
      return forgeRefusal === null ? { verdict: 'refused', refusal } : { verdict: 'refused', refusal, forgeRefusal };
    }
    case 'install-held': {
      const refusal = refusalTextOf(answer.refusal);
      return refusal === null ? null : { verdict: 'install-held', refusal };
    }
    case 'unreachable':
      return { verdict: 'unreachable' };
    case 'outcome-unknown':
      return { verdict: 'outcome-unknown' };
    default:
      return null;
  }
}

function create(trackerId: string, sendRequest: RelayRequestSender = BROWSER_RELAY_REQUEST_SENDER): BoardCommandClient {
  const send = async (command: BoardCommandDocument): Promise<CommandOutcome> => {
    const answered = await relayResponseOf(sendRequest, BoardApiPaths.commandsPathOf(trackerId), {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(command),
    });
    if (answered.verdict === 'unreachable') return { verdict: 'unreachable' };
    const { response } = answered;
    if (response.status === HTTP_STATUS.UNAUTHORIZED) return { verdict: 'no-session' };
    const answer = answerDocumentOf(await jsonBodyOf(response));
    const outcome = answer === null ? null : outcomeOfAnswer(answer);
    // An answer this page cannot read after a 200 may stand for an applied command, so it is never read as nothing having happened.
    if (outcome === null) return response.status === HTTP_STATUS.OK ? { verdict: 'outcome-unknown' } : { verdict: 'unreachable' };
    return outcome;
  };

  return { send };
}

export const BoardCommandClient = Object.freeze({ create });
