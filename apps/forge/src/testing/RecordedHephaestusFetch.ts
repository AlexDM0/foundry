/**
 * The Hephaestus HTTP API of a default spec: `createRecordedHephaestusFetch` gives a `fetch` that answers only with what the real
 * `HephaestusServer` answered, which its real-system specs record under `bun run record src/services/hephaestus/HephaestusServer.ts`. A request
 * with no recorded answer fails the case. It refuses what the real server refuses: a Host that is not loopback, an Origin that is not its
 * own, a data route with no token, another token, and a request when nothing listens.
 * `src/testing/RecordedHephaestusAnswers.ts` reads the recording.
 */
export const HEPHAESTUS_BOUNDARY = 'src/services/hephaestus/HephaestusServer.ts';

/** The call shapes the real-system specs record, each named for the request and the state it was sent in. */
export const HEPHAESTUS_CALL_SHAPES = {
  IDENTITY:                   'GET api/identity',
  STATE:                      'GET api/state, with the token',
  STATE_NO_TOKEN:             'GET api/state, with no token',
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

export type HephaestusCallShape = typeof HEPHAESTUS_CALL_SHAPES[keyof typeof HEPHAESTUS_CALL_SHAPES];

/** The places a recorded answer holds for a value of the run it was recorded in, which the mock fills with its own. */
export const HEPHAESTUS_PLACEHOLDERS = {
  PORT:  '<port>',
  TOKEN: '<token>',
  STAMP: '<stamp>',
} as const;

/** The headers a client reads of an answer. */
export const RECORDED_RESPONSE_HEADERS = ['content-type'] as const;

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

/** What `HephaestusServer.start` refuses with when the given port is taken. */
export interface RecordedPortRefusal {
  readonly status: string;
  readonly detail: unknown;
}

export type CommandVerdict = 'applied' | 'refused' | 'install-held';

export type PictureUploadVerdict = 'uploaded' | 'too-large' | 'type-unsupported';

/** One request the mock was sent, with the call shape it answered or null when no recorded answer fits it. */
export interface RecordedHephaestusRequest {
  readonly method:        string;
  readonly path:          string;
  readonly authorization: string | null;
  readonly init:          RequestInit | undefined;
  readonly callShape:     HephaestusCallShape | null;
}

export interface RecordedHephaestus {
  readonly fetch:               (input: string | URL, init?: RequestInit) => Promise<Response>;
  /** The base URL the mock listens on, `http://127.0.0.1:<port>/`. */
  readonly url:                 string;
  readonly port:                number;
  readonly requests:            readonly RecordedHephaestusRequest[];
  /** The token the next request must carry, as a Hephaestus start rotates it. */
  readonly rotateToken:         (token: string) => void;
  readonly answerCommandsWith:  (verdict: CommandVerdict) => void;
  /** The real route decides from the bytes; the mock answers the verdict it was told, `uploaded` until then. */
  readonly answerPicturesWith:  (verdict: PictureUploadVerdict) => void;
  /** From now on nothing listens on the port. */
  readonly stop:                () => void;
  /** Throws the recorded refusal when `port` is the mock's own, as the real server refuses a taken port. */
  readonly startOnGivenPort:    (port: number) => void;
  /** Each request that had no recorded answer since the last take, described; the list is then empty. */
  readonly takeUnansweredCalls: () => string[];
}

export interface RecordedHephaestusOptions {
  readonly token?: string;
  readonly port?:  number;
}

const RECORD_COMMAND = `bun run record ${HEPHAESTUS_BOUNDARY}`;
const EXAMPLE_PORT = 4801;
const EXAMPLE_TOKEN = 'example-token';
const EXAMPLE_STAMP = '2026-01-01T00:00:00+00:00';
const LOOPBACK_NAMES = ['127.0.0.1', 'localhost'];
const BEARER_PREFIX = 'Bearer ';

const PICTURE_SHAPE_OF_VERDICT: Readonly<Record<PictureUploadVerdict, HephaestusCallShape>> = {
  'uploaded':         HEPHAESTUS_CALL_SHAPES.PICTURE_UPLOADED,
  'too-large':        HEPHAESTUS_CALL_SHAPES.PICTURE_TOO_LARGE,
  'type-unsupported': HEPHAESTUS_CALL_SHAPES.PICTURE_TYPE_UNSUPPORTED,
};

const COMMAND_SHAPE_OF_VERDICT: Readonly<Record<CommandVerdict, HephaestusCallShape>> = {
  'applied':      HEPHAESTUS_CALL_SHAPES.COMMAND_APPLIED,
  'refused':      HEPHAESTUS_CALL_SHAPES.COMMAND_REFUSED,
  'install-held': HEPHAESTUS_CALL_SHAPES.COMMAND_INSTALL_HELD,
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

/** `answers` are this OS's recording, which `src/testing/RecordedHephaestusAnswers.ts` reads, unless a spec of the mock gives others. */
export function createRecordedHephaestusFetch(answers: ReadonlyMap<string, unknown>, options: RecordedHephaestusOptions = {}): RecordedHephaestus {
  const port = options.port ?? EXAMPLE_PORT;
  const url = `http://127.0.0.1:${port}/`;
  const ownOrigins = LOOPBACK_NAMES.map((name) => `http://${name}:${port}`);
  const requests: RecordedHephaestusRequest[] = [];
  const unansweredCalls: string[] = [];
  let token = options.token ?? EXAMPLE_TOKEN;
  let commandVerdict: CommandVerdict = 'applied';
  let pictureVerdict: PictureUploadVerdict = 'uploaded';
  let listening = true;

  const answerOf = <Answer>(callShape: string): Answer => {
    const answer = answers.get(callShape);
    if (answer === undefined) {
      const unanswered = `${callShape} has no recorded answer: run \`${RECORD_COMMAND}\``;
      unansweredCalls.push(unanswered);
      throw new Error(unanswered);
    }
    return answer as Answer;
  };

  const filled = (text: string): string => text
    .replaceAll(HEPHAESTUS_PLACEHOLDERS.PORT, String(port))
    .replaceAll(HEPHAESTUS_PLACEHOLDERS.TOKEN, token)
    .replaceAll(HEPHAESTUS_PLACEHOLDERS.STAMP, EXAMPLE_STAMP);

  const responseOf = (callShape: HephaestusCallShape): Response => {
    const recorded = answerOf<RecordedHttpResponse>(callShape);
    const headers = new Headers();
    for (const [name, value] of Object.entries(recorded.headers)) headers.set(name, filled(value));
    const body = typeof recorded.body === 'string' ? recorded.body : JSON.stringify(recorded.body);
    return new Response(filled(body), { status: recorded.status, headers });
  };

  const bearerMatches = (headers: Headers): boolean => headers.get('authorization') === `${BEARER_PREFIX}${token}`;

  const routedShapeOf = (method: string, pathname: string, headers: Headers): HephaestusCallShape | null => {
    if (method === 'GET' && pathname === '/api/identity') return HEPHAESTUS_CALL_SHAPES.IDENTITY;
    if (method === 'GET' && pathname === '/api/state') return bearerMatches(headers) ? HEPHAESTUS_CALL_SHAPES.STATE : HEPHAESTUS_CALL_SHAPES.STATE_NO_TOKEN;
    if (method === 'POST' && pathname === '/api/nudge') return HEPHAESTUS_CALL_SHAPES.NUDGE;
    if (method === 'POST' && pathname === '/api/commands') {
      return bearerMatches(headers) ? COMMAND_SHAPE_OF_VERDICT[commandVerdict] : HEPHAESTUS_CALL_SHAPES.COMMAND_WITH_ANOTHER_TOKEN;
    }
    if (method === 'POST' && pathname === '/api/pictures') {
      return bearerMatches(headers) ? PICTURE_SHAPE_OF_VERDICT[pictureVerdict] : HEPHAESTUS_CALL_SHAPES.PICTURE_WITH_ANOTHER_TOKEN;
    }
    return null;
  };

  const failureWhenNothingListens = (): Error => {
    const failure = answerOf<RecordedFetchFailure>(HEPHAESTUS_CALL_SHAPES.NOTHING_LISTENS);
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
        requests.push({ ...request, callShape: HEPHAESTUS_CALL_SHAPES.NOTHING_LISTENS });
        return Promise.reject(failureWhenNothingListens());
      }
      const host = headers.get('host');
      const origin = headers.get('origin');
      let callShape: HephaestusCallShape | null;
      if (host !== null && !LOOPBACK_NAMES.some((name) => host === `${name}:${port}`)) callShape = HEPHAESTUS_CALL_SHAPES.FOREIGN_HOST;
      else if ((origin !== null && !ownOrigins.includes(origin)) || method === 'OPTIONS') callShape = HEPHAESTUS_CALL_SHAPES.FOREIGN_ORIGIN;
      else callShape = routedShapeOf(method, target.pathname, headers);
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
    stop: () => {
      listening = false;
    },
    startOnGivenPort: (givenPort) => {
      if (givenPort !== port || !listening) return;
      const refusal = answerOf<RecordedPortRefusal>(HEPHAESTUS_CALL_SHAPES.PORT_TAKEN);
      throw Object.assign(new Error(`${refusal.status}: ${JSON.stringify(refusal.detail)}`), refusal);
    },
    takeUnansweredCalls: () => unansweredCalls.splice(0),
  };
}
