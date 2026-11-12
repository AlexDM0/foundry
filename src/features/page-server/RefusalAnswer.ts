/** Every refusal the page server answers, mapped to its HTTP status and its sentence in exactly this one place. */
export type PageServerRefusal =
  | 'foreign-host'
  | 'foreign-origin'
  | 'opaque-origin'
  | 'preflight'
  | 'not-holder-of-token'
  | 'no-session'
  | 'code-refused'
  | 'body-not-understood'
  | 'not-found'
  | 'method-not-allowed'
  | 'page-unbuildable'
  | 'answer-failed';

const HTTP_STATUS = {
  badRequest:          400,
  unauthorized:        401,
  forbidden:           403,
  notFound:            404,
  methodNotAllowed:    405,
  internalServerError: 500,
} as const;

interface RefusalAnswer {
  readonly status:   number;
  readonly sentence: string;
}

const REFUSAL_ANSWERS: Readonly<Record<PageServerRefusal, RefusalAnswer>> = {
  'foreign-host':        { status: HTTP_STATUS.forbidden, sentence: 'Gaia answers only requests addressed to its own loopback address and port.' },
  'foreign-origin':      { status: HTTP_STATUS.forbidden, sentence: 'Gaia answers no page of another origin.' },
  'opaque-origin':       { status: HTTP_STATUS.forbidden, sentence: 'Gaia answers no page without an origin of its own.' },
  'preflight':           { status: HTTP_STATUS.forbidden, sentence: 'Gaia grants no cross-origin request.' },
  'not-holder-of-token': { status: HTTP_STATUS.unauthorized, sentence: 'This route needs Gaia\'s token.' },
  'no-session':          { status: HTTP_STATUS.unauthorized, sentence: 'This route needs a session of Gaia\'s page.' },
  'code-refused':        { status: HTTP_STATUS.unauthorized, sentence: 'The session code is spent, past its life or never issued.' },
  'body-not-understood': { status: HTTP_STATUS.badRequest, sentence: 'Gaia did not understand the request\'s body.' },
  'not-found':           { status: HTTP_STATUS.notFound, sentence: 'Gaia has nothing at this address.' },
  'method-not-allowed':  { status: HTTP_STATUS.methodNotAllowed, sentence: 'Gaia answers this address with another method.' },
  'page-unbuildable':    { status: HTTP_STATUS.internalServerError, sentence: 'Gaia could not build its page.' },
  'answer-failed':       { status: HTTP_STATUS.internalServerError, sentence: 'Gaia failed to answer this request.' },
};

const PLAIN_TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

export function refusalAnswerOf(refusal: PageServerRefusal): Response {
  const { status, sentence } = REFUSAL_ANSWERS[refusal];
  return new Response(`${sentence}\n`, { status, headers: { 'content-type': PLAIN_TEXT_CONTENT_TYPE } });
}
