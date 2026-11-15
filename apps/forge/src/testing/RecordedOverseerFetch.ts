/**
 * The Overseer HTTP API of a default spec: `createRecordedOverseerFetch` gives a `fetch` that answers only with what the real
 * `OverseerServer` answered, which its real-system specs record under `bun run record src/services/overseer/OverseerServer.ts`. A request
 * with no recorded answer fails the case. It refuses what the real server refuses: a Host that is not loopback, an Origin that is not its
 * own, a data route with no session cookie and no token, a spent session code, another token, and a request when nothing listens.
 * DOM-safe, so a Bridge spec may use it: `src/testing/RecordedOverseerAnswers.ts` reads the recording.
 */
export const OVERSEER_BOUNDARY = 'src/services/overseer/OverseerServer.ts';

/** The call shapes the real-system specs record, each named for the request and the state it was sent in. */
export const OVERSEER_CALL_SHAPES = {
  IDENTITY:                   'GET api/identity',
  SESSION_TOKEN:              'GET api/session-token, with the session cookie',
  SESSION_TOKEN_NO_SESSION:   'GET api/session-token, with no session cookie and no token',
  STATE:                      'GET api/state, with the token',
  STATE_NO_SESSION:           'GET api/state, with no session cookie and no token',
  SESSION_CODE:               'POST api/session-codes, with the token',
  SESSION_CODE_NO_TOKEN:      'POST api/session-codes, with no token',
  SESSION_EXCHANGE:           'POST api/session, a code not spent',
  SESSION_EXCHANGE_SPENT:     'POST api/session, a code already spent',
  COMMAND_APPLIED:            'POST api/commands, with the token, the command applied',
  COMMAND_REFUSED:            'POST api/commands, with the token, the command refused',
  COMMAND_INSTALL_HELD:       'POST api/commands, with the token, the route answering 423 for an install change',
  COMMAND_WITH_ANOTHER_TOKEN: 'POST api/commands, with another token',
  PICTURE_UPLOADED:           'POST api/pictures, with the token, a picture of an accepted type',
  PICTURE_TOO_LARGE:          'POST api/pictures, with the token, a picture over the size limit',
  PICTURE_TYPE_UNSUPPORTED:   'POST api/pictures, with the token, bytes of no accepted type',
  PICTURE_WITH_ANOTHER_TOKEN: 'POST api/pictures, with another token',
  NUDGE:                      'POST api/nudge',
  FOREIGN_HOST:               'any request, a Host that is not loopback',
  FOREIGN_ORIGIN:             'any request, an Origin that is not own',
  NOTHING_LISTENS:            'any request, nothing listens on the port',
  PORT_TAKEN:                 'start on a given port, another server listens there',
} as const;

export type OverseerCallShape = typeof OVERSEER_CALL_SHAPES[keyof typeof OVERSEER_CALL_SHAPES];

/** The places a recorded answer holds for a value of the run it was recorded in, which the mock fills with its own. */
export const OVERSEER_PLACEHOLDERS = {
  PORT:           '<port>',
  TOKEN:          '<token>',
  SESSION_CODE:   '<session code>',
  SESSION_SECRET: '<session secret>',
  STAMP:          '<stamp>',
} as const;

/** The headers a client reads of an answer. */
export const RECORDED_RESPONSE_HEADERS = ['content-type', 'set-cookie'] as const;

export interface RecordedHttpResponse {
  readonly status:  number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body:    unknown;
}

/** The part of a real response the recording reads, which a cloned one satisfies too. */
export interface AnsweredResponse {
  readonly status:  number;
  readonly headers: { get: (name: string) => string | null };
  readonly text:    () => Promise<string>;
}

/** What `fetch` throws when nothing listens on the port. */
export interface RecordedFetchFailure {
  readonly name:    string;
  readonly code:    string;
  readonly message: string;
}

/** What `OverseerServer.start` refuses with when the given port is taken. */
export interface RecordedPortRefusal {
  readonly status: string;
  readonly detail: unknown;
}

export type CommandVerdict = 'applied' | 'refused' | 'install-held';

export type PictureUploadVerdict = 'uploaded' | 'too-large' | 'type-unsupported';

/** One request the mock was sent, with the call shape it answered or null when no recorded answer fits it. */
export interface RecordedOverseerRequest {
  readonly method:        string;
  readonly path:          string;
  readonly authorization: string | null;
  readonly init:          RequestInit | undefined;
  readonly callShape:     OverseerCallShape | null;
}

export interface RecordedOverseer {
  readonly fetch:               (input: string | URL, init?: RequestInit) => Promise<Response>;
  /** The base URL the mock listens on, `http://127.0.0.1:<port>/`; a relative path is a request of the page it serves. */
  readonly url:                 string;
  readonly port:                number;
  readonly requests:            readonly RecordedOverseerRequest[];
  /** The token the next request must carry, as an Overseer start rotates it. */
  readonly rotateToken:         (token: string) => void;
  readonly answerCommandsWith:  (verdict: CommandVerdict) => void;
  /** The real route decides from the bytes; the mock answers the verdict it was told, `uploaded` until then. */
  readonly answerPicturesWith:  (verdict: PictureUploadVerdict) => void;
  /** The page's cookie jar: true once a code was exchanged, or when the spec starts with a session. */
  readonly holdsSessionCookie:  () => boolean;
  readonly forgetSessionCookie: () => void;
  /** A code `POST api/session-codes` would give; it buys one session cookie, once. */
  readonly issueSessionCode:    () => string;
  /** From now on nothing listens on the port. */
  readonly stop:                () => void;
  /** Throws the recorded refusal when `port` is the mock's own, as the real server refuses a taken port. */
  readonly startOnGivenPort:    (port: number) => void;
  /** Each request that had no recorded answer since the last take, described; the list is then empty. */
  readonly takeUnansweredCalls: () => string[];
}

export interface RecordedOverseerOptions {
  readonly token?:              string;
  readonly holdsSessionCookie?: boolean;
  readonly port?:               number;
}

const RECORD_COMMAND = `bun run record ${OVERSEER_BOUNDARY}`;
const EXAMPLE_PORT = 4801;
const EXAMPLE_TOKEN = 'example-token';
const EXAMPLE_SESSION_SECRET = 'example-session-secret';
const EXAMPLE_STAMP = '2026-01-01T00:00:00+00:00';
const LOOPBACK_NAMES = ['127.0.0.1', 'localhost'];
const BEARER_PREFIX = 'Bearer ';
const SESSION_CODE_RADIX = 16;
const SESSION_CODE_FIRST = 0xa0b1c2d3;

const PICTURE_SHAPE_OF_VERDICT: Readonly<Record<PictureUploadVerdict, OverseerCallShape>> = {
  'uploaded':         OVERSEER_CALL_SHAPES.PICTURE_UPLOADED,
  'too-large':        OVERSEER_CALL_SHAPES.PICTURE_TOO_LARGE,
  'type-unsupported': OVERSEER_CALL_SHAPES.PICTURE_TYPE_UNSUPPORTED,
};

const COMMAND_SHAPE_OF_VERDICT: Readonly<Record<CommandVerdict, OverseerCallShape>> = {
  'applied':      OVERSEER_CALL_SHAPES.COMMAND_APPLIED,
  'refused':      OVERSEER_CALL_SHAPES.COMMAND_REFUSED,
  'install-held': OVERSEER_CALL_SHAPES.COMMAND_INSTALL_HELD,
};

/** A real response as the recording keeps it: the run's own values given as `replacements`, value first, are put back as placeholders. */
export async function recordedHttpResponseOf(response: AnsweredResponse, replacements: readonly (readonly [string, string])[]): Promise<RecordedHttpResponse> {
  const asRecorded = (text: string): string => replacements.reduce((replaced, [value, placeholder]) => replaced.replaceAll(value, placeholder), text);
  const headers: Record<string, string> = {};
  for (const name of RECORDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = asRecorded(value);
  }
  const text = asRecorded(await response.text());
  const isJson = (response.headers.get('content-type') ?? '').includes('json');
  return { status: response.status, headers, body: isJson ? JSON.parse(text) as unknown : text };
}

function requestOf(init: RequestInit | undefined):{ method: string; headers: Headers } {
  return { method: (init?.method ?? 'GET').toUpperCase(), headers: new Headers(init?.headers) };
}

/** `answers` are this OS's recording, which `src/testing/RecordedOverseerAnswers.ts` reads, unless a spec of the mock gives others. */
export function createRecordedOverseerFetch(answers: ReadonlyMap<string, unknown>, options: RecordedOverseerOptions = {}): RecordedOverseer {
  const port = options.port ?? EXAMPLE_PORT;
  const url = `http://127.0.0.1:${port}/`;
  const ownOrigins = LOOPBACK_NAMES.map((name) => `http://${name}:${port}`);
  const requests: RecordedOverseerRequest[] = [];
  const unansweredCalls: string[] = [];
  const unspentCodes = new Set<string>();
  let token = options.token ?? EXAMPLE_TOKEN;
  let sessionCookieHeld = options.holdsSessionCookie ?? false;
  let commandVerdict: CommandVerdict = 'applied';
  let pictureVerdict: PictureUploadVerdict = 'uploaded';
  let listening = true;
  let issuedCodeCount = 0;
  let lastIssuedCode = '';

  const answerOf = <Answer>(callShape: string): Answer => {
    const answer = answers.get(callShape);
    if (answer === undefined) {
      const unanswered = `${callShape} has no recorded answer: run \`${RECORD_COMMAND}\``;
      unansweredCalls.push(unanswered);
      throw new Error(unanswered);
    }
    return answer as Answer;
  };

  const issueSessionCode = (): string => {
    lastIssuedCode = (SESSION_CODE_FIRST + issuedCodeCount).toString(SESSION_CODE_RADIX);
    issuedCodeCount += 1;
    unspentCodes.add(lastIssuedCode);
    return lastIssuedCode;
  };

  const filled = (text: string): string => text
    .replaceAll(OVERSEER_PLACEHOLDERS.PORT, String(port))
    .replaceAll(OVERSEER_PLACEHOLDERS.TOKEN, token)
    .replaceAll(OVERSEER_PLACEHOLDERS.SESSION_CODE, lastIssuedCode)
    .replaceAll(OVERSEER_PLACEHOLDERS.SESSION_SECRET, EXAMPLE_SESSION_SECRET)
    .replaceAll(OVERSEER_PLACEHOLDERS.STAMP, EXAMPLE_STAMP);

  const responseOf = (callShape: OverseerCallShape): Response => {
    const recorded = answerOf<RecordedHttpResponse>(callShape);
    const headers = new Headers();
    for (const [name, value] of Object.entries(recorded.headers)) headers.set(name, filled(value));
    const body = typeof recorded.body === 'string' ? recorded.body : JSON.stringify(recorded.body);
    return new Response(filled(body), { status: recorded.status, headers });
  };

  const bearerMatches = (headers: Headers): boolean => headers.get('authorization') === `${BEARER_PREFIX}${token}`;

  /** A page request, a relative path, carries the jar's cookie unless told to omit it; a process's own `fetch` keeps no jar. */
  const sendsSessionCookie = (input: string | URL, init: RequestInit | undefined): boolean =>
    sessionCookieHeld && typeof input === 'string' && input.startsWith('/') && init?.credentials !== 'omit';

  const codeIn = (body: RequestInit['body']): unknown => {
    try {
      return (JSON.parse(typeof body === 'string' ? body : '') as { code?: unknown }).code;
    } catch {
      return undefined;
    }
  };

  const routedShapeOf = (input: string | URL, init: RequestInit | undefined, method: string, pathname: string, headers: Headers): OverseerCallShape | null => {
    const readerIsAuthorized = sendsSessionCookie(input, init) || bearerMatches(headers);
    if (method === 'GET' && pathname === '/api/identity') return OVERSEER_CALL_SHAPES.IDENTITY;
    if (method === 'GET' && pathname === '/api/session-token') return readerIsAuthorized ? OVERSEER_CALL_SHAPES.SESSION_TOKEN : OVERSEER_CALL_SHAPES.SESSION_TOKEN_NO_SESSION;
    if (method === 'GET' && pathname === '/api/state') return readerIsAuthorized ? OVERSEER_CALL_SHAPES.STATE : OVERSEER_CALL_SHAPES.STATE_NO_SESSION;
    if (method === 'POST' && pathname === '/api/nudge') return OVERSEER_CALL_SHAPES.NUDGE;
    if (method === 'POST' && pathname === '/api/session-codes') {
      if (!bearerMatches(headers)) return OVERSEER_CALL_SHAPES.SESSION_CODE_NO_TOKEN;
      issueSessionCode();
      return OVERSEER_CALL_SHAPES.SESSION_CODE;
    }
    if (method === 'POST' && pathname === '/api/session') {
      const code = codeIn(init?.body);
      if (typeof code !== 'string' || !unspentCodes.delete(code)) return OVERSEER_CALL_SHAPES.SESSION_EXCHANGE_SPENT;
      sessionCookieHeld = true;
      return OVERSEER_CALL_SHAPES.SESSION_EXCHANGE;
    }
    if (method === 'POST' && pathname === '/api/commands') {
      return bearerMatches(headers) ? COMMAND_SHAPE_OF_VERDICT[commandVerdict] : OVERSEER_CALL_SHAPES.COMMAND_WITH_ANOTHER_TOKEN;
    }
    if (method === 'POST' && pathname === '/api/pictures') {
      return bearerMatches(headers) ? PICTURE_SHAPE_OF_VERDICT[pictureVerdict] : OVERSEER_CALL_SHAPES.PICTURE_WITH_ANOTHER_TOKEN;
    }
    return null;
  };

  const failureWhenNothingListens = (): Error => {
    const failure = answerOf<RecordedFetchFailure>(OVERSEER_CALL_SHAPES.NOTHING_LISTENS);
    return Object.assign(new TypeError(failure.message), { code: failure.code });
  };

  const fetchOf = (input: string | URL, init?: RequestInit): Promise<Response> => {
    const target = new URL(input, url);
    const { method, headers } = requestOf(init);
    const request = {
      method, path: typeof input === 'string' ? input : input.href, authorization: headers.get('authorization'), init
    };
    try {
      if (!listening || target.origin !== new URL(url).origin) {
        requests.push({ ...request, callShape: OVERSEER_CALL_SHAPES.NOTHING_LISTENS });
        return Promise.reject(failureWhenNothingListens());
      }
      const host = headers.get('host');
      const origin = headers.get('origin');
      let callShape: OverseerCallShape | null;
      if (host !== null && !LOOPBACK_NAMES.some((name) => host === `${name}:${port}`)) callShape = OVERSEER_CALL_SHAPES.FOREIGN_HOST;
      else if ((origin !== null && !ownOrigins.includes(origin)) || method === 'OPTIONS') callShape = OVERSEER_CALL_SHAPES.FOREIGN_ORIGIN;
      else callShape = routedShapeOf(input, init, method, target.pathname, headers);
      requests.push({ ...request, callShape });
      if (callShape === null) {
        const unanswered = `${method} ${target.pathname} has no recorded answer: run \`${RECORD_COMMAND}\``;
        unansweredCalls.push(unanswered);
        return Promise.reject(new Error(unanswered));
      }
      return Promise.resolve(responseOf(callShape));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return {
    fetch:       fetchOf,
    url,
    port,
    requests,
    rotateToken: (nextToken) => {
      token = nextToken;
    },
    answerCommandsWith: (verdict) => {
      commandVerdict = verdict;
    },
    answerPicturesWith: (verdict) => {
      pictureVerdict = verdict;
    },
    holdsSessionCookie:  () => sessionCookieHeld,
    forgetSessionCookie: () => {
      sessionCookieHeld = false;
    },
    issueSessionCode,
    stop: () => {
      listening = false;
    },
    startOnGivenPort: (givenPort) => {
      if (givenPort !== port || !listening) return;
      const refusal = answerOf<RecordedPortRefusal>(OVERSEER_CALL_SHAPES.PORT_TAKEN);
      throw Object.assign(new Error(`${refusal.status}: ${JSON.stringify(refusal.detail)}`), refusal);
    },
    takeUnansweredCalls: () => unansweredCalls.splice(0),
  };
}
