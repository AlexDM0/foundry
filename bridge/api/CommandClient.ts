/**
 * Posts a `ControlCommand` to `/api/commands` with the session token its `SessionTokenSource` holds, retried once after a 401. A refusal is
 * the Overseer's worded sentence, which the Bridge shows verbatim and never words itself; a 423 means launches are held for an install change.
 */
import { refusalOf }                              from './RefusalOf.ts';
import { SessionTokenSource, type FetchFunction } from './SessionTokenSource.ts';
import { HTTP_STATUS }                            from './constants/HttpStatus.ts';

export interface ControlCommandBody {
  readonly kind:            string;
  readonly [field: string]: unknown;
}

export type CommandOutcome =
  | { readonly verdict: 'applied'; readonly outcome: unknown; readonly result: unknown }
  | { readonly verdict: 'refused'; readonly refusal: string }
  | { readonly verdict: 'install-held'; readonly refusal: string }
  | { readonly verdict: 'unreachable' }
  /** `/api/session-token` answered 401: the page's session cookie is unknown to the Overseer. */
  | { readonly verdict: 'no-session' };

export interface CommandClient {
  readonly send: (command: ControlCommandBody) => Promise<CommandOutcome>;
}

const COMMANDS_PATH = '/api/commands';

/** A picture client given the same token source shares its token, so one rotation is fetched once. */
function create(
  fetchOf: FetchFunction = (input, init) => fetch(input, init),
  tokenSource: SessionTokenSource = SessionTokenSource.create(fetchOf),
): CommandClient {
  const send = async (command: ControlCommandBody): Promise<CommandOutcome> => {
    const posted = await tokenSource.post(COMMANDS_PATH, { 'content-type': 'application/json' }, JSON.stringify(command));
    if (posted.verdict !== 'answered') return { verdict: posted.verdict };
    const { response } = posted;
    try {
      if (response.status === HTTP_STATUS.OK) {
        const body = await response.json() as { outcome?: unknown; result?: unknown };
        return { verdict: 'applied', outcome: body.outcome, result: body.result };
      }
      if (response.status === HTTP_STATUS.LOCKED) return { verdict: 'install-held', refusal: await refusalOf(response) };
      return { verdict: 'refused', refusal: await refusalOf(response) };
    } catch {
      return { verdict: 'unreachable' };
    }
  };

  return { send };
}

export const CommandClient = Object.freeze({ create });
