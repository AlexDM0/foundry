/**
 * The page's session, bought as the Bridge buys its own: a holder of Gaia's token asks `POST /api/session-codes` for a one-time code, and
 * the page spends it at `POST /api/session` for the session cookie. The code travels only in a JSON body, never in an address.
 */
import { JsonValueUtil }     from '../../../lib/json-value/JsonValueUtil.ts';
import { BoundedBody }       from '../../../lib/local-http-guards/BoundedBody.ts';
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

function offeredCodeIn(bodyText: string): string | null {
  const parsing = JsonValueUtil.parsedValueOf(bodyText);
  const body = parsing === null ? null : JsonValueUtil.jsonObjectOf(parsing.parsed);
  const code = body === null ? undefined : JsonValueUtil.ownValueOf(body, CODE_KEY);
  return typeof code === 'string' ? code : null;
}

export async function sessionExchangeAnswerFor(request: Request, sessionCodes: SessionCodes, maximumBodyBytes: number): Promise<Response> {
  const body = await BoundedBody.boundedTextOf(request, maximumBodyBytes);
  if (body.verdict === 'too-large') return refusalAnswerOf('body-too-large');
  const code = offeredCodeIn(body.text);
  if (code === null) return refusalAnswerOf('body-not-understood');
  const exchange = sessionCodes.exchangeCode(code);
  if (exchange.verdict === 'refused') return refusalAnswerOf('code-refused');
  return new Response(null, { status: HTTP_NO_CONTENT, headers: { 'set-cookie': exchange.setCookieHeader, 'cache-control': 'no-store' } });
}
