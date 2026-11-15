/**
 * The page's session, bought as the Bridge buys its own: a holder of Gaia's token asks `POST /api/session-codes` for a one-time code, and
 * the page spends it at `POST /api/session` for the session cookie. The code travels only in a JSON body, never in an address.
 */
import type { SessionCodes } from '../../../lib/local-http-guards/SessionCodes.ts';
import { PRODUCT_NAMES }     from '../../../shared/constants/ProductNames.ts';
import { refusalAnswerOf }   from '../RefusalAnswer.ts';

const HTTP_NO_CONTENT = 204;

const CODE_KEY = 'code';

/** The name carries the port, because a cookie on 127.0.0.1 reaches every port of it. */
export function sessionCookieNameFor(port: number): string {
  return `${PRODUCT_NAMES.programName}-session-${port}`;
}

export function sessionCodeAnswerOf(sessionCodes: SessionCodes): Response {
  return Response.json({ code: sessionCodes.issueCode() }, { headers: { 'cache-control': 'no-store' } });
}

async function offeredCodeIn(request: Request): Promise<string | null> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !Object.hasOwn(parsed, CODE_KEY)) return null;
  const { code } = parsed as { readonly code: unknown };
  return typeof code === 'string' ? code : null;
}

export async function sessionExchangeAnswerFor(request: Request, sessionCodes: SessionCodes): Promise<Response> {
  const code = await offeredCodeIn(request);
  if (code === null) return refusalAnswerOf('body-not-understood');
  const exchange = sessionCodes.exchangeCode(code);
  if (exchange.verdict === 'refused') return refusalAnswerOf('code-refused');
  return new Response(null, { status: HTTP_NO_CONTENT, headers: { 'set-cookie': exchange.setCookieHeader, 'cache-control': 'no-store' } });
}
